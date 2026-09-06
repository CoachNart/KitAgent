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
    const deviceAccountRef=deviceRef.collection('accounts').doc(user.uid);
    const fingerprintAccountRef=fpRef.collection('accounts').doc(user.uid);
    const now=Date.now();
    await db.runTransaction(async tx=>{
      const accountSnap=await tx.get(accountRef);
      if(!accountSnap.exists){
        const trialEnds=now+3*24*60*60*1000;
        tx.set(accountRef,{uid:user.uid,email:user.email||'',createdAt:now,trialStartedAt:now,trialEndsAt:trialEnds,plan:'free',subscriptionEndsAt:null,accessStatus:'TRIAL_ACTIVE',accessExpiresAt:trialEnds});
      }else{
        tx.set(accountRef,{lastSeenAt:now,email:user.email||accountSnap.data()?.email||''},{merge:true});
      }
      // A physical device/browser may host multiple legitimate Firebase accounts.
      // Membership is keyed by UID instead of treating the device fingerprint as a singleton owner.
      tx.set(deviceAccountRef,{uid:user.uid,email:user.email||'',lastSeenAt:now,registeredAt:accountSnap.exists?accountSnap.data()?.createdAt||now:now},{merge:true});
      tx.set(fingerprintAccountRef,{uid:user.uid,lastSeenAt:now},{merge:true});
      tx.set(deviceRef,{accountCountIncrement:1,lastSeenAt:now},{merge:true});
      tx.set(fpRef,{accountCountIncrement:1,lastSeenAt:now},{merge:true});
    });
    return json(res,200,{ok:true,deviceLinked:true,multiAccount:true});
  }catch(error){
    return json(res,error?.status||500,{error:error?.message||'Security registration failed'});
  }
}
