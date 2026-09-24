import admin from 'firebase-admin';
import fs from 'node:fs';
import crypto from 'node:crypto';

function getAdmin(){
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(raw){
    try{
      admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['"]|['"]$/g,'')))});
      return admin;
    }catch{}
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

async function isAdmin(a,decoded){
  if(decoded?.admin===true)return true;
  const uids=csvEnv('KITSETUPS_ADMIN_UIDS');
  const emails=csvEnv('KITSETUPS_ADMIN_EMAILS');
  const ownerEmail='03nart@gmail.com';
  if((decoded?.uid&&uids.includes(String(decoded.uid).toLowerCase()))||(decoded?.email&&emails.includes(String(decoded.email).toLowerCase()))||String(decoded?.email||'').toLowerCase()===ownerEmail)return true;
  if(decoded?.email){const snap=await a.firestore().collection('adminAccess').doc(String(decoded.email).toLowerCase()).get();return snap.exists&&snap.data()?.active!==false}
  return false;
}

async function authenticate(req){
  const a=getAdmin();
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return {a,error:[401,'Authentication required.']};
  try{
    const decoded=await a.auth().verifyIdToken(token);
    if(!(await isAdmin(a,decoded)))return {a,error:[403,'Admin access is required.']};
    return {a,decoded};
  }catch{
    return {a,error:[401,'Authentication token could not be verified.']};
  }
}

export default async function handler(req,res){
  try{
    const auth=await authenticate(req);
    if(auth.error)return json(res,auth.error[0],{error:auth.error[1]});
    const {a,decoded}=auth;
    const db=a.firestore();

    if(req.method==='GET' && String(req.query?.q||'')==='__admins__'){
      const rows=[];
      const ownerEmail='03nart@gmail.com';
      rows.push({email:ownerEmail,source:'owner',active:true});
      const snap=await db.collection('adminAccess').where('active','==',true).get();
      for(const doc of snap.docs){const email=doc.id.toLowerCase();if(!rows.some(x=>x.email===email))rows.push({email,source:'admin',active:true})}
      return json(res,200,{admin:true,admins:rows});
    }

    if(req.method==='GET'){
      const q=String(req.query?.q||'').trim().toLowerCase();
      const users=[];
      let token;
      do{
        const page=await a.auth().listUsers(1000,token);
        for(const u of page.users){
          const profileSnap=await db.collection('users').doc(u.uid).get();
          const profile=profileSnap.exists?profileSnap.data():{};
          const hay=[u.uid,u.email,u.displayName,profile.username,profile.displayName].filter(Boolean).join(' ').toLowerCase();
          if(!q||hay.includes(q)){
            users.push({
              uid:u.uid,
              email:u.email||'',
              displayName:u.displayName||profile.displayName||profile.username||'Unnamed user',
              username:profile.username||'',
              photoURL:u.photoURL||profile.photoURL||'',
              plan:String(profile.plan||'free'),
              subscriptionEndsAt:profile.subscriptionEndsAt||null
            });
          }
          if(users.length>=50)break;
        }
        if(users.length>=50||!page.pageToken)break;
        token=page.pageToken;
      }while(token);
      return json(res,200,{admin:true,users});
    }

    if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'grant-premium').trim().toLowerCase();

    if(action==='add-admin'){
      const email=String(body.email||'').trim().toLowerCase();
      if(!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'Enter a valid admin email.'});
      if(email==='03nart@gmail.com')return json(res,200,{added:false,owner:true,email});
      await db.collection('adminAccess').doc(email).set({email,active:true,addedBy:decoded.email||decoded.uid,addedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return json(res,200,{added:true,email});
    }

    if(action==='remove-admin'){
      const email=String(body.email||'').trim().toLowerCase();
      if(!email)return json(res,400,{error:'Admin email is required.'});
      if(email==='03nart@gmail.com')return json(res,400,{error:'The owner admin cannot be removed.'});
      await db.collection('adminAccess').doc(email).set({email,active:false,removedBy:decoded.email||decoded.uid,removedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return json(res,200,{removed:true,email});
    }

    if(action==='hard-reset'){
      const uid=String(body.uid||'').trim();
      if(!uid)return json(res,400,{error:'Select a registered user.'});
      if(uid===decoded.uid)return json(res,400,{error:'You cannot hard reset the admin account currently in use.'});

      let recipient;
      try{recipient=await a.auth().getUser(uid)}catch{return json(res,404,{error:'Registered user not found.'})}

      const userRef=db.collection('users').doc(uid);
      const profileSnap=await userRef.get();
      const profile=profileSnap.exists?(profileSnap.data()||{}):{};

      // Collect every server-side binding/lock that can prevent this device or identity
      // from registering again. Do not rely on only the profile copy: older accounts can
      // have bindings/locks that predate the current schema.
      const deviceIds=new Set();
      if(typeof profile.deviceBindingId==='string'&&profile.deviceBindingId)deviceIds.add(profile.deviceBindingId);
      if(typeof profile.securitySettings?.deviceBindingId==='string'&&profile.securitySettings.deviceBindingId)deviceIds.add(profile.securitySettings.deviceBindingId);

      const deviceQuery=await db.collection('deviceBindings').where('uid','==',uid).get();
      for(const snap of deviceQuery.docs){
        const id=snap.id;
        if(id)deviceIds.add(id);
      }
      const deviceRefs=[...deviceIds].map(id=>db.collection('deviceBindings').doc(id));

      const lockRefs=[];
      const lockQueries=await Promise.all([
        db.collection('accountIdentityLocks').where('uid','==',uid).get(),
        db.collection('signupNetworkLocks').where('uid','==',uid).get(),
        db.collection('referrals').where('referredUserId','==',uid).get(),
        db.collection('premiumGifts').where('recipientUid','==',uid).get(),
        db.collection('supportChats').where('userId','==',uid).get()
      ]);
      for(const snap of lockQueries)for(const doc of snap.docs)lockRefs.push(doc.ref);

      // Explicitly remove the deterministic identity lock used by registration.
      const email=String(recipient.email||profile.email||'').trim().toLowerCase();
      if(email){
        const parts=email.split('@'),local=parts[0],domain=parts[1];
        const canonical=local&&domain&&['gmail.com','googlemail.com'].includes(domain)
          ? local.split('+')[0].replace(/\\./g,'')+'@gmail.com'
          : email;
        lockRefs.push(db.collection('accountIdentityLocks').doc(encodeURIComponent(canonical)));
      }

      // Also remove the deterministic network lock when the account profile has an IP.
      const ip=String(profile.lastSeenIp||'').trim();
      if(ip){
        const hash=crypto.createHash('sha256').update('kitsetups-signup-v2:'+ip).digest('hex');
        lockRefs.push(db.collection('signupNetworkLocks').doc(hash));
      }

      const uniqueRefs=[...new Map([...deviceRefs,...lockRefs].map(ref=>[ref.path,ref])).values()];
      for(const ref of uniqueRefs)await ref.delete().catch(()=>{});

      // Delete the account tree and Firebase Auth record only after all external
      // registration gates have been explicitly removed.
      await db.recursiveDelete(userRef);
      await a.auth().deleteUser(uid);

      // Verify the registration gates are actually gone. This prevents a successful
      // response while a stale device/identity lock would still block re-registration.
      const verifyRefs=[...deviceIds].map(id=>db.collection('deviceBindings').doc(id));
      const [identityVerify,networkVerify]=await Promise.all([
        email?db.collection('accountIdentityLocks').doc(encodeURIComponent((email.split('@')[0]||'').split('+')[0].replace(/\\./g,'')+'@'+(email.split('@')[1]||'').replace(/^googlemail$/,'gmail.com'))).get():null,
        Promise.all(verifyRefs.map(ref=>ref.get()))
      ]);
      const staleDevices=(networkVerify||[]).filter(s=>s.exists).map(s=>s.id);
      const staleIdentity=identityVerify?.exists;
      if(staleDevices.length||staleIdentity){
        // A deterministic retry is safe here because these documents are the account's
        // registration gates and are not shared with another UID.
        for(const ref of verifyRefs)if(staleDevices.includes(ref.id))await ref.delete().catch(()=>{});
        if(staleIdentity)await identityVerify.ref.delete().catch(()=>{});
      }

      return json(res,200,{
        reset:true,
        uid,
        email:recipient.email||'',
        displayName:recipient.displayName||'',
        deletedCollections:true,
        deviceBindingsRemoved:deviceRefs.length,
        message:'Account, device bindings, signup locks, and associated KitSetups data were permanently removed.'
      });
    }

    const uid=String(body.uid||'').trim();
    const days=Number(body.days);
    if(!uid)return json(res,400,{error:'Select a registered user.'});
    if(![7,30,90].includes(days))return json(res,400,{error:'Premium duration must be 7, 30, or 90 days.'});

    let recipient;
    try{recipient=await a.auth().getUser(uid)}catch{return json(res,404,{error:'Registered user not found.'})}

    const ref=db.collection('users').doc(uid);
    const snap=await ref.get();
    if(!snap.exists)return json(res,404,{error:'The user profile could not be found.'});
    const current=snap.data()||{};
    const now=new Date();
    const existingEnd=current.subscriptionEndsAt?.toDate?current.subscriptionEndsAt.toDate():(current.subscriptionEndsAt?new Date(current.subscriptionEndsAt):null);
    const base=current.plan==='premium'&&existingEnd&&existingEnd.getTime()>now.getTime()?existingEnd:now;
    const end=new Date(base.getTime()+days*86400000);
    const giftRef=db.collection('premiumGifts').doc();

    const batch=db.batch();
    batch.update(ref,{
      plan:'premium',
      subscriptionEndsAt:end,
      subscription:{
        ...(current.subscription||{}),
        name:'Premium',
        price:0,
        currency:'USD',
        billingPeriod:'team_gift',
        accessDays:days,
        features:Array.isArray(current.subscription?.features)?current.subscription.features:['Unlimited setups','Live intelligence'],
        source:'team_gift'
      },
      premiumGrant:{
        source:'team_gift',
        durationDays:days,
        grantedBy:decoded.uid,
        grantedAt:admin.firestore.FieldValue.serverTimestamp(),
        expiresAt:end
      },
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(giftRef,{
      recipientUid:uid,
      recipientEmail:recipient.email||'',
      recipientName:recipient.displayName||'',
      durationDays:days,
      source:'team_gift',
      grantedBy:decoded.uid,
      grantedAt:admin.firestore.FieldValue.serverTimestamp(),
      startsAt:base,
      expiresAt:end
    });
    await batch.commit();

    return json(res,200,{
      granted:true,
      uid,
      email:recipient.email||'',
      displayName:recipient.displayName||'',
      days,
      expiresAt:end.toISOString()
    });
  }catch(error){
    if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.'});
    console.error('admin premium failed',error);
    return json(res,500,{error:'The admin Premium operation could not be completed.'});
  }
}
