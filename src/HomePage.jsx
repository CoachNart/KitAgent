import {useEffect,useMemo,useRef,useState} from 'react';
import {auth} from './firebase.js';
import {ArrowDownRight,ArrowUpRight,BarChart3,ChevronRight,Clock3,RefreshCw,TrendingUp,Zap,Activity,Target,ShieldCheck} from 'lucide-react';

const COINS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT'];
const api=(op,p={})=>fetch(`/api/bybit?${new URLSearchParams({op,...p})}`,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||j.ok===false)throw Error(j.error||'Request failed');return j});
const money=(v,d=2)=>Number.isFinite(Number(v))?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`:'—';
function CountUp({value,duration=1100}){const target=Number(value)||0;const ref=useRef(null);const [visible,setVisible]=useState(false);const [shown,setShown]=useState(0);useEffect(()=>{const el=ref.current;if(!el)return;const io=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setVisible(true);io.disconnect()}},{threshold:.35});io.observe(el);return()=>io.disconnect()},[]);useEffect(()=>{if(!visible)return;let raf=0,start=performance.now();const tick=now=>{const p=Math.min(1,(now-start)/duration);const eased=1-Math.pow(1-p,3);setShown(Math.round(target*eased));if(p<1)raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)},[visible,target,duration]);return <b ref={ref} className="snapshot-number" aria-label={String(target)}>{shown.toLocaleString()}</b>}

export default function HomePage({go,wallet}){
 const [tickers,setTickers]=useState([]),[busy,setBusy]=useState(false),[updated,setUpdated]=useState(Date.now());
 const refresh=async()=>{setBusy(true);try{const rows=await Promise.all(COINS.map(async symbol=>{const j=await api('ticker',{symbol});const x=j.list?.[0]||{};return {symbol,last:Number(x.lastPrice),change:Number(x.price24hPcnt)*100,turnover:Number(x.turnover24h)}}));setTickers(rows);setUpdated(Date.now())}finally{setBusy(false)}};
 useEffect(()=>{refresh();const t=setInterval(refresh,10000);return()=>clearInterval(t)},[]);
 const btc=useMemo(()=>tickers.find(x=>x.symbol==='BTCUSDT')||{},[tickers]);
 const rawDisplayName=auth?.currentUser?.displayName||auth?.currentUser?.email?.split('@')[0]||'Trader';
 const displayName=useMemo(()=>{const clean=String(rawDisplayName).trim().replace(/[._-]+/g,' ');const first=clean.split(/\s+/)[0]||'Trader';return first.charAt(0).toUpperCase()+first.slice(1).toLowerCase()},[rawDisplayName]);
 const [signalStats,setSignalStats]=useState({total:0,long:0,short:0,ready:0}),[recentSignals,setRecentSignals]=useState([]);
 useEffect(()=>{let cancelled=false;(async()=>{try{if(!auth?.currentUser)return;const token=await auth.currentUser.getIdToken();const r=await fetch('/api/signals',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return;const j=await r.json();const rows=Array.isArray(j.signals)?j.signals:[];if(!cancelled){setSignalStats({total:rows.length,long:rows.filter(x=>x?.direction==='LONG').length,short:rows.filter(x=>x?.direction==='SHORT').length,ready:rows.filter(x=>x?.status==='open'&&x?.entry!=null).length});setRecentSignals(rows.slice(0,3));}}catch{} })();return()=>{cancelled=true}},[]);
 return <div className="home-page">
  <section className="home-top">
   <div><span className="tiny-label">MARKET OVERVIEW</span><h1>Good to see you, {displayName}.</h1><p>Welcome To Your Crypto Command Center for AI-powered market intelligence, actionable trade setups, real-time signals, and a smarter way to trade.</p></div>
   <button className="home-refresh" onClick={refresh} disabled={busy} aria-label="Refresh markets"><RefreshCw size={17} className={busy?'spin':''}/></button>
  </section>
  <section className="home-balance">
   <div className="balance-head"><span>MARKET PULSE</span><i><span/> LIVE</i></div>
   <div className="balance-value">{money(btc.last,2)}</div>
   <div className={btc.change>=0?'balance-change up':'balance-change down'}>{btc.change>=0?<ArrowUpRight size={15}/>:<ArrowDownRight size={15}/>} {pct(btc.change)} <span>BTC · 24H</span></div>
   <div className="mini-chart" aria-hidden="true"><svg viewBox="0 0 500 110" preserveAspectRatio="none"><path d="M0 82 C35 75 48 86 76 66 S118 78 145 58 S188 62 215 45 S252 58 278 41 S320 52 345 28 S382 47 410 35 S450 40 500 15" fill="none"/><path d="M0 82 C35 75 48 86 76 66 S118 78 145 58 S188 62 215 45 S252 58 278 41 S320 52 345 28 S382 47 410 35 S450 40 500 15 L500 110 L0 110 Z"/></svg></div>
   <div className="balance-foot"><span>BTC/USDT perpetual</span><span>Updated {new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
  </section>
  <div className="home-section-head"><div><span className="tiny-label">MARKETS</span><h2>What's moving</h2></div><button onClick={()=>go('market')}>View analysis <ChevronRight size={15}/></button></div>
  <section className="market-list">{tickers.map(x=><button key={x.symbol} className="market-row" onClick={()=>go('market')}><span className="coin-mark">{x.symbol.slice(0,-4).slice(0,1)}</span><span className="coin-name"><b>{x.symbol.replace('USDT','')}</b><small>USDT</small></span><span className="coin-price">{money(x.last, x.last<1?4:2)}</span><span className={x.change>=0?'coin-change up':'coin-change down'}>{pct(x.change)}</span></button>)}</section>
  <section className="home-glance">
   <div className="glance-card primary"><div className="glance-icon"><TrendingUp size={17}/></div><div><span>MARKET STATUS</span><b>Live & moving</b><small>Prices refresh automatically</small></div><i><span/></i></div>
   <div className="glance-card"><div className="glance-icon"><Zap size={17}/></div><div><span>SETUPS</span><b>Ready to explore</b><small>Find quality opportunities</small></div><button onClick={()=>go('market')}>Open <ChevronRight size={13}/></button></div>
   <div className="glance-card"><div className="glance-icon"><Clock3 size={17}/></div><div><span>ACTIVITY</span><b>Stay in control</b><small>Review your trading history</small></div><button onClick={()=>go('history')}>View <ChevronRight size={13}/></button></div>
  </section>
  <section className="home-insights">
   <div className="insight-intro"><span className="tiny-label">YOUR ACTIVITY</span><h2>Your trading snapshot</h2><p>A quick view of the signals you've generated and the workspace you've been using.</p></div>
   <div className="insight-stat"><div><span>SIGNALS</span><CountUp value={signalStats.total}/></div><Activity size={16}/></div>
   <div className="insight-stat"><div><span>LONG</span><CountUp value={signalStats.long}/></div><TrendingUp size={16}/></div>
   <div className="insight-stat"><div><span>SHORT</span><CountUp value={signalStats.short}/></div><ArrowDownRight size={16}/></div>
   <div className="insight-stat"><div><span>TRADE READY</span><CountUp value={signalStats.ready}/></div><Target size={16}/></div>
  </section>
  <section className="home-signal-panel">
   <div className="signal-panel-head"><div><span className="tiny-label">SIGNAL DESK</span><h2>Your recent signals</h2><p>Generated from your market analysis sessions.</p></div><button onClick={()=>go('history')}>View all <ChevronRight size={14}/></button></div>
   {recentSignals.length?<div className="signal-feed">{recentSignals.map(x=><button className="signal-feed-row" key={x.id||x.signalId} onClick={()=>go('history')}><span className={x.direction==='LONG'?'signal-dot long':x.direction==='SHORT'?'signal-dot short':'signal-dot wait'}/><span className="signal-feed-main"><b>{x.symbol}</b><small>{x.timeframe} · {x.direction}</small></span><span className="signal-feed-value"><b>{x.riskReward||'Watching'}</b><small>{x.entry!=null?'Entry '+Number(x.entry).toLocaleString():'No entry yet'}</small></span><ChevronRight size={14}/></button>)}</div>:<div className="signal-empty"><div><Activity size={17}/></div><span><b>Your signal desk is quiet</b><small>Run a market analysis and your generated setups will appear here.</small></span><button onClick={()=>go('market')}>Analyze market <ChevronRight size={13}/></button></div>}
  </section>
  <div className="home-section-head"><div><span className="tiny-label">YOUR WORKSPACE</span><h2>Jump in</h2></div></div>
  <section className="home-actions">
   <button onClick={()=>go('perps')}><span className="action-icon cyan"><Zap size={18}/></span><span><b>Perpetuals</b><small>Trade live crypto markets</small></span><ChevronRight size={16}/></button>
   <button onClick={()=>go('market')}><span className="action-icon"><BarChart3 size={18}/></span><span><b>Market analysis</b><small>Read the setup before you trade</small></span><ChevronRight size={16}/></button>
   <button onClick={()=>go('history')}><span className="action-icon"><Clock3 size={18}/></span><span><b>Activity</b><small>Review your recent actions</small></span><ChevronRight size={16}/></button>
  </section>
  <section className="home-strip"><div className="strip-icon"><TrendingUp size={18}/></div><div><b>Built for the market first</b><p>Live prices, execution and intelligence in one focused workspace.</p></div></section>
 </div>
}