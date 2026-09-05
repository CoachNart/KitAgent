import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');
const old="onClick={()=>setNotice('Premium checkout: $20 for 30 days. Billing endpoint is ready for your payment provider.')}";
const next="onClick={async()=>{try{const token=await authUser.getIdToken(true);const r=await fetch('/api/billing/checkout',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout unavailable');window.location.href=d.url}catch(e){setNotice(e.message||'Checkout unavailable')}}}";
if(s.includes(old))s=s.replace(old,next);
fs.writeFileSync(path,s);
console.log('KitAgent premium checkout transform applied');
