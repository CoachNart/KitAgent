import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'App.jsx');
let source = fs.readFileSync(file, 'utf8');
const before = source;

source = source.replaceAll('KitAgent', 'KitSetups');
source = source.replaceAll('KITAGENT', 'KITSETUPS');
source = source.replaceAll('/kitagent-logo.svg', '/kitsetups-logo.svg');
source = source.replaceAll('alt="KitAgent"', 'alt="KitSetups"');
source = source.replaceAll('Robinhood Chain', 'Arbitrum / Hyperliquid');
source = source.replaceAll('ROBINHOOD_CHAIN', 'HYPERLIQUID_NETWORK');
source = source.replaceAll('Robinhood Chain · 4663', 'Arbitrum / Hyperliquid');
source = source.replaceAll('Robinhood Chain ·', 'Arbitrum / Hyperliquid ·');
source = source.replaceAll('Mainnet · 4663', 'Arbitrum One · Hyperliquid');
source = source.replaceAll('Chain ID 4663', 'Arbitrum One · Hyperliquid');
source = source.replaceAll('RH</span>', 'HL</span>');
source = source.replaceAll('https://rpc.mainnet.chain.robinhood.com', 'https://arb1.arbitrum.io/rpc');
source = source.replaceAll('https://robinhoodchain.blockscout.com', 'https://arbiscan.io');
source = source.replaceAll('chainId:4663', 'chainId:42161');
source = source.replaceAll("hex:'0x1237'", "hex:'0xa4b1'");

if (!source.includes("import { House } from 'lucide-react';")) {
  source = source.replace("import { Activity,", "import { House } from 'lucide-react';\nimport { Activity,");
}
source = source.replace("Terminal, UserRound, Wallet", "Terminal, UserRound, House, Wallet");
source = source.replace("['home','Home',BarChart3]", "['home','Home',House]");
source = source.replace("['home','Home',UserRound]", "['home','Home',House]");
source = source.replace("['drops','Airdrops & faucets',Rocket]", "['drops','Airdrops & faucets',UserRound]");
source = source.replace("['profile','Profile',Rocket]", "['profile','Profile',UserRound]");

if (!source.includes("import NotificationCenter from './NotificationCenter.jsx';")) {
  source = source.replace("import HomePage from './HomePage.jsx';", "import HomePage from './HomePage.jsx';\nimport NotificationCenter from './NotificationCenter.jsx';");
}
source = source.replaceAll('<NotificationCenter user={user}/>', '');
source = source.replace('<div className="header-actions"><div className="system">', '<div className="header-actions"><NotificationCenter user={user} embedded/><div className="system">');

if (!source.includes("const PROFILE_EDITOR_MARKER='kitsetups-profile-editor-v1';")) {
  source = source.replace(
    "function ProfilePage({wallet,connectWallet,user}){",
    `const PROFILE_EDITOR_MARKER='kitsetups-profile-editor-v1';\nfunction makeKitSetupsAvatar(username){const letters=(username||'K').split(/[-_\\s]+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('')||'K';const svg=\`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#111827"/><circle cx="48" cy="48" r="38" fill="none" stroke="#22c55e" stroke-opacity=".65" stroke-width="2"/><text x="48" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="white">\${letters}</text></svg>\`;return \`data:image/svg+xml;charset=UTF-8,\${encodeURIComponent(svg)}\`}\nfunction ProfilePage({wallet,connectWallet,user}){`
  );
}

for (const [addition, needle] of [
  ["import { updateProfile } from 'firebase/auth';", "import { useEffect, useState } from 'react';"],
  ["import { collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';", "import { useEffect, useState } from 'react';"],
  ["import { db } from './firebase.js';", "import HomePage from './HomePage.jsx';"]
]) {
  if (!source.includes(addition)) source = source.replace(needle, `${needle}\n${addition}`);
}

const profileStart=source.indexOf('function ProfilePage({wallet,connectWallet,user}){');
const profileEnd=source.indexOf('\nfunction PermissionModal',profileStart);
if(profileStart>=0&&profileEnd>profileStart){
  const profile=`function ProfilePage({wallet,connectWallet,user}){const initial=user?.displayName||'kitsetups-member';const email=user?.email||'Firebase account';const [draft,setDraft]=useState(initial);const [saved,setSaved]=useState(initial);const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);useEffect(()=>{const next=user?.displayName||'kitsetups-member';setDraft(next);setSaved(next)},[user?.uid]);const clean=v=>String(v||'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,20);const save=async()=>{const username=clean(draft);if(!/^[a-z0-9][a-z0-9-]{2,19}$/.test(username)){setStatus('Use 3–20 characters: lowercase letters, numbers and hyphens.');return}if(!user?.uid||!db){setStatus('Profile storage is unavailable.');return}setBusy(true);setStatus('');try{const matches=await getDocs(query(collection(db,'users'),where('username','==',username),limit(1)));const taken=matches.docs.some(x=>x.id!==user.uid);if(taken){setStatus('That username is already taken.');return}const photoURL=makeKitSetupsAvatar(username);await updateProfile(user,{displayName:username,photoURL});await updateDoc(doc(db,'users',user.uid),{username,displayName:username,photoURL,updatedAt:serverTimestamp()});setSaved(username);setDraft(username);setStatus('Username updated.');}catch(error){console.error(error);setStatus(error?.message||'Could not update your username.')}finally{setBusy(false)}};return <div className="page-wrap"><div className="section-intro"><div><span className="tiny-label">CONTROL PLANE</span><h2>Profile</h2><p>Account, wallet and execution preferences.</p></div><span className="secure-badge"><ShieldCheck size={14}/> Protected</span></div><div className="profile-grid"><section className="profile-card identity"><div className="big-avatar">{user?.photoURL?<img src={user.photoURL} alt=""/>:<span>{initials(saved)}</span>}</div><div style={{flex:1,minWidth:0}}><h3>{saved}</h3><span>{email}</span><div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><input aria-label="Username" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={20} style={{flex:'1 1 220px',minWidth:0,padding:'10px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.05)',color:'#fff'}}/><button className="outline-btn" type="button" onClick={save} disabled={busy}>{busy?'Saving…':'Save username'}</button></div>{status&&<small style={{display:'block',marginTop:8,opacity:.7}}>{status}</small>}</div><button className="outline-btn" type="button" onClick={connectWallet}><Wallet size={14}/>{wallet?'Wallet connected':'Connect wallet'}</button></section><section className="profile-card"><span className="tiny-label">NETWORK</span><div className="network-card"><span className="network-mark"><Network/></span><div><h3>Arbitrum / Hyperliquid</h3><p>Hyperliquid perpetuals terminal · Arbitrum signing</p></div><span className="online-pill"><i/> Connected</span></div></section><section className="profile-card"><span className="tiny-label">PERMISSION POLICY</span><PolicyRow title="Explicit transaction approval" text="Always required"/><PolicyRow title="Private key access" text="Never requested"/><PolicyRow title="Silent execution" text="Disabled"/><PolicyRow title="Transaction verification" text="Enabled when adapter supports it"/></section><section className="profile-card"><span className="tiny-label">WALLET</span><div className="wallet-address">{wallet||'No wallet connected'}{wallet&&<button onClick={()=>navigator.clipboard?.writeText(wallet)}><Copy size={14}/></button>}</div><div className="pref-row"><span>Native asset</span><b>ETH</b></div><div className="pref-row"><span>Trading venue</span><b>Hyperliquid</b></div></section></div></div>}`;
  source=source.slice(0,profileStart)+profile+source.slice(profileEnd);
}

const networkObject="const HYPERLIQUID_NETWORK={name:'Arbitrum / Hyperliquid',chainId:42161,hex:'0xa4b1',rpcUrl:'https://arb1.arbitrum.io/rpc',explorer:'https://arbiscan.io',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}};";
source=source.replace(/const HYPERLIQUID_NETWORK=[^;]+;/,networkObject);
if(!source.includes('const HYPERLIQUID_NETWORK=')) source=source.replace(/const [A-Z_]+_CHAIN=[^;]+;/,networkObject);

if (source !== before) fs.writeFileSync(file, source);
