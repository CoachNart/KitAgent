import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin(){
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(raw){
    try{
      admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['"]|['"]$/g,'')))});
      return admin;
    }catch(error){console.error('[support] invalid FIREBASE_SERVICE_ACCOUNT_JSON',error?.message)}
  }
  if(credentialPath&&fs.existsSync(credentialPath)){
    admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});
    return admin;
  }
  const e=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');
  e.code=e.message;
  throw e;
}

function json(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(body));
}

function csvEnv(name){
  return String(process.env[name]||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
}

function isAdmin(decoded){
  if(decoded?.admin===true)return true;
  const uids=csvEnv('KITSETUPS_ADMIN_UIDS');
  const emails=csvEnv('KITSETUPS_ADMIN_EMAILS');
  const ownerEmail='03nart@gmail.com';
  return (decoded?.uid&&uids.includes(String(decoded.uid).toLowerCase())) ||
    (decoded?.email&&emails.includes(String(decoded.email).toLowerCase())) ||
    String(decoded?.email||'').toLowerCase()===ownerEmail;
}

async function authenticate(req){
  const a=getAdmin();
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return {a,error:[401,'Authentication required.']};
  try{
    const decoded=await a.auth().verifyIdToken(token);
    return {a,decoded};
  }catch(error){
    console.error('[support] token verification failed',error?.message);
    return {a,error:[401,'Authentication token could not be verified.']};
  }
}

function cleanText(value,max){
  return String(value??'').trim().slice(0,max);
}

function stampValue(value){
  if(!value)return null;
  if(typeof value.toDate==='function')return value.toDate().toISOString();
  if(typeof value.toMillis==='function')return new Date(value.toMillis()).toISOString();
  if(value instanceof Date)return value.toISOString();
  return value;
}

function normalizeMessage(snapshot){
  const data=snapshot.data()||{};
  return {id:snapshot.id,...data,createdAt:stampValue(data.createdAt),readAt:stampValue(data.readAt)};
}

function normalizeChat(snapshot){
  const data=snapshot.data()||{};
  return {id:snapshot.id,...data,createdAt:stampValue(data.createdAt),updatedAt:stampValue(data.updatedAt),lastMessageAt:stampValue(data.lastMessageAt)};
}

export default async function handler(req,res){
  try{
    const {a,decoded,error}=await authenticate(req);
    if(error)return json(res,error[0],{error:error[1]});
    const db=a.firestore();

    if(req.method==='GET'){
      const adminMode=String(req.query?.admin||'')==='1';
      if(adminMode&&!isAdmin(decoded))return json(res,403,{error:'Admin access is required.'});

      if(adminMode){
        const snap=await db.collection('supportChats').orderBy('updatedAt','desc').limit(100).get();
        const chats=[];
        for(const chat of snap.docs){
          const data=chat.data()||{};
          const messages=await chat.ref.collection('messages').orderBy('createdAt','desc').limit(1).get();
          chats.push({...normalizeChat(chat),latestMessage:messages.empty?null:normalizeMessage(messages.docs[0])});
        }
        return json(res,200,{admin:true,chats});
      }

      const chatSnap=await db.collection('supportChats').where('userId','==',decoded.uid).limit(20).get();
      const chats=[];
      for(const chat of chatSnap.docs.sort((a,b)=>(b.data()?.updatedAt?.toMillis?.()||0)-(a.data()?.updatedAt?.toMillis?.()||0))){
        const messages=await chat.ref.collection('messages').orderBy('createdAt','asc').limit(200).get();
        chats.push({...normalizeChat(chat),messages:messages.docs.map(normalizeMessage)});
      }
      return json(res,200,{chats});
    }

    if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=cleanText(body.action,30);

    if(action==='create'){
      const subject=cleanText(body.subject,120);
      const category=cleanText(body.category,60)||'Other';
      const message=cleanText(body.message,5000);
      if(!subject)return json(res,400,{error:'Please enter a subject.'});
      if(message.length<10)return json(res,400,{error:'Please describe the issue in at least 10 characters.'});

      const userRecord=await a.auth().getUser(decoded.uid);
      const now=admin.firestore.FieldValue.serverTimestamp();
      const chatRef=db.collection('supportChats').doc();
      const ticketRef=db.collection('users').doc(decoded.uid).collection('supportTickets').doc();
      const batch=db.batch();

      batch.set(chatRef,{
        userId:decoded.uid,
        userName:userRecord.displayName||'KitSetups member',
        userEmail:userRecord.email||'',
        userPhoto:userRecord.photoURL||'',
        subject,
        category,
        status:'open',
        lastMessage:message,
        lastSender:'user',
        lastMessageAt:now,
        unreadForSupport:true,
        unreadForUser:false,
        createdAt:now,
        updatedAt:now
      });
      batch.set(chatRef.collection('messages').doc(),{
        senderId:decoded.uid,
        senderType:'user',
        text:message,
        createdAt:now,
        readAt:null
      });
      batch.set(ticketRef,{
        uid:decoded.uid,
        email:userRecord.email||'',
        displayName:userRecord.displayName||'KitSetups member',
        subject,
        category,
        message,
        status:'open',
        chatId:chatRef.id,
        createdAt:now
      });
      await batch.commit();
      return json(res,201,{created:true,chatId:chatRef.id});
    }

    if(action==='message'){
      const chatId=cleanText(body.chatId,128);
      const text=cleanText(body.message,5000);
      if(!chatId)return json(res,400,{error:'Support conversation is missing.'});
      if(text.length<1)return json(res,400,{error:'Enter a message.'});
      const chatRef=db.collection('supportChats').doc(chatId);
      const chat=await chatRef.get();
      if(!chat.exists||chat.data()?.userId!==decoded.uid)return json(res,404,{error:'Support conversation not found.'});
      if(chat.data()?.status==='resolved')return json(res,409,{error:'This conversation is resolved. Start a new conversation.'});
      const now=admin.firestore.FieldValue.serverTimestamp();
      const batch=db.batch();
      batch.set(chatRef.collection('messages').doc(),{senderId:decoded.uid,senderType:'user',text,createdAt:now,readAt:null});
      batch.update(chatRef,{lastMessage:text,lastSender:'user',lastMessageAt:now,updatedAt:now,status:'open',unreadForSupport:true,unreadForUser:false});
      await batch.commit();
      return json(res,201,{sent:true});
    }

    if(action==='admin-message'){
      if(!isAdmin(decoded))return json(res,403,{error:'Admin access is required.'});
      const chatId=cleanText(body.chatId,128);
      const text=cleanText(body.message,5000);
      if(!chatId||!text)return json(res,400,{error:'Conversation and message are required.'});
      const chatRef=db.collection('supportChats').doc(chatId);
      const chat=await chatRef.get();
      if(!chat.exists)return json(res,404,{error:'Support conversation not found.'});
      const now=admin.firestore.FieldValue.serverTimestamp();
      const batch=db.batch();
      batch.set(chatRef.collection('messages').doc(),{senderId:decoded.uid,senderType:'support',text,createdAt:now,readAt:null});
      batch.update(chatRef,{lastMessage:text,lastSender:'support',lastMessageAt:now,updatedAt:now,status:'open',unreadForSupport:false,unreadForUser:true});
      await batch.commit();
      return json(res,201,{sent:true});
    }

    if(action==='read'){
      const chatId=cleanText(body.chatId,128);
      const chatRef=db.collection('supportChats').doc(chatId);
      const chat=await chatRef.get();
      if(!chat.exists)return json(res,404,{error:'Support conversation not found.'});
      const data=chat.data()||{};
      if(data.userId!==decoded.uid&&!isAdmin(decoded))return json(res,403,{error:'Not authorized.'});
      await chatRef.update(isAdmin(decoded)?{unreadForSupport:false}:{unreadForUser:false});
      return json(res,200,{read:true});
    }

    if(action==='resolve'){
      if(!isAdmin(decoded))return json(res,403,{error:'Admin access is required.'});
      const chatId=cleanText(body.chatId,128);
      const chatRef=db.collection('supportChats').doc(chatId);
      const chat=await chatRef.get();
      if(!chat.exists)return json(res,404,{error:'Support conversation not found.'});
      await chatRef.update({status:'resolved',updatedAt:admin.firestore.FieldValue.serverTimestamp(),unreadForSupport:false});
      return json(res,200,{resolved:true});
    }

    return json(res,400,{error:'Unknown support action.'});
  }catch(error){
    console.error('[support] request failed',error);
    if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.'});
    return json(res,500,{error:'Support service could not complete the request.'});
  }
}
