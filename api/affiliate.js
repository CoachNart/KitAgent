import admin from 'firebase-admin';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DEFAULT_RATE_BPS=1000;
const PAYOUT_MINIMUM_USD=20;
const PAYOUT_SCHEDULE='monthly';

function getAdmin(){
 if(admin.apps.length)return admin;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
 if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});return admin}
 if(credentialPath&&fs.existsSync(credentialPath)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});return admin}
 const e=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');e.code=e.message;throw e;
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
function rateBps(){const n=Number(process.env.AFFILIATE_COMMISSION_BPS||DEFAULT_RATE_BPS);return Number.isFinite(n)&&n>=0&&n<=10000?Math.floor(n):DEFAULT_RATE_BPS}
function cleanCode(v){return String(v||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24)}
function makeCode(email){const base=String(email||'KITSETUOP').split('@')[0].toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||'KITSETUOP';return `KITSETUOP-${base}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0,24)}
async function authUser(a,req){const header=String(req.headers.authorization||'');const token=header.startsWith('Bearer ')?header.slice(7):'';if(!token)return null;try{return await a.auth().verifyIdToken(token)}catch{return null}}

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 try{
  const a=getAdmin(),decoded=await authUser(a,req);if(!decoded)return json(res,401,{error:'Authentication required.'});
  const db=a.firestore(),userRef=db.collection('users').doc(decoded.uid),userSnap=await userRef.get();if(!userSnap.exists)return json(res,404,{error:'KitSetuop account not found.'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),action=String(body.action||'dashboard').toLowerCase();
  if(action==='register'){
   const existing=await db.collection('affiliates').where('userId','==',decoded.uid).limit(1).get();
   if(!existing.empty){const data=existing.docs[0].data();return json(res,200,{affiliate:true,referralCode:data.referralCode,commissionRateBps:data.commissionRateBps||rateBps(),payoutMinimumUsd:PAYOUT_MINIMUM_USD,payoutSchedule:PAYOUT_SCHEDULE,status:data.status||'active'})}
   let code=cleanCode(body.referralCode)||makeCode(decoded.email);
   if(code.length<4)code=makeCode(decoded.email);
   const collision=await db.collection('affiliates').where('referralCode','==',code).limit(1).get();if(!collision.empty)return json(res,409,{error:'That referral code is already in use. Choose another.'});
   const now=admin.firestore.FieldValue.serverTimestamp(),ref=db.collection('affiliates').doc();
   await ref.set({userId:decoded.uid,email:decoded.email||'',referralCode:code,status:'active',commissionRateBps:rateBps(),payoutMinimumUsd:PAYOUT_MINIMUM_USD,payoutSchedule:PAYOUT_SCHEDULE,totalEarned:0,availableBalance:0,pendingBalance:0,createdAt:now,updatedAt:now});
   return json(res,200,{affiliate:true,referralCode:code,commissionRateBps:rateBps(),payoutMinimumUsd:PAYOUT_MINIMUM_USD,payoutSchedule:PAYOUT_SCHEDULE,status:'active'});
  }
  const affiliateSnap=await db.collection('affiliates').where('userId','==',decoded.uid).limit(1).get();
  if(affiliateSnap.empty)return json(res,200,{affiliate:false});
  const affiliate=affiliateSnap.docs[0],data=affiliate.data();
  const commissions=await db.collection('affiliateCommissions').where('affiliateId','==',affiliate.id).limit(100).get();
  const rows=commissions.docs.map(d=>({id:d.id,...d.data()}));
  return json(res,200,{affiliate:true,referralCode:data.referralCode,commissionRateBps:data.commissionRateBps||rateBps(),payoutMinimumUsd:Number(data.payoutMinimumUsd||PAYOUT_MINIMUM_USD),payoutSchedule:data.payoutSchedule||PAYOUT_SCHEDULE,status:data.status||'active',totalEarned:Number(data.totalEarned||0),availableBalance:Number(data.availableBalance||0),pendingBalance:Number(data.pendingBalance||0),commissions:rows});
 }catch(error){if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.'});console.error('affiliate failed',error);return json(res,500,{error:'Affiliate request could not be completed.'})}
}
