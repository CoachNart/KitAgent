import {useEffect,useMemo,useRef,useState} from 'react';
import {auth} from './firebase.js';
import {ArrowDownRight,ArrowUpRight,BarChart3,ChevronRight,Clock3,RefreshCw,TrendingUp,Zap,Activity,ShieldCheck,BookOpen} from 'lucide-react';
import {getDailyTekLesson} from './kitLessons.js';

const COINS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT'];
const api=()=>fetch('/api/market?action=header',{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||j.ok===false)throw Error(j.error||'Request failed');return j});
const money=(v,d=2)=>Number.isFinite(Number(v))?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`:'—';
export default function HomePage({go,onLesson}){
 const [tickers,setTickers]=useState([]),[busy,setBusy]=useState(false),[updated,setUpdated]=useState(Date.now());
 const [openTrades,setOpenTrades]=useState([]);
 const loadOpenTrades=async()=>{try{let creds={};try{creds=JSON.parse(localStorage.getItem('kitsetups_mexc_credentials_v2')||'{}')}catch{}if(!creds.key||!creds.secret){setOpenTrades([]);return}const r=await fetch('/api/cex',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'positions',key:creds.key,secret:creds.secret})});const j=await r.json();if(!r.ok||j?.error)throw Error(j?.error||'Unable to load positions');const rows=Array.isArray(j?.data)?j.data:Array.isArray(j?.data?.data)?j.data.data:Array.isArray(j?.result)?j.result:[];setOpenTrades(rows.filter(p=>Number(p.holdVol??p.vol??p.size??0)>0))}catch{setOpenTrades([])}};
 useEffect(()=>{loadOpenTrades();const t=setInterval(loadOpenTrades,5000);return()=>clearInterval(t)},[]);
 const refresh=async()=>{setBusy(true);try{const j=await api(),rows=(Array.isArray(j.result)?j.result:[]).filter(x=>COINS.includes(x.symbol)).map(x=>({symbol:x.symbol,last:Number(x.lastPrice),change:Number(x.price24hPcnt)*100,turnover:Number(x.turnover24h)}));setTickers(rows);setUpdated(Date.now())}finally{setBusy(false)}};
 useEffect(()=>{refresh();const t=setInterval(refresh,10000);return()=>clearInterval(t)},[]);
 const btc=useMemo(()=>tickers.find(x=>x.symbol==='BTCUSDT')||{},[tickers]);
 const rawDisplayName=auth?.currentUser?.displayName||auth?.currentUser?.email?.split('@')[0]||'Trader';
 const displayName=useMemo(()=>{const clean=String(rawDisplayName).trim().replace(/[._-]+/g,' ');const first=clean.split(/\s+/)[0]||'Trader';return first.charAt(0).toUpperCase()+first.slice(1).toLowerCase()},[rawDisplayName]);
 const [recentSignals,setRecentSignals]=useState([]);
 useEffect(()=>{let cancelled=false;(async()=>{try{if(!auth?.currentUser)return;const token=await auth.currentUser.getIdToken();const r=await fetch('/api/signals',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)return;const j=await r.json();const rows=Array.isArray(j.signals)?j.signals:[];if(!cancelled)setRecentSignals(rows.slice(0,3));}catch{} })();return()=>{cancelled=true}},[]);
 const openDailyTek=()=>{const lesson=getDailyTekLesson();if(lesson)onLesson?.(lesson.id)};
 return <div className="home-page">
  <section className="home-top">
   <div><span className="tiny-label">MARKET OVERVIEW</span><h1>Good to see you, {displayName}.</h1><p>Markets are moving. Stay ahead.</p></div>
   <button className="home-refresh" onClick={refresh} disabled={busy} aria-label="Refresh markets"><RefreshCw size={17} className={busy?'spin':''}/></button>
  </section>
  <section className="home-balance">
   <div className="balance-head"><span>MARKET PULSE</span><i><span/> LIVE</i></div>
   <div className="balance-value">{money(btc.last,2)}</div>
   <div className={btc.change>=0?'balance-change up':'balance-change down'}>{btc.change>=0?<ArrowUpRight size={15}/>:<ArrowDownRight size={15}/>} {pct(btc.change)} <span>BTC · 24H</span></div>
   <div className="mini-chart" aria-hidden="true"><svg viewBox="0 0 500 110" preserveAspectRatio="none"><path d="M0 82 C35 75 48 86 76 66 S118 78 145 58 S188 62 215 45 S252 58 278 41 S320 52 345 28 S382 47 410 35 S450 40 500 15" fill="none"/><path d="M0 82 C35 75 48 86 76 66 S118 78 145 58 S188 62 215 45 S252 58 278 41 S320 52 345 28 S382 47 410 35 S450 40 500 15 L500 110 L0 110 Z"/></svg></div>
   <div className="balance-foot"><span>BTC/USDT perpetual</span><span>Updated {new Date(updated).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
  </section>
  <section className="home-actions" aria-label="Quick actions">
   <button className="home-action-btn" onClick={()=>go('perps')} aria-label="Perpetuals"><span className="action-icon"><Zap size={18}/></span><b>Perpetuals</b><ChevronRight size={15}/></button>
   <button className="home-action-btn" onClick={()=>go('market')} aria-label="Market analysis"><span className="action-icon"><BarChart3 size={18}/></span><b>Market analysis</b><ChevronRight size={15}/></button>
   <button className="home-action-btn" onClick={()=>go('history')} aria-label="Activity"><span className="action-icon"><Clock3 size={18}/></span><b>Activity</b><ChevronRight size={15}/></button>
   <button className="home-action-btn" onClick={()=>go('profile')} aria-label="Settings"><span className="action-icon"><ShieldCheck size={18}/></span><b>Settings</b><ChevronRight size={15}/></button>
   <button className="home-action-btn home-promo-btn" onClick={openDailyTek} aria-label="Daily TEK"><span className="action-icon"><BookOpen size={18}/></span><b>Daily TEK</b><ChevronRight size={15}/></button>
   <a className="home-action-btn home-promo-btn" href="https://t3kit.xyz" target="_blank" rel="noreferrer" aria-label="T3Kit"><span className="action-icon"><img className="t3kit-logo" src="https://t3kit.xyz/favicon.ico" alt="T3Kit"/></span><b>T3Kit</b><ChevronRight size={15}/></a>
  </section>
  <div className="home-section-head"><div><span className="tiny-label">MARKETS</span><h2>What's moving</h2></div><button onClick={()=>go('market')}>View analysis <ChevronRight size={15}/></button></div>
  <section className="market-list">{tickers.map(x=><button key={x.symbol} className="market-row" onClick={()=>go('market')}><span className="coin-mark">{x.symbol.slice(0,-4).slice(0,1)}</span><span className="coin-name"><b>{x.symbol.replace('USDT','')}</b><small>USDT</small></span><span className={x.change>=0?"coin-price up":"coin-price down"}>{money(x.last, x.last<1?4:2)}</span><span className={x.change>=0?'coin-change up':'coin-change down'}>{pct(x.change)}</span></button>)}</section>
  <section className="home-glance">
   <div className="glance-card primary"><div className="glance-icon"><TrendingUp size={17}/></div><div><span>MARKET STATUS</span><b>Live & moving</b><small>Prices refresh automatically</small></div><i><span/></i></div>
   <div className="glance-card"><div className="glance-icon"><Zap size={17}/></div><div><span>SETUPS</span><b>Ready to explore</b><small>Find quality opportunities</small></div><button onClick={()=>go('market')}>Open <ChevronRight size={13}/></button></div>
   <div className="glance-card"><div className="glance-icon"><Clock3 size={17}/></div><div><span>ACTIVITY</span><b>Stay in control</b><small>Review your trading history</small></div><button onClick={()=>go('history')}>View <ChevronRight size={13}/></button></div>
  </section>
  <section className="home-signal-panel home-open-trades">
   <div className="signal-panel-head"><div><span className="tiny-label">LIVE TRADING</span><h2>Open trades</h2><p>Monitor your live positions without leaving Home.</p></div><button onClick={()=>go('perps')}>Open CEX <ChevronRight size={14}/></button></div>
   {openTrades.length?<div className="signal-feed">{openTrades.map((p,i)=>{const pnl=Number(p.unRealizedPnl??p.unrealizedPnl??p.unrealisedPnl);const side=Number(p.positionType)===1||Number(p.side)===1?'LONG':'SHORT';return <button className="signal-feed-row" key={p.positionId||i} onClick={()=>go('perps')}><span className={side==='LONG'?'signal-dot long':'signal-dot short'}/><span className="signal-feed-main"><b>{String(p.symbol||'').replace('_USDT','/USDT')}</b><small>{side} · Entry {p.holdAvgPrice||p.entryPrice||'—'}</small></span><span className="signal-feed-value"><b>{Number.isFinite(pnl)?pct(pnl):'—'}</b><small>Mark {p.markPrice||p.fairPrice||'—'}</small></span><ChevronRight size={14}/></button>})}</div>:<div className="signal-empty"><div><ShieldCheck size={17}/></div><span><b>No open trades</b><small>Live positions will appear here when you have an active trade.</small></span><button onClick={()=>go('perps')}>Open CEX <ChevronRight size={13}/></button></div>}
  </section>
  <section className="home-signal-panel">
   <div className="signal-panel-head"><div><span className="tiny-label">SIGNAL DESK</span><h2>Your recent signals</h2><p>Generated from your market analysis sessions.</p></div><button onClick={()=>go('history')}>View all <ChevronRight size={14}/></button></div>
   {recentSignals.length?<div className="signal-feed">{recentSignals.map(x=><button className="signal-feed-row" key={x.id||x.signalId} onClick={()=>go('history')}><span className={x.direction==='LONG'?'signal-dot long':x.direction==='SHORT'?'signal-dot short':'signal-dot wait'}/><span className="signal-feed-main"><b>{x.symbol}</b><small>{x.timeframe} · {x.direction}</small></span><span className="signal-feed-value"><b>{x.riskReward||'Watching'}</b><small>{x.entry!=null?'Entry '+Number(x.entry).toLocaleString():'No entry yet'}</small></span><ChevronRight size={14}/></button>)}</div>:<div className="signal-empty"><div><Activity size={17}/></div><span><b>Your signal desk is quiet</b><small>Run a market analysis and your generated setups will appear here.</small></span><button onClick={()=>go('market')}>Analyze market <ChevronRight size={13}/></button></div>}
  </section>

 </div>
}