import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes("from './AuthPage.jsx'")){
  const imports="import AuthPage from './AuthPage.jsx';\nimport {auth,authPersistenceReady} from './lib/firebase.js';";
  const firstImport=s.indexOf('import ');
  if(firstImport>=0)s=s.slice(0,firstImport)+imports+'\n'+s.slice(firstImport);
}

if(!s.includes('const[authUser,setAuthUser]')){
  const marker="const[account,setAccount]=useState('');";
  const replacement="const[account,setAccount]=useState('');const[authUser,setAuthUser]=useState(null);const[authReady,setAuthReady]=useState(false);const[access,setAccess]=useState({hasAccess:false,status:'LOCKED',expiresAt:null,plan:'free'});";
  if(s.includes(marker))s=s.replace(marker,replacement);
}

if(!s.includes('onAuthStateChanged(auth')){
  const marker="useEffect(()=>{const t=setTimeout(()=>setBoot(false),900);accounts().then(a=>a?.[0]&&setAccount(a[0])).catch(()=>{});return()=>clearTimeout(t)},[]);";
  const injected=marker+"\n useEffect(()=>{let cancelled=false;let off=()=>{};const wait=ms=>new Promise(r=>setTimeout(r,ms));const sync=async u=>{if(cancelled)return;if(u){setAuthUser(u);setAuthReady(true);try{const token=await u.getIdToken(true);const h={Authorization:`Bearer ${token}`,'Cache-Control':'no-store'};const r=await fetch('/api/account',{headers:h});const d=await r.json().catch(()=>({}));if(r.ok&&d.data?.access){setAccess(d.data.access);return}const security=await (await import('./lib/device-security.js')).securityHeaders(token);const rr=await fetch('/api/security/register',{method:'POST',headers:security,body:JSON.stringify({email:u.email||''})});const rd=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(rd.error||'Account security registration failed');const ar=await fetch('/api/account',{headers:h});const ad=await ar.json().catch(()=>({}));if(ar.ok&&ad.data?.access)setAccess(ad.data.access)}catch(e){setNotice(e.message||'Account access check failed')}}else{await wait(250);const current=auth.currentUser;if(current){setAuthUser(current);setAuthReady(true)}else if(sessionStorage.getItem('kitagent-auth-pending')==='1'){setAuthReady(true);setNotice('Finalizing secure sign-in…');setTimeout(()=>{if(!cancelled)sync(auth.currentUser)},500)}else{setAuthUser(null);setAuthReady(true);setAccess({hasAccess:false,status:'LOCKED',expiresAt:null,plan:'free'})}}};(async()=>{try{await authPersistenceReady;await auth.authStateReady()}catch{}if(cancelled)return;off=auth.onIdTokenChanged(sync);await sync(auth.currentUser)})();return()=>{cancelled=true;off()}},[]);";
  if(s.includes(marker))s=s.replace(marker,injected);
}

if(!s.includes('function openMode(')){
  const marker=' async function connectWallet()';
  const fn=" function openMode(next){if(next==='trading'&&!access.hasAccess){setMode('profile');setNotice(access.status==='EXPIRED'?'Your 3-day Trading trial has ended. Premium is $20 for 30 days.':'Trading is available with a 3-day free trial, then Premium is $20 for 30 days.');return}setMode(next)}\n";
  if(s.includes(marker))s=s.replace(marker,fn+marker);
}

s=s.replace("onClick={()=>setMode(m)}","onClick={()=>openMode(m)}");
s=s.replace("if(currentIntent==='trading'){setMode('trading');return}","if(currentIntent==='trading'){openMode('trading');return}");

if(!s.includes('!authReady)return <div className="auth-loading"')){
  const marker=' return <>{boot&&';
  const gate=" if(!authReady)return <div className=\"auth-loading\"><div className=\"auth-loading-mark\"><i/><i/><i/></div><span>SECURE SESSION</span></div>;\n if(!authUser)return <AuthPage onAuthed={setAuthUser}/>;\n";
  if(s.includes(marker))s=s.replace(marker,gate+marker);
}

fs.writeFileSync(path,s);
console.log('KitAgent authentication transform applied');
