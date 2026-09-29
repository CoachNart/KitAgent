import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin(){
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});return admin}
  if(credentialPath&&fs.existsSync(credentialPath)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});return admin}
  const e=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');e.code=e.message;throw e
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
function canonicalEmail(value){const email=String(value||'').trim().toLowerCase();const [local,domain]=email.split('@');if(!local||!domain)return email;if(domain==='gmail.com'||domain==='googlemail.com')return `${local.split('+')[0].replace(/\./g,'')}@gmail.com`;return email}
function cleanReferralCode(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24)}
async function verifyAppCheck(a,req){const token=String(req.headers['x-firebase-appcheck']||'').trim();if(!token)return false;try{await a.appCheck().verifyToken(token);return true}catch(error){console.warn('Firebase App Check verification failed:',error?.message||error);return false}}

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 try{
  const a=getAdmin();
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const email=String(body.email||'').trim().toLowerCase();
  const password=String(body.password||'');
  const deviceId=String(body.deviceId||'').trim().toLowerCase();
  const referralCode=cleanReferralCode(body.referralCode);
  const deviceFingerprint=String(body.deviceFingerprint||'').trim().toLowerCase();
  const deviceProfile=body.deviceProfile&&typeof body.deviceProfile==='object'?body.deviceProfile:{};

  if(req.headers['x-firebase-appcheck'])await verifyAppCheck(a,req);
  if(!/^\S+@\S+\.\S+$/.test(email))return json(res,400,{error:'Enter a valid email address.',code:'INVALID_EMAIL'});
  if(password.length<6)return json(res,400,{error:'Use a stronger password (at least 6 characters).',code:'WEAK_PASSWORD'});
  if(!/^[a-f0-9]{64}$/.test(deviceId)||!/^[a-f0-9]{64}$/.test(deviceFingerprint))return json(res,400,{error:'Invalid device binding.',code:'DEVICE_ID_INVALID'});

  const db=a.firestore();
  let affiliateRef=null;
  if(referralCode){
   const affiliateQuery=await db.collection('affiliates').where('referralCode','==',referralCode).limit(1).get();
   if(!affiliateQuery.empty){const candidate=affiliateQuery.docs[0];if(candidate.data()?.status==='active')affiliateRef={id:candidate.id,referralCode}}
  }

  // Exact device identifiers are strong enough to stop a second account on the same
  // registered device. Do not block based on IP/network: families, offices, schools,
  // mobile carriers and shared Wi-Fi legitimately put many users behind one IP.
  const deviceRef=db.collection('deviceBindings').doc(deviceId);
  const existingDevice=await deviceRef.get();
  if(existingDevice.exists&&existingDevice.data()?.uid){
   const boundUid=String(existingDevice.data().uid);
   let boundUserExists=true;
   try{await a.auth().getUser(boundUid)}
   catch(error){if(error?.code==='auth/user-not-found')boundUserExists=false;else throw error}
   if(boundUserExists)return json(res,409,{error:'This device is already registered to another KitSetups account. Sign in instead.',code:'DEVICE_ALREADY_REGISTERED'});
   await deviceRef.delete().catch(()=>{});
  }

  // A browser/device profile is intentionally not used as a hard identity match.
  // Common values such as OS, screen size, timezone and CPU count collide across
  // legitimate users and were causing false-positive first-time signup blocks.
  const canonical=canonicalEmail(email);
  const lockRef=db.collection('accountIdentityLocks').doc(encodeURIComponent(canonical));
  const existingLock=await lockRef.get();
  if(existingLock.exists){
   const lockedUid=String(existingLock.data()?.uid||'');
   let lockedUserExists=Boolean(lockedUid);
   if(lockedUid){
    try{await a.auth().getUser(lockedUid)}
    catch(error){if(error?.code==='auth/user-not-found')lockedUserExists=false;else throw error}
   }
   if(lockedUserExists)return json(res,409,{error:'An account already exists for this email identity. Sign in instead.',code:'ACCOUNT_ALREADY_EXISTS'});
   await lockRef.delete().catch(()=>{});
  }

  try{
   const existingUser=await a.auth().getUserByEmail(email);
   if(existingUser)return json(res,409,{error:'An account already exists with this email. Sign in instead.',code:'ACCOUNT_ALREADY_EXISTS'})
  }catch(error){if(error?.code!=='auth/user-not-found')throw error}

  const reservation={email,canonicalEmail:canonical,createdAt:admin.firestore.FieldValue.serverTimestamp(),status:'reserved'};
  try{
   await db.runTransaction(async tx=>{
    const snap=await tx.get(lockRef);
    if(snap.exists){const e=new Error('ACCOUNT_ALREADY_EXISTS');e.code=e.message;throw e}
    tx.create(lockRef,reservation);
   })
  }catch(error){
   if(error?.code==='ACCOUNT_ALREADY_EXISTS')return json(res,409,{error:'An account already exists for this email identity. Sign in instead.',code:error.code});
   throw error
  }

  let userRecord;
  try{
   userRecord=await a.auth().createUser({email,password,emailVerified:false});
   const now=new Date();
   const trialEndsAt=new Date(now.getTime()+3*24*60*60*1000);
   const profile={uid:userRecord.uid,email,status:'active',plan:'free',trialStartedAt:now,trialEndsAt,createdAt:now,updatedAt:admin.firestore.FieldValue.serverTimestamp()};
   if(affiliateRef){
    profile.affiliate={affiliateId:affiliateRef.id,referralCode:affiliateRef.referralCode,attributedAt:now,status:'attributed'};
    await db.collection('referrals').doc(userRecord.uid).set({referredUserId:userRecord.uid,affiliateId:affiliateRef.id,referralCode:affiliateRef.referralCode,status:'attributed',signupAt:admin.firestore.FieldValue.serverTimestamp(),createdAt:admin.firestore.FieldValue.serverTimestamp()});
   }
   await db.collection('users').doc(userRecord.uid).set(profile,{merge:true});
   await deviceRef.set({uid:userRecord.uid,deviceFingerprint,...deviceProfile,lastSeenAt:admin.firestore.FieldValue.serverTimestamp(),createdAt:admin.firestore.FieldValue.serverTimestamp(),version:5},{merge:true});
   await lockRef.set({uid:userRecord.uid,status:'active',updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  }catch(error){
   await lockRef.delete().catch(()=>{});
   await db.collection('users').doc(userRecord?.uid||'invalid').delete().catch(()=>{});
   await db.collection('referrals').doc(userRecord?.uid||'invalid').delete().catch(()=>{});
   if(error?.code==='auth/email-already-exists')return json(res,409,{error:'An account already exists with this email. Sign in instead.',code:'ACCOUNT_ALREADY_EXISTS'});
   throw error
  }

  const customToken=await a.auth().createCustomToken(userRecord.uid);
  return json(res,200,{customToken,uid:userRecord.uid});
 }catch(error){
  if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.',code:error.code});
  console.error('register-account failed',error);
  return json(res,500,{error:'Account creation could not be completed.',code:'ACCOUNT_REGISTRATION_FAILED'})
 }
}
