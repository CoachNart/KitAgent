import {useEffect,useMemo,useState} from 'react';
import {Command,Play,RefreshCw,ShieldCheck,Terminal,Wifi} from 'lucide-react';
import './agent-terminal.css';

function fmtPct(v){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:'—'}
function fmtUsd(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n):'—'}

export default function AgentTerminalLayer(){
 const [command,setCommand]=useState('');
 const [running,setRunning]=useState(false);
 const [logs,setLogs]=useState([{kind:'system',text:'KitAgent execution terminal ready.'},{kind:'system',text:'Awaiting a task. Live data tools are connected.'}]);
 const [result,setResult]=useState(null);
 const [visible,setVisible]=useState(true);
 useEffect(()=>{const root=document.querySelector('.kit-shell');if(!root)return;const sync=()=>{const selected=root.querySelector('.side-link.selected');setVisible(selected?.textContent?.toLowerCase().includes('command center')??true)};sync();const mo=new MutationObserver(sync);mo.observe(root,{subtree:true,attributes:true,attributeFilter:['class']});return()=>mo.disconnect()},[]);
 const prompt='Find my best DeFi opportunity';
 const submit=async(raw=command)=>{const text=String(raw||'').trim();if(!text||running)return;setRunning(true);setResult(null);setLogs(l=>[...l,{kind:'input',text},{kind:'task',text:'Planning task → live Morpho discovery on Robinhood Chain'},{kind:'task',text:'Scanning markets + Vault V2 index…'}]);setCommand('');try{const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command:text})});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||`Agent returned ${r.status}`);setResult(body.result||null);setLogs(l=>[...l,{kind:'success',text:body.message||'Task completed.'},{kind:'success',text:'Task finished. Output rendered in the terminal.'}])}catch(e){setLogs(l=>[...l,{kind:'error',text:e.message||'Task failed.'}])}finally{setRunning(false)}};
 const best=useMemo(()=>result?.best||null,[result]);
 if(!visible)return null;
 return <section className="agent-terminal-shell">
   <div className="agent-terminal-head"><div><div className="agent-terminal-title"><span className="terminal-icon"><Terminal size={15}/></span><b>AGENT EXECUTION TERMINAL</b><span className="terminal-live"><i/> LIVE</span></div><small>Primary interface for agent responses, live data scans and task execution.</small></div><div className="terminal-state"><Wifi size={13}/> tools online</div></div>
   <div className="agent-terminal-body">
    <div className="agent-output">
      <div className="output-bar"><span>OUTPUT</span><span>ROBINHOOD CHAIN · 4663</span></div>
      <div className="output-scroll">{logs.map((x,i)=><div key={i} className={`terminal-line ${x.kind}`}><span className="line-mark">{x.kind==='input'?'>':x.kind==='error'?'!':x.kind==='success'?'✓':'·'}</span><span>{x.text}</span></div>)}{running&&<div className="terminal-line task"><span className="line-mark"><RefreshCw size={12} className="spin"/></span><span>Executing live task…</span></div>}
      {best&&<div className="opportunity-output"><div className="opp-kicker">BEST CURRENT OPPORTUNITY</div><div className="opp-name">{best.name||best.symbol||best.marketId}</div><div className="opp-grid"><div><span>TYPE</span><b>{best.type}</b></div><div><span>APY</span><b>{fmtPct(best.avgNetApyExcludingRewards??best.supplyApy)}</b></div><div><span>TVL</span><b>{fmtUsd(best.totalAssetsUsd??best.tvl)}</b></div><div><span>LIQUIDITY</span><b>{fmtUsd(best.liquidityUsd??best.liquidity)}</b></div></div><div className="opp-note">Ranked from live Morpho data. APY, TVL and liquidity are shown only when returned by the protocol.</div></div>}</div>
    </div>
    <div className="agent-input-wrap"><div className="input-label"><span><Command size={13}/> TASK INPUT</span><span>Ctrl/⌘ + Enter</span></div><div className="agent-input"><Command size={17}/><textarea value={command} onChange={e=>setCommand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submit()}}} placeholder="Give KitAgent a task…"/><button onClick={()=>submit()} disabled={running||!command.trim()}><Play size={14}/>{running?'Running':'Run task'}</button></div><button className="terminal-suggestion" onClick={()=>{setCommand(prompt);submit(prompt)}} disabled={running}>Run: {prompt}</button></div>
   </div>
   <div className="agent-terminal-foot"><span><ShieldCheck size={13}/> Permission-gated execution</span><span>Read-only discovery never signs a transaction.</span></div>
 </section>
}
