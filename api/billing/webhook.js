import Stripe from 'stripe';
import {firestore} from '../_firebase.js';
export const config={api:{bodyParser:false}};

async function rawBody(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const body=await rawBody(req);const signature=req.headers['stripe-signature'];const event=stripe.webhooks.constructEvent(body,signature,process.env.STRIPE_WEBHOOK_SECRET);const db=firestore();
    if(event.type==='checkout.session.completed'){
      const session=event.data.object;const uid=session.metadata?.uid||session.client_reference_id;const subscription=await stripe.subscriptions.retrieve(session.subscription);if(uid)await db.collection('kitagent_accounts').doc(uid).set({plan:'premium',planName:'Premium',accessStatus:'PREMIUM_ACTIVE',subscriptionEndsAt:subscription.current_period_end*1000,accessExpiresAt:subscription.current_period_end*1000,stripeSubscriptionId:subscription.id},{merge:true});
    }
    if(event.type==='invoice.payment_succeeded'){
      const invoice=event.data.object;const sub=invoice.subscription?await stripe.subscriptions.retrieve(invoice.subscription):null;const uid=sub?.metadata?.uid;if(uid&&sub)await db.collection('kitagent_accounts').doc(uid).set({plan:'premium',planName:'Premium',accessStatus:'PREMIUM_ACTIVE',subscriptionEndsAt:sub.current_period_end*1000,accessExpiresAt:sub.current_period_end*1000,stripeSubscriptionId:sub.id},{merge:true});
    }
    if(event.type==='customer.subscription.deleted'){
      const sub=event.data.object;const uid=sub.metadata?.uid;if(uid)await db.collection('kitagent_accounts').doc(uid).set({plan:'free',planName:'Free',accessStatus:'EXPIRED',accessExpiresAt:Date.now(),subscriptionEndsAt:sub.current_period_end?sub.current_period_end*1000:Date.now()},{merge:true});
    }
    return json(res,200,{received:true});
  }catch(error){return json(res,400,{error:error?.message||'Webhook verification failed'})}
}
