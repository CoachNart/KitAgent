import {useEffect,useMemo,useState} from 'react';
import {auth} from './firebase.js';
import {ArrowUpRight,ChevronRight,Clock3,RefreshCw,ScanSearch,ShieldCheck,Target,TrendingDown,TrendingUp} from 'lucide-react';
import './daily-setups.css';

const DAY_KEY='kitagent:daily-setups:v3';

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
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(null);
  const [rescanning,setRescanning]=useState(false);

  const load=async(force=false)=>{
    setError('');
    if(!force){
      try{
        const cached=JSON.parse(localStorage.getItem(DAY_KEY)||'null');
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        if(cached?.dayKey===today&&Array.isArray(cached?.setups)){setData(cached);setLoading(false);return;}
      }catch{}
    }
    setLoading(true);
    try{
      const t=await token();
      if(!t)throw new Error('Authentication is still initializing. Please retry.');
      const r=await fetch('/api/daily-setups',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      const body=await r.json().catch(()=>({}));
      if(!r.ok||!body.ok)throw new Error(body.error||'Daily setup scan failed.');
      setData(body);
      try{localStorage.setItem(DAY_KEY,JSON.stringify(body));}catch{}
    }catch(e){setError(e.message||'Unable to load today’s setups.');}
    finally{setLoading(false);setRescanning(false)}
  };

  useEffect(()=>{load(false)},[]);

  const setups=useMemo(()=>Array.isArray(data?.setups)?data.setups:[],[data]);
  const best=setups[0];
  const remaining=Math.max(0,5-setups.length);

  if(loading)return <div className="daily-setups page-wrap"><DailyHeader/><div className="daily-loading"><div className="scan-ring"/><b>Scanning the market</b><span>Structure, liquidity, location, confirmation, invalidation and target quality are being checked across the highest-activity perpetuals.</span></div></div>;

  return <div className="daily-setups page-wrap">
    <header className="daily-hero">
      <div>
        <span className="tiny-label">DAILY SETUP DESK</span>
        <h1>Today’s setups</h1>
        <p>KitSetups scans the market automatically and publishes only trades that pass the engine’s structural and risk filters.</p>
      </div>
      <div className="daily-date"><Clock3 size={13}/><span>{dayLabel(data?.dayKey||'')}</span></div>
    </header>

    {error&&<div className="daily-error">{error}<button onClick={()=>load(true)}>Retry</button></div>}

    <section className="daily-status">
      <div className="daily-status-main">
        <span className="status-dot"/>
        <div><b>{setups.length} qualified setups</b><small>{data?.scanUniverse||0} high-activity perpetuals scanned · {data?.source||'Bybit'}</small></div>
      </div>
      <div className="daily-status-target"><span>DAILY TARGET</span><b>{setups.length}/5</b></div>
      <button className="daily-rescan" disabled={rescanning} onClick={()=>{setRescanning(true);load(true)}}><RefreshCw size={13} className={rescanning?'spin':''}/>Rescan</button>
    </section>

    {setups.length===0&&<div className="daily-empty"><ScanSearch size={27}/><b>No qualified setup has cleared the filters yet.</b><span>The scanner will not invent a trade to fill the daily target. A setup appears only when structure, confirmation, invalidation, target and risk/reward are coherent.</span></div>}

    {remaining>0&&setups.length>0&&<div className="daily-quality-note"><ShieldCheck size={14}/><span>The engine found {setups.length} publishable setup{setups.length===1?'':'s'} so far. {remaining} more are required to reach the five-setup daily target; no synthetic signals are added.</span></div>}

    {best&&<section className="daily-featured">
      <div className="featured-kicker"><span>TOP SETUP</span><b>{best.grade}</b></div>
      <div className="featured-grid">
        <div className="featured-symbol"><small>{best.strategy}</small><h2>{best.symbol}</h2><div className={'setup-direction '+best.bias.toLowerCase()}>{best.bias==='LONG'?<TrendingUp size={16}/>:<TrendingDown size={16}/>} {best.bias} SETUP <em>{best.timeframe}</em></div></div>
        <div className="featured-metrics"><div className="featured-metric"><span>Entry <em className="order-type-inline">{best.orderType||'MARKET'}</em></span><b>{money(best.entry)}</b>{best.orderType==='LIMIT'&&<small>Current {money(best.marketEntry)}</small>}</div><Metric label="Stop" value={money(best.stopLoss)} danger/><Metric label="Target" value={money(best.takeProfit)} good/><Metric label="R:R" value={'1:'+best.rr}/></div>
      </div>
      <div className="featured-foot"><span>{best.regime?.name||best.regime||'Market structure aligned'}</span><button onClick={()=>setSelected(best)}>View setup <ArrowUpRight size={14}/></button></div>
    </section>}

    <div className="daily-list-head"><div><span className="tiny-label">THE BOARD</span><h2>Qualified trades</h2></div><small>Ranked by engine quality</small></div>
    <section className="setup-board">
      {setups.map((s,i)=><button className="setup-row" key={s.id||i} onClick={()=>setSelected(s)}>
        <span className="rank">{String(i+1).padStart(2,'0')}</span>
        <span className="setup-main"><b>{s.symbol}</b><small>{s.strategy} · {s.timeframe}</small></span><span className="row-entry"><b>{money(s.entry)} <em className="order-type-inline">{s.orderType||'MARKET'}</em></b></span>
        <span className={'row-direction '+s.bias.toLowerCase()}>{s.bias} SETUP</span>
        <span className="row-rr"><b>1:{s.rr}</b><small>R:R</small></span>
        <span className="row-grade">{s.grade}</span><ChevronRight size={15}/>
      </button>)}
    </section>

    <footer className="daily-footer"><span>Daily board resets automatically with the Africa/Lagos calendar day.</span><span>Analysis source: Bybit Linear USDT Perpetuals</span></footer>

    {selected&&<SetupModal setup={selected} close={()=>setSelected(null)}/>}
  </div>
}

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
