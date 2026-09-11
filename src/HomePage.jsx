import {useEffect,useMemo,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,BarChart3,ChevronRight,Clock3,RefreshCw,TrendingUp,Wallet,Zap} from 'lucide-react';

const COINS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT'];
const api=(op,p={})=>fetch(`/api/bybit?${new URLSearchParams({op,...p})}`,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||j.ok===false)throw Error(j.error||'Request failed');return j});
const money=(v,d=2)=>Number.isFinite(Number(v))?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`:'—';

export default function HomePage({go,wallet}){
 const [tickers,setTickers]=useState([]),[busy,setBusy]=useState(false),[updated,setUpdated]=useState(Date.now());
 const refresh=async()=>{setBusy(true);try{const rows=await Promise.all(COINS.map(async symbol=>{const j=await api('ticker',{symbol});const x=j.list?.[0]||{};return {symbol,last:Number(x.lastPrice),change:Number(x.price24hPcnt)*100,turnover:Number(x.turnover24h)}}));setTickers(rows);setUpdated(Date.now())}finally{setBusy(false)}};
 useEffect(()=>{refresh();const t=setInterval(refresh,10000);return()=>clearInterval(t)},[]);
 const btc=useMemo(()=>tickers.find(x=>x.symbol==='BTCUSDT')||{},[tickers]);
 return <div className="home-page">
  <section className="home-top">
   <div><span className="tiny-label">MARKET OVERVIEW</span><h1>Good to see you.</h1><p>Welcome To Your Crypto Command Center for AI-powered market intelligence, actionable trade setups, real-time signals, and a smarter way to trade.</p></div>
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
  <div className="home-section-head"><div><span className="tiny-label">YOUR WORKSPACE</span><h2>Jump in</h2></div></div>
  <section className="home-actions">
   <button onClick={()=>go('perps')}><span className="action-icon cyan"><Zap size={18}/></span><span><b>Perpetuals</b><small>Trade live crypto markets</small></span><ChevronRight size={16}/></button>
   <button onClick={()=>go('market')}><span className="action-icon"><BarChart3 size={18}/></span><span><b>Market analysis</b><small>Read the setup before you trade</small></span><ChevronRight size={16}/></button>
   <button onClick={()=>go('activity')}><span className="action-icon"><Clock3 size={18}/></span><span><b>Activity</b><small>Review your recent actions</small></span><ChevronRight size={16}/></button>
  </section>
  <section className="home-strip"><div className="strip-icon"><TrendingUp size={18}/></div><div><b>Built for the market first</b><p>Live prices, execution and intelligence in one focused workspace.</p></div></section>
 </div>
}