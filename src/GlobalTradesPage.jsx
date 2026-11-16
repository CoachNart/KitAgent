import {useCallback,useEffect,useState} from 'react';
import {auth} from './firebase.js';
import {RefreshCw,TrendingDown,TrendingUp} from 'lucide-react';
import './global-trades.css';
const fmt=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:n>=1000?2:n>=1?5:8}):'—'};
const date=v=>{const d=v?.seconds?new Date(v.seconds*1000):v?._seconds?new Date(v._seconds*1000):new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})};
export default function GlobalTradesPage({view='active'}){
 const [trades,setTrades]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const user=auth?.currentUser;if(!user)throw new Error('Sign in to view shared trades.');const token=await user.getIdToken();const path=view==='active'?'/api/active-trades':'/api/trade-history';const r=await fetch(path,{headers:{Authorization:'Bearer '+token},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||'Trade records could not be loaded.');setTrades(body.trades||[]);setError('')}catch(e){setError(e.message||'Trade records could not be loaded.')}finally{setLoading(false)}},[view]);
 useEffect(()=>{let dead=false;const run=()=>{if(!dead)load()};run();const t=setInterval(run,60000);return()=>{dead=true;clearInterval(t)}},[load]);
 const active=view==='active';
 return <main className="global-trades page-wrap"><header className="gt-head"><div><span className="gt-kicker">KITSETUPS · SHARED TRACK RECORD</span><h1>{active?'Active trades':'Trade history'}</h1><p>{active?'Only entries confirmed by Bybit data appear here.':'Completed trades with verified TP or SL outcomes.'}</p></div><button onClick={load}><RefreshCw size={14}/> Refresh</button></header>
 {error&&<div className="gt-error">{error}</div>}
 {loading?<div className="gt-empty">Loading trades…</div>:!trades.length?<div className="gt-empty"><b>{active?'No active trades.':'No completed trades yet.'}</b><span>{active?'Pending limit entries remain on Daily setups until the entry is confirmed.':'History is populated only after a verified target or stop outcome.'}</span></div>:<section className="gt-list">{trades.map((s,i)=><article className="gt-card" key={s.id||i}><header><div><b>{s.symbol}</b><small>{s.strategy} · {s.timeframe} · {s.orderType}</small></div><span className={'gt-status '+String(s.status).toLowerCase()}>{String(s.status).replace(/_/g,' ')}</span></header><div className="gt-direction">{s.bias==='LONG'?<TrendingUp size={14}/>:<TrendingDown size={14}/>} {s.bias} <span>{s.grade} · 1:{Number(s.rr||0).toFixed(2)}</span></div><div className="gt-levels"><div><small>ENTRY</small><b>{fmt(s.entry)}</b></div><div><small>STOP</small><b>{fmt(s.stopLoss)}</b></div><div><small>TARGET</small><b>{fmt(s.takeProfit)}</b></div><div><small>LAST PRICE</small><b>{fmt(s.currentPrice)}</b></div></div><p>{s.statusReason||''}</p><footer>{active?'Activated':'Closed'} {date(active?s.activatedAt:s.closedAt)}</footer></article>)}</section>}
 </main>
}
