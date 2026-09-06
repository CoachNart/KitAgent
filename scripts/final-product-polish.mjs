import fs from 'node:fs';

const mainPath='src/main.jsx';
let s=fs.readFileSync(mainPath,'utf8');

if(!s.includes("import './product-polish.css';"))s="import './product-polish.css';\n"+s;
if(!s.includes("import './nav-redesign.css';"))s="import './nav-redesign.css';\n"+s;
if(!s.includes("import './terminal-contrast.css';"))s="import './terminal-contrast.css';\n"+s;

if(!s.includes('function ChainCategories')){
  const marker='function App(){';
  const helper=`function ChainCategories({value,onChange}){const entries=Object.entries(CHAINS);const groups=[['EVM Mainnets',entries.filter(([,c])=>c.kind==='evm'&&!c.testnet)],['EVM Testnets',entries.filter(([,c])=>c.kind==='evm'&&c.testnet)],['Non-EVM',entries.filter(([,c])=>c.kind!=='evm')]];return <details className="chain-menu"><summary><span className="chain-menu-dot"/>{CHAINS[value]?.name||'Select network'}<b>⌄</b></summary><div className="chain-menu-pop">{groups.map(([title,items])=><div className="chain-menu-group" key={title}><small>{title}</small>{items.map(([key,c])=><button key={key} className={value===key?'selected':''} onClick={()=>{onChange(key);document.activeElement?.parentElement?.parentElement?.removeAttribute('open')}}><span>{c.name}</span><em>{c.testnet?'TESTNET':c.kind==='evm'?'EVM':c.namespace.toUpperCase()}</em></button>)}</div>)}</div></details>}\n`;
  if(s.includes(marker))s=s.replace(marker,helper+marker);
}

const oldPicker='<select className="chain-picker" value={chainKey} onChange={e=>{setChainKey(e.target.value);setRoute(null)}}><option value="robinhood">Robinhood Chain</option><option value="robinhoodTestnet">Robinhood Testnet</option><option value="custom">Custom EVM Testnet</option></select>';
const newPicker='<ChainCategories value={chainKey} onChange={k=>{setChainKey(k);setRoute(null)}} />';
if(s.includes(oldPicker))s=s.replace(oldPicker,newPicker);

if(!s.includes('async function requestTestTokens')){
  const marker=' async function connectWallet()';
  const fn=` async function requestTestTokens(){try{if(!account)throw new Error('Connect a wallet first');const requested=currentIntent==='faucet'?command:'';const r=await fetch('/api/faucet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:requested,address:account,chain:chainKey})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Test-token request unavailable');if(d.url)window.open(d.url,'_blank','noopener,noreferrer');setNotice(d.message||'Test-token faucet opened. Complete the faucet request in the new tab.')}catch(e){setNotice(e.message||'Test-token request failed')}}\n`;
  if(s.includes(marker))s=s.replace(marker,fn+marker);
}
s=s.replace("if(currentIntent==='faucet'){setMode('faucet');return}","if(currentIntent==='faucet'){requestTestTokens();return}");
s=s.replace("<TradingPanel initialCommand={command}/>","<TradingPanel initialCommand={command} access={access}/>");

fs.writeFileSync(mainPath,s);
console.log('KitAgent final product polish applied');
