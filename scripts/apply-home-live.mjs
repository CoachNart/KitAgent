import fs from 'node:fs';

const app='src/App.jsx';
let s=fs.readFileSync(app,'utf8');
if(!s.includes("from './HomePage.jsx'")) s=s.replace("import PerpetualsPage from './PerpetualsPage.jsx';", "import PerpetualsPage from './PerpetualsPage.jsx';\nimport HomePage from './HomePage.jsx';");
s=s.replace("const nav=[['terminal','Command center',Terminal],", "const nav=[['home','Home',BarChart3],");
s=s.replace("const [page,setPage]=useState('terminal')", "const [page,setPage]=useState('home')");
const terminalRoute="{page==='terminal'&&<CommandCenter command={command} setCommand={setCommand} messages={messages} runCommand={runCommand} go={go} wallet={wallet}/>}";
s=s.replace(terminalRoute,"{page==='home'&&<HomePage go={go} wallet={wallet}/>} ");
if(s.includes(terminalRoute)) throw new Error('terminal route was not replaced');
fs.writeFileSync(app,s);

const pp='src/PerpetualsPage.jsx';
let p=fs.readFileSync(pp,'utf8');
const marker='\n return <';
if(!p.includes(marker)) throw new Error('perps render marker not found');
if(!p.includes('kitagent-live-stream-v2')){
 const live=`\n useEffect(()=>{\n  let socket; let stopped=false;\n  try{\n   ws.current?.close();\n   socket=new WebSocket('wss://stream.bybit.com/v5/public/linear');\n   ws.current=socket;\n   socket.onopen=()=>{if(stopped)return;socket.send(JSON.stringify({op:'subscribe',args:[\`tickers.\${symbol}\`,\`orderbook.50.\${symbol}\`,\`publicTrade.\${symbol}\`,\`kline.\${TF[tf]}.\${symbol}\`]}))};\n   socket.onmessage=e=>{if(stopped)return;try{const m=JSON.parse(e.data||'{}');const d=m.data;const topic=m.topic||'';\n    if(topic.startsWith('tickers.')){const x=Array.isArray(d)?d[0]:d;if(x)setTicker(prev=>({...prev,...x}))}\n    else if(topic.startsWith('orderbook.')){if(d?.a)setAsks(d.a.map(x=>({price:+x[0],size:+x[1]})));if(d?.b)setBids(d.b.map(x=>({price:+x[0],size:+x[1]})))}\n    else if(topic.startsWith('publicTrade.')){const rows=Array.isArray(d)?d:[];setTrades(prev=>[...rows.map(x=>({price:+x.p,size:+x.v,side:x.S})),...prev].slice(0,80))}\n    else if(topic.startsWith('kline.')){const rows=Array.isArray(d)?d:[];if(rows[0]){const k=rows[0];const next={time:+k.start,open:+k.open,high:+k.high,low:+k.low,close:+k.close,volume:+k.volume};setCandles(prev=>{const copy=prev.slice(-239);const last=copy[copy.length-1];if(last&&last.time===next.time)copy[copy.length-1]=next;else copy.push(next);return copy})}}\n   }catch{}};\n  }catch{socket=null}\n  return()=>{stopped=true;try{socket?.close()}catch{}};\n },[symbol,tf]);\n // kitagent-live-stream-v2`;
 p=p.replace(marker,live+marker);
 fs.writeFileSync(pp,p);
}
