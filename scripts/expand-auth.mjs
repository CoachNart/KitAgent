import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes("./AuthPage.jsx")){
  const anchor="import {aaReady,sponsorshipReady,sponsorshipMessage,supportedEntryPoints} from './aa/index.js';";
  if(s.includes(anchor))s=s.replace(anchor,anchor+"\nimport AuthPage from './AuthPage.jsx';\nimport {auth} from './lib/firebase.js';");
}

if(!s.includes('const[authUser,setAuthUser]')){
  const marker="const[account,setAccount]=useState('');";
  const replacement="const[account,setAccount]=useState('');const[authUser,setAuthUser]=useState(null);const[authReady,setAuthReady]=useState(false);const[access,setAccess]=useState({hasAccess:false,status:'LOCKED',expiresAt:null,plan:'free'});";
  if(s.includes(marker))s=s.replace(marker,replacement);
}

if(!s.includes('onAuthStateChanged(auth')){
  const marker="useEffect(()=>{const t=setTimeout(()=>setBoot(false),900);accounts().then(a=>a?.[0]&&setAccount(a[0])).catch(()=>{});return()=>clearTimeout(t)},[]);";
  const injected=marker+"\n useEffect(()=>{const off=auth.onAuthStateChanged(async u=>{setAuthUser(u);setAuthReady(true);if(!u){setAccess({hasAccess:false,status:'LOCKED',expiresAt:null,plan:'free'});return}try{const token=await u.getIdToken(true);const r=await fetch('/api/account',{headers:{Authorization:`Bearer ${token}`,'Cache-Control':'no-store'}});const d=await r.json().catch(()=>({}));if(r.ok&&d.data?.access)setAccess(d.data.access);else if(r.status===404){const h={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};const rr=await fetch('/api/security/register',{method:'POST',headers:h,body:JSON.stringify({email:u.email||''})});const rd=await rr.json().catch(()=>({}));if(rr.ok&&rd.ok){const ar=await fetch('/api/account',{headers:h});const ad=await ar.json().catch(()=>({}));if(ar.ok&&ad.data?.access)setAccess(ad.data.access)}}catch(e){setNotice(e.message||'Account access check failed')}});return()=>off()},[]);";
  if(s.includes(marker))s=s.replace(marker,injected);
}

if(!s.includes('function openMode(')){
  const marker=' async function connectWallet()';
  const fn=" function openMode(next){if(next==='trading'&&!access.hasAccess){setMode('profile');setNotice(access.status==='EXPIRED'?'Your 3-day Trading trial has ended. Premium is $20 for 30 days.':'Trading is available with a 3-day free trial, then Premium is $20 for 30 days.');return}setMode(next)}\n";
  if(s.includes(marker))s=s.replace(marker,fn+marker);
}

s=s.replace("onClick={()=>setMode(m)}","onClick={()=>openMode(m)}");
s=s.replace("if(currentIntent==='trading'){setMode('trading');return}","if(currentIntent==='trading'){openMode('trading');return}");

if(!s.includes("!authReady?<div className=\"auth-loading\"")){
  const marker=' return <>{boot&&';
  const gate=" if(!authReady)return <div className=\"auth-loading\"><div className=\"auth-loading-mark\"><i/><i/><i/></div><span>SECURE SESSION</span></div>;\n if(!authUser)return <AuthPage onAuthed={setAuthUser}/>;\n";
  if(s.includes(marker))s=s.replace(marker,gate+marker);
}

fs.writeFileSync(path,s);
console.log('KitAgent authentication + Trading access gate transform applied');
