import admin from 'firebase-admin';
import fs from 'node:fs';

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    if (raw) {
      const serviceAccount = JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g, ''));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return admin;
    }
    if (credentialPath && fs.existsSync(credentialPath)) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) });
      return admin;
    }
    const error = new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING'); error.code = error.message; throw error;
  } catch (error) {
    if (error?.code === 'FIREBASE_ADMIN_CREDENTIALS_MISSING') throw error;
    const wrapped = new Error('FIREBASE_ADMIN_CREDENTIALS_INVALID'); wrapped.code = wrapped.message; throw wrapped;
  }
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));}
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  try{
    const a=getAdmin();const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):'';
    if(!token)return json(res,401,{error:'Authentication required.',code:'AUTH_TOKEN_MISSING'});
    let decoded;try{decoded=await a.auth().verifyIdToken(token)}catch{return json(res,401,{error:'Authentication token could not be verified.',code:'AUTH_TOKEN_INVALID'})}
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const deviceId=body.deviceId;const deviceFingerprint=String(body.deviceFingerprint||'').trim().toLowerCase();const deviceProfile=body.deviceProfile&&typeof body.deviceProfile==='object'?body.deviceProfile:{};
    if(!/^[a-f0-9]{64}$/.test(deviceId||'')||!/^[a-f0-9]{64}$/.test(deviceFingerprint))return json(res,400,{error:'Invalid device binding.',code:'DEVICE_ID_INVALID'});
    const db=a.firestore(),deviceRef=db.collection('deviceBindings').doc(deviceId),userRef=db.collection('users').doc(decoded.uid);const profile={osFamily:String(deviceProfile.osFamily||''),language:String(deviceProfile.language||''),timezone:String(deviceProfile.timezone||''),hardwareConcurrency:Number(deviceProfile.hardwareConcurrency)||0,deviceMemory:Number(deviceProfile.deviceMemory)||0,screenWidth:Number(deviceProfile.screenWidth)||0,screenHeight:Number(deviceProfile.screenHeight)||0,availWidth:Number(deviceProfile.availWidth)||0,availHeight:Number(deviceProfile.availHeight)||0,colorDepth:Number(deviceProfile.colorDepth)||0,pixelRatio:Number(deviceProfile.pixelRatio)||0,maxTouchPoints:Number(deviceProfile.maxTouchPoints)||0};

    const existingDevice=await deviceRef.get();const candidateQuery=profile.osFamily?await db.collection('deviceBindings').where('osFamily','==',profile.osFamily).limit(100).get():{empty:true,docs:[]};for(const candidate of candidateQuery.docs){const data=candidate.data()||{};const uid=String(data.uid||'');if(!uid||uid===decoded.uid)continue;const score=(data.osFamily===profile.osFamily?3:0)+(data.timezone&&data.timezone===profile.timezone?2:0)+(Number(data.hardwareConcurrency)===profile.hardwareConcurrency&&profile.hardwareConcurrency?2:0)+(Number(data.maxTouchPoints)===profile.maxTouchPoints?2:0)+(((Number(data.screenWidth)===profile.screenWidth&&Number(data.screenHeight)===profile.screenHeight)||(Number(data.screenWidth)===profile.screenHeight&&Number(data.screenHeight)===profile.screenWidth))?3:0)+(Number(data.availWidth)===profile.availWidth&&Number(data.availHeight)===profile.availHeight&&profile.availWidth?1:0)+(Math.abs(Number(data.pixelRatio)-profile.pixelRatio)<0.01&&profile.pixelRatio?2:0)+(Number(data.colorDepth)===profile.colorDepth&&profile.colorDepth?1:0)+(Number(data.deviceMemory)===profile.deviceMemory&&profile.deviceMemory?1:0);if(score>=13){try{await a.auth().getUser(uid);return json(res,409,{error:'This device is already registered to another KitSetups account.',code:'DEVICE_ALREADY_REGISTERED'})}catch(error){if(error?.code!=='auth/user-not-found')throw error;}}}
    let staleOwnerUid=null;
    if(existingDevice.exists){
      const owner=existingDevice.data()?.uid;
      if(owner&&owner!==decoded.uid){
        try{await a.auth().getUser(owner)}
        catch(error){if(error?.code==='auth/user-not-found')staleOwnerUid=owner;else throw error}
      }
    }

    await db.runTransaction(async tx=>{
      const deviceSnap=await tx.get(deviceRef),userSnap=await tx.get(userRef);
      const device=deviceSnap.exists?deviceSnap.data():null;
      const user=userSnap.exists?userSnap.data():null;
      const stale=device?.uid&&device.uid!==decoded.uid&&device.uid===staleOwnerUid;
      if(device?.uid&&device.uid!==decoded.uid&&!stale){const e=new Error('DEVICE_ALREADY_REGISTERED');e.code=e.message;throw e}
      if(user?.securitySettings?.deviceBindingId&&user.securitySettings.deviceBindingId!==deviceId){const e=new Error('ACCOUNT_ALREADY_BOUND');e.code=e.message;throw e}

      const deviceData={uid:decoded.uid,deviceFingerprint,...profile,lastSeenAt:a.firestore.FieldValue.serverTimestamp(),version:4};
      if(!deviceSnap.exists||stale)tx.set(deviceRef,{...deviceData,createdAt:a.firestore.FieldValue.serverTimestamp()},{merge:true});
      else tx.update(deviceRef,{lastSeenAt:deviceData.lastSeenAt,deviceFingerprint});

      if(userSnap.exists){
        const security={...(user.securitySettings||{}),deviceBindingId:deviceId};
        const patch={securitySettings:security,updatedAt:a.firestore.FieldValue.serverTimestamp()};
        // Never restart an existing trial. Repair dates only when they are genuinely absent.
        if(!user.trialStartedAt||!user.trialEndsAt){const nowMs=Date.now();patch.trialStartedAt=new Date(nowMs);patch.trialEndsAt=new Date(nowMs+3*86400000)}
        tx.update(userRef,patch);
      }else{
        const nowMs=Date.now(),now=new Date(nowMs),end=new Date(nowMs+3*86400000);
        tx.create(userRef,{uid:decoded.uid,email:decoded.email||'',displayName:decoded.name||'',photoURL:decoded.picture||'',status:'active',plan:'free',monthlyUsage:{used:0,limit:0},subscription:{name:'Premium',price:20,currency:'USD',billingPeriod:'month',accessDays:30,features:['Unlimited setups','Live intelligence'],paymentAsset:'USDT',paymentNetwork:'BNB Chain',paymentAddress:'0x1c35bf9d920e1b5d7e7e37ce1d15a1b9500f8474'},api:{status:'coming_soon'},securitySettings:{deviceBindingId:deviceId},trialStartedAt:now,trialEndsAt:end,createdAt:a.firestore.FieldValue.serverTimestamp(),updatedAt:a.firestore.FieldValue.serverTimestamp()});
      }
    });
    return json(res,200,{allowed:true,deviceId});
  }catch(error){
    if(error?.code==='DEVICE_ALREADY_REGISTERED')return json(res,409,{error:'This device is already registered to another KitAgent account.',code:error.code});
    if(error?.code==='ACCOUNT_ALREADY_BOUND')return json(res,409,{error:'This account is already bound to another device.',code:error.code});
    if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.',code:error.code});
    if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_INVALID')return json(res,500,{error:'Firebase Admin credentials are invalid.',code:error.code});
    console.error('register-device failed',error);return json(res,500,{error:'Device registration could not be completed.',code:'DEVICE_REGISTRATION_FAILED'});
  }
}
