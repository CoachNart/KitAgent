import admin from 'firebase-admin';
import fs from 'node:fs';

const PAYMENT_ADDRESS='0x1c35bf9d920e1b5d7e7e37ce1d15a1b9500f8474'.toLowerCase();
const USDT_BSC='0x55d398326f99059ff775485246999027b3197955'.toLowerCase();
const BSC_RPC=process.env.BSC_RPC_URL||'https://bsc-dataseed.binance.org';
const PRICE_USDT=20n*10n**18n;
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55aeb5b8a8a39';
function getAdmin(){if(admin.apps.length)return admin;const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,credentialPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;if(raw){try{admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});return admin}catch{}}if(credentialPath&&fs.existsSync(credentialPath)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credentialPath,'utf8')))});return admin}const e=new Error('FIREBASE_ADMIN_CREDENTIALS_MISSING');e.code=e.message;throw e}
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
async function rpc(method,params){const response=await fetch(BSC_RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error?.message||'BSC RPC request failed');return data.result}
function normalizeAddress(topic){return `0x${String(topic||'').slice(-40)}`.toLowerCase()}
function parseAmount(data){try{return BigInt(data)}catch{return 0n}}
export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 try{
  const a=getAdmin(),authHeader=req.headers.authorization||'',token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';if(!token)return json(res,401,{error:'Authentication required.'});
  let decoded;try{decoded=await a.auth().verifyIdToken(token)}catch{return json(res,401,{error:'Authentication token could not be verified.'})}
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}),hash=String(body.transactionHash||'').trim().toLowerCase();
  if(!/^0x[a-f0-9]{64}$/.test(hash))return json(res,400,{error:'Enter a valid transaction hash.'});
  const db=a.firestore(),userRef=db.collection('users').doc(decoded.uid),usedRef=db.collection('usedPaymentTransactions').doc(hash);
  const tx=await rpc('eth_getTransactionByHash',[hash]);if(!tx)return json(res,422,{error:'Transaction not found on BNB Smart Chain. Wait for it to appear, then try again.'});
  if(String(tx.chainId||'').toLowerCase()!=='0x38')return json(res,422,{error:'This transaction is not on BNB Smart Chain.'});
  const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(!receipt||receipt.status!=='0x1')return json(res,422,{error:'Payment transaction is not confirmed successfully yet.'});
  const sender=String(tx.from||'').toLowerCase();
  if(!/^0x[a-f0-9]{40}$/.test(sender))return json(res,422,{error:'The transaction sender could not be resolved.'});
  const matching=(receipt.logs||[]).find(log=>{const topics=log.topics||[];return String(log.address||'').toLowerCase()===USDT_BSC&&String(topics[0]||'').toLowerCase()===TRANSFER_TOPIC&&normalizeAddress(topics[2])===PAYMENT_ADDRESS&&parseAmount(log.data)>=PRICE_USDT});
  if(!matching)return json(res,422,{error:'No valid payment of at least 20 USDT to the KitAgent payment address was found in this transaction.'});
  const amount=parseAmount(matching.data),amountUsdt=Number(amount)/1e18,verificationRef=userRef.collection('paymentVerifications').doc();
  await db.runTransaction(async transaction=>{
   const usedSnap=await transaction.get(usedRef),userSnap=await transaction.get(userRef);if(usedSnap.exists){const e=new Error('PAYMENT_ALREADY_USED');e.code=e.message;throw e}
   const user=userSnap.exists?userSnap.data():{};const currentPlan=String(user.plan||'free').toLowerCase(),currentEnd=user.subscriptionEndsAt?.toDate?user.subscriptionEndsAt.toDate():(user.subscriptionEndsAt?new Date(user.subscriptionEndsAt):null),start=currentPlan==='premium'&&currentEnd&&currentEnd.getTime()>Date.now()?currentEnd:new Date(),end=new Date(start.getTime()+30*86400000),verification={status:'verified',transactionHash:hash,amount:amountUsdt,asset:'USDT',network:'BNB Chain',chainId:56,tokenContract:USDT_BSC,paymentAddress:PAYMENT_ADDRESS,from:sender};
   transaction.create(usedRef,{uid:decoded.uid,transactionHash:hash,createdAt:admin.firestore.FieldValue.serverTimestamp()});
   transaction.set(verificationRef,{uid:decoded.uid,...verification,verifiedAt:admin.firestore.FieldValue.serverTimestamp(),createdAt:admin.firestore.FieldValue.serverTimestamp()});
   transaction.update(userRef,{plan:'premium',subscriptionEndsAt:end,latestPaymentVerification:verification,subscription:{...(user.subscription||{}),name:'Premium',price:20,currency:'USD',billingPeriod:'month',accessDays:30,features:['Unlimited setups','Live intelligence'],paymentAsset:'USDT',paymentNetwork:'BNB Chain',paymentAddress:PAYMENT_ADDRESS},updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  return json(res,200,{verified:true,status:'verified',amount:amountUsdt,accessDays:30});
 }catch(error){if(error?.code==='PAYMENT_ALREADY_USED')return json(res,409,{error:'This transaction has already been used for a KitAgent Premium activation.'});if(error?.code==='FIREBASE_ADMIN_CREDENTIALS_MISSING')return json(res,500,{error:'Firebase Admin credentials are missing.'});console.error('verify-payment failed',error);return json(res,500,{error:'Payment verification could not be completed.'})}
}
