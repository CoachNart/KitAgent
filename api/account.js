import {firestore,verifyBearer} from './_firebase.js';
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyBearer(req);const snap=await firestore().collection('kitagent_accounts').doc(user.uid).get();
    if(!snap.exists)return json(res,404,{error:'Account record not found'});
    const a=snap.data();const now=Date.now();const premium=a.plan==='premium'&&Number(a.subscriptionEndsAt||0)>now;const trial=!premium&&Number(a.trialEndsAt||0)>now;
    return json(res,200,{data:{...a,access:{status:premium?'PREMIUM_ACTIVE':trial?'TRIAL_ACTIVE':'EXPIRED',hasAccess:premium||trial,expiresAt:premium?a.subscriptionEndsAt:a.trialEndsAt,plan:premium?'premium':'free'}}});
  }catch(error){return json(res,error?.status||500,{error:error?.message||'Account lookup failed'})}
}
