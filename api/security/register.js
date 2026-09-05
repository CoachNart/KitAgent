import {firestore,verifyBearer} from '../_firebase.js';

function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}

export default async function handler(req,res){
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyBearer(req);
    const device=String(req.headers['x-kitagent-device']||'').trim();
    const fingerprint=String(req.headers['x-kitagent-fingerprint']||'').trim();
    if(device.length<32||fingerprint.length<32)return json(res,400,{error:'Security identity missing. Refresh and try again.'});
    const db=firestore();
    const deviceRef=db.collection('kitagent_devices').doc(device);
    const fpRef=db.collection('kitagent_fingerprints').doc(fingerprint);
    const accountRef=db.collection('kitagent_accounts').doc(user.uid);
    const now=Date.now();
    await db.runTransaction(async tx=>{
      const [deviceSnap,fpSnap,accountSnap]=await Promise.all([tx.get(deviceRef),tx.get(fpRef),tx.get(accountRef)]);
      if(deviceSnap.exists&&deviceSnap.data()?.uid!==user.uid)throw Object.assign(new Error('This device is already registered to another KitAgent account.'),{code:'DEVICE_TAKEN'});
      if(fpSnap.exists&&fpSnap.data()?.uid!==user.uid)throw Object.assign(new Error('This browser/device fingerprint is already linked to another account.'),{code:'FINGERPRINT_TAKEN'});
      if(!accountSnap.exists){
        const trialEnds=now+3*24*60*60*1000;
        tx.set(accountRef,{uid:user.uid,email:user.email||'',createdAt:now,trialStartedAt:now,trialEndsAt:trialEnds,plan:'free',subscriptionEndsAt:null,accessStatus:'TRIAL_ACTIVE',accessExpiresAt:trialEnds});
      }else{
        tx.set(accountRef,{lastSeenAt:now,email:user.email||accountSnap.data()?.email||''},{merge:true});
      }
      tx.set(deviceRef,{uid:user.uid,lastSeenAt:now},{merge:true});
      tx.set(fpRef,{uid:user.uid,lastSeenAt:now},{merge:true});
    });
    return json(res,200,{ok:true});
  }catch(error){
    const status=error?.code==='DEVICE_TAKEN'||error?.code==='FINGERPRINT_TAKEN'?409:error?.status||500;
    return json(res,status,{error:error?.message||'Security registration failed'});
  }
}
