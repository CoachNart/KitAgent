import {useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {Clock3,RefreshCw,ShieldCheck,TrendingDown,TrendingUp} from 'lucide-react';
import './daily-board.css';
const fmt=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:n>=1000?2:n>=1?5:8}):'—'};
const date=v=>{const d=v?.seconds?new Date(v.seconds*1000):v?._seconds?new Date(v._seconds*1000):new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})};
export default function DailyBoardPage(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const user=auth?.currentUser;if(!user)throw new Error('Sign in to view the shared daily board.');const token=await user.getIdToken();const r=await fetch('/api/daily-setups',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||'Daily setups could not be loaded.');const changes=Array.isArray(body.recentChanges)?body.recentChanges:[];let prior={};try{prior=JSON.parse(localStorage.getItem('kitsetups:daily-board-statuses')||'{}')}catch{};const next={...prior};let count=0;for(const trade of changes){const id=trade.id||trade.sourceSetupId,status=trade.status;if(id&&prior[id]&&prior[id]!==status){count++;const message=trade.symbol+' · '+status.replace(/_/g,' ')+(trade.statusReason?' — '+trade.statusReason:'');setNotice(message);if(typeof Notification!=='undefined'&&Notification.permission==='granted'){try{new Notification('KitSetups trade update',{body:message,tag:'kitsetups-trade-'+id})}catch{}}}if(id)next[id]=status;}try{localStorage.setItem('kitsetups:daily-board-statuses',JSON.stringify(next))}catch{};setData(body);setError('');}catch(e){setError(e.message||'Daily setups could not be loaded.')}finally{setLoading(false)}},[]);
 useEffect(()=>{let dead=false;const run=()=>{if(!dead)load()};run();const t=setInterval(run,60000);return()=>{dead=true;clearInterval(t)}},[load]);
 const enable=async()=>{if(typeof Notification==='undefined')return;const result=await Notification.requestPermission();if(result==='granted')setNotice('Browser notifications enabled for setup status changes.');};
 const setups=data?.setups||[],reset=data?.resetsAt?date(data.resetsAt):'—';
 return <main className="daily-board page-wrap">
  <header className="db-head"><div><span className="db-kicker">KITSETUPS · BYBIT PERPETUALS</span><h1>Daily setups</h1><p>One shared board. Up to five setups per 24-hour cycle. No filler trades.</p></div><div className="db-actions"><button onClick={load}><RefreshCw size={14}/> Refresh</button><button onClick={enable}><ShieldCheck size={14}/> Notifications</button></div></header>
  <section className="db-status"><div><span className="db-live-dot"/><b>{data?.status==='PUBLISHED'?'Daily board published':data?.status==='FAILED'?'Publication failed':'Waiting for daily publication'}</b><small>{data?.setupCount??0}/5 published · {data?.scanUniverse??0} Bybit markets evaluated</small></div><div><span>BOARD RESETS</span><b>{reset}</b></div></section>
  {notice&&<div className="db-notice">{notice}</div>}{error&&<div className="db-error">{error}</div>}
  {loading?<div className="db-empty">Loading the shared daily board…</div>:setups.length===0?<div className="db-empty"><ShieldCheck size={24}/><b>No pending setups right now.</b><span>The system publishes only setups that clear the full quality gate. A quiet board is better than a weak trade.</span></div>:<section className="db-list">{setups.map((s,i)=><article className="db-card" key={s.id||i}>
   <div className="db-card-top"><span className="db-rank">{String(i+1).padStart(2,'0')}</span><div><h2>{s.symbol}</h2><small>{s.strategy} · {s.timeframe}</small></div><span className={'db-state '+String(s.status).toLowerCase()}>{String(s.status).replace(/_/g,' ')}</span></div>
   <div className="db-direction">{s.bias==='LONG'?<TrendingUp size={15}/>:<TrendingDown size={15}/>} {s.bias} <span>{s.grade} · {s.qualityScore}/100</span></div>
   <div className="db-levels"><div><small>{s.orderType==='LIMIT'?'LIMIT ENTRY':'ENTRY'}</small><b>{fmt(s.entry)}</b></div><div><small>STOP LOSS</small><b>{fmt(s.stopLoss)}</b></div><div><small>TAKE PROFIT</small><b>{fmt(s.takeProfit)}</b></div><div><small>R:R</small><b>1:{Number(s.rr||0).toFixed(2)}</b></div></div>
   <p className="db-reason">{s.statusReason||'Waiting for activation.'}</p><footer>Published {date(s.publishedAt)} · {s.orderType} order</footer>
  </article>)}</section>}
  <p className="db-footnote">Minimum publication requirement: B-grade (75+) structural quality or stronger, with at least 3R to a confirmed structural target. B is shown as a separate tier; RR is not a win-probability claim.</p>
 </main>
}
