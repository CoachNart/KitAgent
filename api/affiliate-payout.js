import admin from 'firebase-admin';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, parseUnits, getAddress } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const USDT_BSC=getAddress('0x55d398326f99059ff775485246999027b3197955');
const MINIMUM_USD=20;
const PAYOUT_DECIMALS=18;
const erc20Abi=[{type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'value',type:'uint256'}],outputs:[{name:'',type:'bool'}]}];

function getAdmin(){
 if(admin.apps.length)return admin;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
 if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});return admin}
 if(credentialPath&&fs.existsSync(credentialPath)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});return admin}
 const e=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');e.code=e.message;throw e;
}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
function authorized(req){
 const secret=String(process.env.CRON_SECRET||'').trim();
 if(!secret)return false;
 const header=String(req.headers.authorization||'');
 return header===`Bearer ${secret}`||String(req.headers['x-cron-secret']||'')===secret;
}
function validWallet(v){return /^0x[a-fA-F0-9]{40}$/.test(String(v||''))}
function cents(n){return Math.floor(Number(n||0)*100+1e-8)/100}

export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(!authorized(req))return json(res,401,{error:'Unauthorized cron request.'});
 try{
  const privateKey=String(process.env.AFFILIATE_TREASURY_PRIVATE_KEY||'').trim();
  const treasury=String(process.env.AFFILIATE_TREASURY_ADDRESS||'').trim();
  if(!privateKey||!validWallet(treasury))return json(res,503,{error:'Affiliate payout treasury is not configured.'});

  const account=privateKeyToAccount(privateKey.startsWith('0x')?privateKey:`0x${privateKey}`);
  if(account.address.toLowerCase()!==treasury.toLowerCase())return json(res,503,{error:'Affiliate treasury address does not match the configured private key.'});

  const transport=http(process.env.BSC_RPC_URL||'https://bsc-dataseed.binance.org');
  const publicClient=createPublicClient({chain:bsc,transport});
  const walletClient=createWalletClient({account,chain:bsc,transport});
  const a=getAdmin(),db=a.firestore();
  const cycle=new Date().toISOString().slice(0,7);
  const snapshot=await db.collection('affiliates').where('status','==','active').limit(500).get();
  const results=[];

  for(const doc of snapshot.docs){
   const affiliate=doc.data(),wallet=String(affiliate.payoutWallet||'').trim();
   const available=cents(affiliate.availableBalance);
   if(!validWallet(wallet)||available<MINIMUM_USD)continue;

   const payoutId=`${cycle}_${doc.id}`,payoutRef=db.collection('affiliatePayouts').doc(payoutId);
   const existing=await payoutRef.get();
   if(existing.exists){
    const state=String(existing.data()?.status||'');
    if(state==='paid'||state==='processing')continue;
   }

   const amountWei=parseUnits(available.toFixed(2),PAYOUT_DECIMALS);
   await payoutRef.set({
    affiliateId:doc.id,affiliateUserId:affiliate.userId||'',wallet,asset:'USDT',network:'BEP20',amount:available,
    status:'processing',cycle,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
   },{merge:true});

   try{
    const hash=await walletClient.writeContract({address:USDT_BSC,abi:erc20Abi,functionName:'transfer',args:[getAddress(wallet),amountWei]});
    const receipt=await publicClient.waitForTransactionReceipt({hash});
    if(receipt.status!=='success')throw new Error('USDT payout transaction reverted.');

    const commissions=await db.collection('affiliateCommissions').where('affiliateId','==',doc.id).where('status','==','available').limit(500).get();
    const batch=db.batch();
    commissions.docs.forEach(c=>batch.update(c.ref,{status:'paid',paidAt:admin.firestore.FieldValue.serverTimestamp(),payoutId,transactionHash:hash,updatedAt:admin.firestore.FieldValue.serverTimestamp()}));
    batch.update(doc.ref,{availableBalance:0,paidOut:admin.firestore.FieldValue.increment(available),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    batch.set(payoutRef,{status:'paid',transactionHash:hash,amount:available,updatedAt:admin.firestore.FieldValue.serverTimestamp(),paidAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    await batch.commit();
    results.push({affiliateId:doc.id,status:'paid',amount,transactionHash:hash});
   }catch(error){
    await payoutRef.set({status:'failed',error:String(error?.message||error).slice(0,500),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    results.push({affiliateId:doc.id,status:'failed',error:String(error?.message||error).slice(0,200)});
   }
  }

  return json(res,200,{ok:true,cycle,processed:results.length,results});
 }catch(error){
  if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.'});
  console.error('affiliate payout failed',error);
  return json(res,500,{error:'Affiliate payout job failed.'});
 }
}
