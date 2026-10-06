import {useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {ArrowUpRight,ChevronRight,Clock3,RefreshCw,ScanSearch,ShieldCheck,Target,TrendingDown,TrendingUp} from 'lucide-react';
import './daily-setups.css';


async function token(){
  const user=auth?.currentUser;
  if(!user)return '';
  return user.getIdToken();
}

function money(v){
  const n=Number(v);
  if(!Number.isFinite(n))return '—';
  return n.toLocaleString(undefined,{maximumFractionDigits:n>=1000?2:n>=1?5:8});
}
function dayLabel(key){
  try{return new Intl.DateTimeFormat('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Lagos'}).format(new Date(key+'T12:00:00+01:00'));}catch{return key}
}

export default function DailySetupsPage(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[scanning,setScanning]=useState(false),[notice,setNotice]=useState(''),[remainingMs,setRemainingMs]=useState(0);
  const loadSaved=async()=>{setError('');setLoading(true);try{const t=await token();if(!t)throw new Error('Authentication is still initializing. Please retry.');const r=await fetch('/api/daily-setups',{headers:{Authorization:'Bearer '+t},cache:'no-store'}),body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||'Unable to load saved scanner setups.');setData(body);setRemainingMs(Number(body.remainingMs)||0);setNotice('')}catch(e){setError(e.message||'Unable to load saved scanner setups.')}finally{setLoading(false)}};
  const scan=async()=>{if(scanning||Number(data?.remainingSlots||0)<=0)return;setError('');setNotice('');setScanning(true);try{const t=await token();if(!t)throw new Error('Authentication is still initializing. Please retry.');const r=await fetch('/api/daily-setups',{method:'POST',headers:{Authorization:'Bearer '+t}}),body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||'Scanner run failed.');setData(body);setRemainingMs(Number(body.remainingMs)||0);setNotice(body.notice||'')}catch(e){setError(e.message||'Scanner run failed.')}finally{setScanning(false)}};
  useEffect(()=>{loadSaved()},[]);
  useEffect(()=>{const timer=setInterval(()=>setRemainingMs(v=>{const next=Math.max(0,v-1000);if(v>0&&next===0)loadSaved();return next}),1000);return()=>clearInterval(timer)},[]);
  const setups=useMemo(()=>Array.isArray(data?.setups)?data.setups:[],[data]),best=setups[0],generated=Number(data?.generatedCount)||setups.length,max=Number(data?.maxGenerated)||10,remainingSlots=Math.max(0,max-generated),limitReached=remainingSlots===0;
  if(loading)return <div className="daily-setups page-wrap"><DailyHeader/><div className="daily-loading"><div className="scan-ring"/><b>Loading saved setups</b><span>Your scanner board is being restored. Opening this page does not start a new market scan.</span></div></div>;
  return <div className="daily-setups page-wrap">
    <header className="daily-hero"><div><span className="tiny-label">SCANNER</span><h1>Quality setup scanner</h1><p>Run the scanner manually when you want fresh opportunities. Each run ranks the same Market Analysis engine and adds up to the top 3 quality setups to your board.</p></div><div className="daily-date"><Clock3 size={13}/><span>{remainingMs>0?'Window active':'Ready to scan'}</span></div></header>
    {error&&<div className="daily-error">{error}<button onClick={loadSaved}>Retry</button></div>}
    {notice&&<div className="daily-scan-notice" role="status"><span>{notice}</span></div>}
    <section className="daily-status"><div className="daily-status-main"><span className="status-dot"/><div><b>{generated}/{max} quality setups generated</b><small>{data?.scanUniverse||0} high-activity perpetuals scanned · {data?.source||'Bybit'}</small></div></div><div className="daily-status-target"><span>24H WINDOW</span><b>{generated}/{max}</b></div><button className="daily-rescan" disabled={scanning||limitReached} onClick={scan}><RefreshCw size={13} className={scanning?'spin':''}/>{scanning?'Scanning…':limitReached?'10 generated — reset pending':'Scan top 3'}</button></section>
    {remainingMs>0&&<div className="daily-quality-note"><ShieldCheck size={14}/><span>{limitReached?'The full 10-setup board is locked until the 24-hour window resets.':'Generated setups remain on this board for the full 24-hour window.'} Reset in <b>{formatCountdown(remainingMs)}</b>. When the window resets, the old setups are automatically cleared and the counter returns to zero.</span></div>}
    {setups.length===0&&<div className="daily-empty"><ScanSearch size={27}/><b>No scanner setups generated yet.</b><span>This page is read-only until you press <b>Scan top 3</b>. The scanner only accepts A+/A quality engine results with valid structure, confirmation, invalidation, target and at least 2R. It will never fill the board with weaker trades.</span></div>}
    {best&&<section className="daily-featured"><div className="featured-kicker"><span>TOP SETUP</span><b>{best.grade}</b></div><div className="featured-grid"><div className="featured-symbol"><small>{best.strategy}</small><h2>{best.symbol}</h2><div className={'setup-direction '+best.bias.toLowerCase()}>{best.bias==='LONG'?<TrendingUp size={16}/>:<TrendingDown size={16}/>} {best.bias} SETUP <em>{best.timeframe}</em></div></div><div className="featured-metrics"><div className="featured-metric"><span>Entry <em className="order-type-inline">{best.orderType||'MARKET'}</em></span><b>{money(best.entry)}</b>{best.orderType==='LIMIT'&&<small>Current {money(best.marketEntry)}</small>}</div><Metric label="Stop" value={money(best.stopLoss)} danger/><Metric label="Target" value={money(best.takeProfit)} good/><Metric label="R:R" value={'1:'+best.rr}/></div></div><div className="featured-foot"><span>{best.regime?.name||best.regime||'Market structure aligned'}</span><button onClick={()=>setSelected(best)}>View setup <ArrowUpRight size={14}/></button></div></section>}
    <div className="daily-list-head"><div><span className="tiny-label">THE BOARD</span><h2>Generated setups</h2></div><small>{generated}/{max} persisted</small></div>
    <section className="setup-board">{setups.map((s,i)=><button className="setup-row" key={s.id||i} onClick={()=>setSelected(s)}><span className="rank">{String(i+1).padStart(2,'0')}</span><span className="setup-main"><b>{s.symbol}</b><small>{s.strategy} · {s.timeframe}</small></span><span className="row-entry"><b>{money(s.entry)} <em className="order-type-inline">{s.orderType||'MARKET'}</em></b></span><span className={'row-direction '+s.bias.toLowerCase()}>{s.bias} SETUP</span><span className="row-rr"><b>1:{s.rr}</b><small>R:R</small></span><span className="row-grade">{s.grade}</span><ChevronRight size={15}/></button>)}</section>
    <footer className="daily-footer"><span>No automatic scanner publication. The board changes only when you press Scan top 3.</span><span>Analysis source: Bybit Linear USDT Perpetuals</span></footer>
    {selected&&<SetupModal setup={selected} close={()=>setSelected(null)}/>}
  </div>
}
function formatCountdown(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h+'h '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'s'}
function DailyHeader(){return <header className="daily-hero"><div><span className="tiny-label">DAILY SETUP DESK</span><h1>Today’s setups</h1><p>Scanning live perpetual markets for qualified opportunities.</p></div></header>}
function Metric({label,value,danger,good}){return <div className="featured-metric"><span>{label}</span><b className={danger?'danger':good?'good':''}>{value}</b></div>}
function SetupModal({setup,close}){
 return <div className="setup-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><article className="setup-modal">
   <button className="modal-close" onClick={close}>×</button>
   <div className="modal-top"><div><span>{setup.strategy}</span><h2>{setup.symbol}</h2></div><div className={'modal-direction '+setup.bias.toLowerCase()}>{setup.bias} SETUP</div></div>
   <div className="modal-meta"><span>{setup.grade} grade</span><span>{setup.timeframe} execution</span><span>{setup.regime?.name||setup.regime||'Aligned regime'}</span></div>
   <div className="modal-levels"><div className="featured-metric"><span>Entry <em className="order-type-inline">{setup.orderType||'MARKET'}</em></span><b>{money(setup.entry)}</b>{setup.orderType==='LIMIT'&&<small>Current {money(setup.marketEntry)}</small>}</div><Metric label="Stop loss" value={money(setup.stopLoss)} danger/><Metric label="Take profit" value={money(setup.takeProfit)} good/><Metric label="Risk / reward" value={'1:'+setup.rr}/></div>
   <div className="modal-section"><span>WHY IT QUALIFIED</span>{(setup.evidence||[]).map((x,i)=><p key={i}><ShieldCheck size={13}/>{x}</p>)}</div>
   <div className="modal-section"><span>STRUCTURE</span><p><Target size={13}/> {setup.structureDirection} structure · {setup.layers?.map(x=>x.tf+': '+x.direction).join(' · ')||'Multi-timeframe alignment checked'}</p></div>
   <div className="modal-note">This is a market-analysis setup, not an automatic order. The engine determines the thesis, invalidation and target from live market structure.</div>
 </article></div>
}
