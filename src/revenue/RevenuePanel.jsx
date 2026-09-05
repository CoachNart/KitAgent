import React,{useMemo,useState} from 'react';
import {PLANS,feeLabel,usage,plan,setPlan,revenueProjection} from './model.js';

export default function RevenuePanel(){
 const [selected,setSelected]=useState(plan());
 const [u,setU]=useState(usage());
 const [checkout,setCheckout]=useState('');
 const projected=useMemo(()=>revenueProjection(1000000),[]);
 async function subscribe(){
  try{const r=await fetch('/api/billing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:selected})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout unavailable');if(d.url)window.location.href=d.url;else setCheckout('Billing endpoint is ready; configure Stripe pricing to activate checkout.')}catch(e){setCheckout(e.message)}}
 return <section className="revenue-page">
  <div className="revenue-head"><div><div className="eyebrow">KITAGENT BUSINESS ENGINE</div><h2>Turn execution into <em>revenue.</em></h2><p>Keep the core wallet free. Monetize high-value execution, Pro automation and the infrastructure other products build on.</p></div><div className="revenue-rate"><span>Execution fee</span><strong>{feeLabel()}</strong><small>swaps & cross-chain routes</small></div></div>
  <div className="revenue-grid">
   <div className="revenue-card revenue-primary"><span className="card-kicker">TRANSACTION ENGINE</span><strong>${u.fees.toFixed(2)}</strong><span>tracked service revenue</span><div className="metric-row"><div><b>${u.volume.toLocaleString()}</b><small>tracked volume</small></div><div><b>{u.routes}</b><small>routes executed</small></div><div><b>${projected.monthly.toLocaleString()}</b><small>per $1M volume</small></div></div></div>
   <div className="revenue-card"><span className="card-kicker">PRO</span><h3>$19 / month</h3><p>Unlimited smart execution, automation, gas optimization, advanced simulation and multi-wallet workflows.</p><button className="revenue-cta" onClick={()=>{setSelected('pro');subscribe()}}>Activate Pro</button></div>
   <div className="revenue-card"><span className="card-kicker">INFRASTRUCTURE</span><h3>From $99 / month</h3><p>API, white-label agent, usage analytics and embedded execution for wallets, fintechs, DAOs and Web3 apps.</p><button className="ghost-action" onClick={()=>{setSelected('developer');subscribe()}}>Build with KitAgent</button></div>
  </div>
  <div className="plans-strip">{Object.values(PLANS).map(p=><button key={p.id} className={selected===p.id?'plan-chip active':'plan-chip'} onClick={()=>setSelected(p.id)}><span>{p.name}</span><b>{p.price?'$'+p.price+'/mo':'Free'}</b></button>)}</div>
  <div className="revenue-note"><span className="pulse-dot"/><div><b>Transparent by design.</b> Network gas remains a network cost. KitAgent's service fee is shown before approval and is only applied to monetized route execution. Basic wallet functions stay free.</div></div>
  {checkout&&<div className="revenue-notice">{checkout}</div>}
 </section>
}
