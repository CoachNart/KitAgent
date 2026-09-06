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
      const [accountSnap,deviceSnap,fpSnap]=await Promise.all([
        tx.get(accountRef),
        tx.get(deviceRef),
        tx.get(fpRef)
      ]);

      const deviceData=deviceSnap.exists?deviceSnap.data():null;
      const fpData=fpSnap.exists?fpSnap.data():null;
      const registeredUid=deviceData?.uid||fpData?.uid||null;

      // Existing users may sign in repeatedly on their registered device.
      // A different Firebase UID cannot create another KitAgent account on that device.
      if(registeredUid && registeredUid!==user.uid){
        const error=new Error('This device already has a KitAgent account. Please sign in with the existing account.');
        error.status=409;
        throw error;
      }

      if(!accountSnap.exists){
        const trialEnds=now+3*24*60*60*1000;
        tx.set(accountRef,{uid:user.uid,email:user.email||'',createdAt:now,trialStartedAt:now,trialEndsAt:trialEnds,plan:'free',subscriptionEndsAt:null,accessStatus:'TRIAL_ACTIVE',accessExpiresAt:trialEnds});
      }else{
        tx.set(accountRef,{lastSeenAt:now,email:user.email||accountSnap.data()?.email||''},{merge:true});
      }

      // The device and fingerprint each have one owner UID. They are not account lists.
      tx.set(deviceRef,{uid:user.uid,email:user.email||'',firstSeenAt:deviceData?.firstSeenAt||now,lastSeenAt:now},{merge:true});
      tx.set(fpRef,{uid:user.uid,firstSeenAt:fpData?.firstSeenAt||now,lastSeenAt:now},{merge:true});
    });

    return json(res,200,{ok:true,deviceLinked:true,multiAccount:false});
  }catch(error){
    return json(res,error?.status||500,{error:error?.message||'Security registration failed'});
  }
}
