import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, before, after) => { if (before === after) return false; fs.writeFileSync(p, after); return true; };

let home = read('src/HomePage.jsx');
home = home.replace(/,high:Number\(x\.highPrice24h\),low:Number\(x\.lowPrice24h\)/, '');
home = home.replace(/\n\s*<div className="home-hilo">.*?<\/div>/s, '');
write('src/HomePage.jsx', read('src/HomePage.jsx'), home);

let account = read('src/AccountPage.jsx');
account = account.replace("import SignalHistory from './SignalHistory.jsx';\n", '');
account = account.replace(/\n\s*<SignalHistory\/>/, '');
write('src/AccountPage.jsx', read('src/AccountPage.jsx'), account);

let app = read('src/App.jsx');
app = app.replace("import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';", "import { connectWallet as connectWalletExternal, getActiveProvider } from './walletkit.jsx';\nimport AccessGate from './AccessGate.jsx';\nimport LiveMarketPage from './LiveMarketPage.jsx';\nimport SignalHistory from './SignalHistory.jsx';");
app = app.replace("['home','Home',BarChart3]", "['home','Home',UserRound]");
app = app.replace("{page==='market'&&<MarketPage pair={pair} setPair={setPair} tf={tf} setTf={setTf} analyzed={analyzed} setAnalyzed={setAnalyzed}/>} ", "{page==='market'&&<AccessGate user={user}><LiveMarketPage/></AccessGate>} ");
app = app.replace("function ActivityPage({activity}){const demo=", "function ActivityPage({activity}){return <><SignalHistory/><div className=\"page-wrap\"><div className=\"section-intro\"><div><span className=\"tiny-label\">AUDIT TRAIL</span><h2>Activity</h2><p>Every plan, approval and submitted transaction belongs in the record.</p></div><button className=\"outline-btn\"><ArrowDownToLine size={15}/> Export</button></div><div className=\"stats-strip\"><Metric label=\"Plans\" value=\"24\"/><Metric label=\"Approved\" value=\"18\"/><Metric label=\"Rejected\" value=\"6\"/><Metric label=\"Submitted\" value={String(activity.length)}/></div><div className=\"table-card\"><div className=\"table-tools\"><div className=\"table-search\"><Search size={15}/><input placeholder=\"Search activity\"/></div><span className=\"audit-chip\"><ShieldCheck size={13}/> Permission log</span></div><div className=\"activity-list\">{[...activity.map(x=>[x.type,x.label,x.status,x.time,x.hash]),...demo].map((t,i)=>");
// The previous replacement intentionally handles the full ActivityPage in one pass below.
const activityStart = app.indexOf('function ActivityPage({activity}){');
const profileStart = app.indexOf('function ProfilePage({wallet,connectWallet,user}){');
if (activityStart >= 0 && profileStart > activityStart) {
  const existing = app.slice(activityStart, profileStart);
  const replacement = `function ActivityPage({activity}){const demo=[['Swap','ETH → USDC','Prepared','Just now'],['Airdrop scan','Wallet eligibility','Verified','Today'],['NFT','Signal #091','Review required','Yesterday']];return <><SignalHistory/><div className="page-wrap"><div className="section-intro"><div><span className="tiny-label">AUDIT TRAIL</span><h2>Activity</h2><p>Every plan, approval and submitted transaction belongs in the record.</p></div><button className="outline-btn"><ArrowDownToLine size={15}/> Export</button></div><div className="stats-strip"><Metric label="Plans" value="24"/><Metric label="Approved" value="18"/><Metric label="Rejected" value="6"/><Metric label="Submitted" value={String(activity.length)}/></div><div className="table-card"><div className="table-tools"><div className="table-search"><Search size={15}/><input placeholder="Search activity"/></div><span className="audit-chip"><ShieldCheck size={13}/> Permission log</span></div><div className="activity-list">{[...activity.map(x=>[x.type,x.label,x.status,x.time,x.hash]),...demo].map((t,i)=><div className="activity-row" key={i}><span className="activity-icon"><CircleDollarSign size={14}/></span><div><b>{t[0]}</b><span>{t[1]}</span></div><em>{t[2]}</em><small>{t[3]}</small>{t[4]?<a href={\`${ROBINHOOD_CHAIN.explorer}/tx/\${t[4]}\`} target="_blank" rel="noreferrer"><ExternalLink size={13}/></a>:<span/>}</div>)}</div></div></div></div></>;}\n`;
  app = app.slice(0, activityStart) + replacement + app.slice(profileStart);
}
write('src/App.jsx', read('src/App.jsx'), app);

let wallet = read('src/walletkit.jsx');
wallet = `import { createAppKit } from '@reown/appkit/react';\nimport { WagmiAdapter } from '@reown/appkit-adapter-wagmi';\nimport { arbitrum } from '@reown/appkit/networks';\nimport { getAccount, watchAccount } from '@wagmi/core';\nimport { QueryClient } from '@tanstack/react-query';\n\nconst projectId = import.meta.env.VITE_REOWN_PROJECT_ID || import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '94314a4ef9da3dd09a3b858adef781e9';\nexport const queryClient = new QueryClient();\nexport const wagmiAdapter = new WagmiAdapter({ projectId, networks: [arbitrum], ssr: false });\nexport const appKit = createAppKit({\n  adapters: [wagmiAdapter], networks: [arbitrum], defaultNetwork: arbitrum, projectId,\n  metadata: { name: 'KitSetups', description: 'KitSetups wallet connection', url: typeof window !== 'undefined' ? window.location.origin : 'https://kitsetups.vercel.app' },\n  features: { analytics: false, email: false, socials: [] }, themeMode: 'dark',\n});\nlet pending = null;\nconst state = () => getAccount(wagmiAdapter.wagmiConfig);\nexport async function connectWallet() {\n  const current = state();\n  if (current.isConnected && current.address) return { address: current.address, provider: appKit.getWalletProvider?.() || null };\n  if (!pending) {\n    pending = new Promise((resolve, reject) => {\n      let timer; let stop;\n      const finish = (value, error) => { clearTimeout(timer); if (stop) stop(); pending = null; error ? reject(error) : resolve(value); };\n      stop = watchAccount(wagmiAdapter.wagmiConfig, { onChange: account => { if (account.isConnected && account.address) finish({ address: account.address, provider: appKit.getWalletProvider?.() || null }); } });\n      timer = setTimeout(() => finish(null, new Error('Wallet connection timed out. Please retry from your wallet.')), 60000);\n      appKit.open({ view: 'Connect', namespace: 'eip155' }).catch(error => finish(null, error));\n    });\n  }\n  return pending;\n}\nexport async function resumePendingWalletConnection() { const a = state(); return a.isConnected && a.address ? { address: a.address, provider: appKit.getWalletProvider?.() || null } : null; }\nexport function getActiveProvider() { return appKit.getWalletProvider?.() || null; }\nexport function getConnectedAddress() { return state().address || ''; }\nexport function isWalletConnected() { const a = state(); return Boolean(a.isConnected && a.address); }\nexport async function disconnectWallet() { if (typeof appKit.disconnect === 'function') await appKit.disconnect(); }\n`;
write('src/walletkit.jsx', read('src/walletkit.jsx'), wallet);

for (const dir of ['src']) {
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(jsx?|css)$/.test(file)) continue;
    const p = `${dir}/${file}`; const before = read(p); const after = before.replace(/Hyperliquid/g, '');
    write(p, before, after);
  }
}

// Hard server-side access gate for both setup retrieval and signal persistence.
const access = `import admin from 'firebase-admin';\nimport fs from 'node:fs';\n\nfunction getAdmin(){\n if(admin.apps.length)return admin;\n const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON, path=process.env.GOOGLE_APPLICATION_CREDENTIALS;\n if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\\\"]|['\\\"]$/g,'')))});return admin}\n if(path&&fs.existsSync(path)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(path,'utf8')))});return admin}\n throw Object.assign(new Error('Firebase Admin credentials are missing.'),{code:'FIREBASE_ADMIN_CREDENTIALS_MISSING'});\n}\nfunction toMs(v){if(!v)return 0;if(typeof v.toMillis==='function')return v.toMillis();if(typeof v.toDate==='function')return v.toDate().getTime();const n=new Date(v).getTime();return Number.isFinite(n)?n:0}\nexport async function requireActiveAccess(uid){\n const snap=await getAdmin().firestore().collection('users').doc(uid).get();\n const d=snap.exists?snap.data():{}; const now=Date.now(); const plan=String(d.plan||'free').toLowerCase();\n const trial=plan!=='premium'&&toMs(d.trialEndsAt)>now; const premium=plan==='premium'&&toMs(d.subscriptionEndsAt)>now;\n if(!trial&&!premium)throw Object.assign(new Error('Premium access is required to generate market signals.'),{code:'ACCESS_EXPIRED'});\n return {plan,trial,premium};\n}\nexport async function authenticate(req){const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))throw Object.assign(new Error('Authentication required.'),{code:'AUTH_REQUIRED'});try{return await getAdmin().auth().verifyIdToken(h.slice(7));}catch{throw Object.assign(new Error('Authentication token could not be verified.'),{code:'AUTH_INVALID'});}}\n`;
fs.writeFileSync('api/_access.js', access);

let signals = read('api/signals.js');
signals = signals.replace("import fs from 'node:fs';", "import fs from 'node:fs';\nimport { authenticate, requireActiveAccess } from './_access.js';");
signals = signals.replace(/async function authenticate\(req\)\{[\s\S]*?\n\}\n\nfunction clean/, 'function clean');
signals = signals.replace("const decoded = await authenticate(req);\n    const db", "const decoded = await authenticate(req);\n    if (req.method === 'POST') await requireActiveAccess(decoded.uid);\n    const db");
signals = signals.replace("const status = error?.code === 'AUTH_TOKEN_MISSING' || error?.code === 'AUTH_TOKEN_INVALID' ? 401 : 500;", "const status = ['AUTH_REQUIRED','AUTH_INVALID'].includes(error?.code) ? 401 : error?.code === 'ACCESS_EXPIRED' ? 403 : 500;");
write('api/signals.js', read('api/signals.js'), signals);

let market = read('api/market.js');
market = `import { authenticate, requireActiveAccess } from './_access.js';\n` + market.replace(/^/, '');
market = market.replace("export default async function handler(req,res){if(req.method!=='GET')", "export default async function handler(req,res){if(req.method!=='GET')");
market = market.replace("try{const market=", "try{const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=");
market = market.replace("}catch(e){return json(res,502", "}catch(e){if(['AUTH_REQUIRED','AUTH_INVALID'].includes(e?.code))return json(res,401,{ok:false,error:e.message});if(e?.code==='ACCESS_EXPIRED')return json(res,403,{ok:false,error:e.message});return json(res,502");
write('api/market.js', read('api/market.js'), market);

const vercelPath='vercel.json';
let vercel=read(vercelPath);
vercel=JSON.stringify({regions:['lhr1'],headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}]}],rewrites:[{source:'/(.*)',destination:'/index.html'}]},null,2)+'\n';
write(vercelPath, vercel, vercel);

console.log('Final hardening changes prepared.');
