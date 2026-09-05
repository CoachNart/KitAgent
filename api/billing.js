const PRICES={pro:process.env.KITAGENT_PRO_PRICE_ID,developer:process.env.KITAGENT_DEVELOPER_PRICE_ID,startup:process.env.KITAGENT_STARTUP_PRICE_ID};
export default async function handler(req,res){
 res.setHeader('cache-control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 try{
  const {plan='pro'}=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
  const price=PRICES[plan];
  if(!process.env.STRIPE_SECRET_KEY||!price)return res.status(503).json({error:'Billing is not activated yet. Configure STRIPE_SECRET_KEY and the KitAgent plan price IDs in Vercel.'});
  const origin=process.env.KITAGENT_APP_URL||`https://${req.headers.host}`;
  const body=new URLSearchParams({mode:'subscription',success_url:`${origin}/?billing=success&plan=${encodeURIComponent(plan)}`,cancel_url:`${origin}/?billing=cancelled`,line_items:'0',});
  body.delete('line_items');body.append('line_items[0][price]',price);body.append('line_items[0][quantity]','1');
  const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d.error?.message||'Stripe checkout failed'});return res.status(200).json({url:d.url,id:d.id});
 }catch(e){return res.status(500).json({error:e.message||'Billing error'})}
}
