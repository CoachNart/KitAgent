import admin from 'firebase-admin';
import fs from 'node:fs';
import supportHandler from '../server/support.js';

function getAdmin(){
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(raw){
    try{
      admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});
      return admin;
    }catch(error){console.error('Firebase Admin initialization failed:',error);}
  }
  if(credentialPath&&fs.existsSync(credentialPath)){
    admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});
    return admin;
  }
  const error=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');error.code=error.message;throw error;
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

export default async function handler(req,res){
  if(String(req.query?.support||'')==='1')return supportHandler(req,res);
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{error:'Enter the email address used for your KitSetups account.'});
    const a=getAdmin(),db=a.firestore(),requestRef=db.collection('accountDeletionRequests').doc();
    await requestRef.set({email,status:'pending',source:'public-web-form',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    return json(res,200,{ok:true,message:'Your request has been received. The KitSetups team will review it and process the account and associated data deletion request.'});
  }catch(error){
    if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Account deletion requests are temporarily unavailable. Please try again later.'});
    console.error('request-account-deletion failed',error);
    return json(res,500,{error:'Your deletion request could not be submitted. Please try again later.'});
  }
}
