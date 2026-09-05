import Stripe from 'stripe';
import {firestore,verifyBearer} from '../_firebase.js';
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const user=await verifyBearer(req);const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const db=firestore();const ref=db.collection('kitagent_accounts').doc(user.uid);const snap=await ref.get();
    const customerId=snap.data()?.stripeCustomerId;
    const customer=customerId?customerId:((await stripe.customers.create({email:user.email||undefined,metadata:{uid:user.uid}})).id);
    if(!customerId)await ref.set({stripeCustomerId:customer},{merge:true});
    const origin=process.env.APP_URL||'https://kitagent.xyz';
    const session=await stripe.checkout.sessions.create({mode:'subscription',customer,client_reference_id:user.uid,line_items:[{price_data:{currency:'usd',unit_amount:2000,recurring:{interval:'month'},product_data:{name:'KitAgent Premium Trading Layer',description:'Premium Trading Layer access · $20 / 30 days'}} ,quantity:1}],subscription_data:{metadata:{uid:user.uid}},metadata:{uid:user.uid},success_url:`${origin}/?billing=success`,cancel_url:`${origin}/?billing=cancelled`});
    return json(res,200,{url:session.url});
  }catch(error){return json(res,500,{error:error?.message||'Could not start checkout'})}
}
