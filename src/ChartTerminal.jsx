import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,Command,ExternalLink,Maximize2,RefreshCw,ShieldCheck,Target,TrendingDown,TrendingUp,X} from 'lucide-react';
import {FOREX,CRYPTO,TIMEFRAMES} from './LiveMarketPage.jsx';

const TABS=[['forex','FX'],['crypto','SPOT'],['perpetual','PERPS']];
const TV_INTERVAL={'15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
function tvSymbol(market,pair){if(market==='forex')return `OANDA:${pair}`;const base=pair.replace('/','');return market==='perpetual'?`BINANCE:${base}.P`:`BINANCE:${base}`;}
function displayPair(market,pair){return market==='forex'?pair:pair.replace('USDT','/USDT');}
function normalizeSavedPair(market,symbol){if(!symbol)return null;return market==='forex'?symbol:symbol.replace(/USDT$/,'/USDT');}

export default function ChartTerminal(){
 const [market,setMarket]=useState('forex');
 const [pair,setPair]=useState(FOREX[0]);
 const [timeframe,setTimeframe]=useState('1H');
 const [setup,setSetup]=useState(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [hud,setHud]=useState(true);
 const pairs=useMemo(()=>market==='forex'?FOREX:CRYPTO,[market]);

 const syncSaved=()=>{const raw=localStorage.getItem('kitagent:last-market-setup');if(!raw)return false;try{const saved=JSON.parse(raw);if(!saved?.market)return false;setMarket(saved.market);const savedPair=normalizeSavedPair(saved.market,saved.symbol);if(savedPair)setPair(savedPair);if(saved.timeframe)setTimeframe(saved.timeframe);if(saved.setup)setSetup(saved);return true}catch{return false}};
 useEffect(()=>{syncSaved();const onSetup=e=>setSetup(e.detail);window.addEventListener('kitagent-market-setup',onSetup);return()=>window.removeEventListener('kitagent-market-setup',onSetup)},[]);
 useEffect(()=>{if(!pairs.includes(pair))setPair(pairs[0])},[market,pairs,pair]);

 const analyze=async()=>{setLoading(true);setError('');try{const symbol=market==='forex'?pair:pair.replace('/','');const r=await fetch(`/api/market?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw new Error(body.error||`Market engine returned ${r.status}`);setSetup(body);localStorage.setItem('kitagent:last-market-setup',JSON.stringify(body));window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:body}));}catch(e){setError(e.message||'Unable to generate a live setup.')}finally{setLoading(false)}};
 const loadLatest=()=>{setError('');if(!syncSaved())setError('No Market Analysis setup is saved yet. Run analysis first.')};
 const symbolForChart=setup?tvSymbol(setup.market,normalizeSavedPair(setup.market,setup.symbol)||setup.symbol):tvSymbol(market,pair);

 return <div className="chart-terminal page-wrap">
   <div className="terminal-topbar">
    <div className="terminal-brand"><span className="terminal-kicker">KITAGENT / WORKSPACE</span><div className="terminal-title"><BarChart3/><strong>Chart Terminal</strong><span className="terminal-sep">/</span><b>{displayPair(market,pair)}</b><span className="terminal-dot">·</span><b>{timeframe}</b></div></div>
    <div className="terminal-status"><span className="status-live"><i/>MARKET LIVE</span><button onClick={loadLatest} className="load-setup"><Target size={13}/> Load latest setup</button></div>
   </div>

   <section className="terminal-shell">
    <div className="terminal-toolbar">
      <div className="terminal-tabs">{TABS.map(([id,label])=><button key={id} className={market===id?'active':''} onClick={()=>{setMarket(id);setSetup(null);setError('')}}>{label}</button>)}</div>
      <div className="terminal-control"><span>MARKET</span><label><select value={pair} onChange={e=>{setPair(e.target.value);setSetup(null)}}>{pairs.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></label></div>
      <div className="terminal-control tf-control"><span>TIMEFRAME</span><label><select value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{TIMEFRAMES.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></label></div>
      <button className="generate-button" onClick={analyze} disabled={loading}>{loading?<RefreshCw className="spin"/>:<Target/>}{loading?'Building thesis…':'Generate thesis'}</button>
    </div>

    <div className="terminal-chart-wrap">
      <TradingViewChart market={market} pair={pair} timeframe={timeframe}/>
      <div className="chart-attribution"><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a></div>
      <div className="chart-corner"><span>LIVE</span><b>{displayPair(market,pair)}</b><em>{timeframe}</em></div>
      {hud&&setup&&<SetupHud setup={setup} onClose={()=>setHud(false)}/>} 
      {!setup&&!loading&&<div className="chart-onboarding"><div className="onboard-icon"><CrosshairIcon/></div><span className="terminal-kicker">VISUAL CONFIRMATION</span><h2>Build a thesis. Then verify it.</h2><p>Load your latest Market Analysis setup or generate a new one. The chart stays the workspace; KitAgent stays read-only here.</p><button onClick={loadLatest}><Target size={14}/> Load latest setup</button></div>}
      {error&&<div className="terminal-error"><div><b>ENGINE</b><span>{error}</span></div><button onClick={analyze}>{loading?'Working…':'Retry'}</button></div>}
      <div className="chart-actions"><button title="Toggle setup HUD" onClick={()=>setHud(v=>!v)}><Command size={14}/>{hud?'Hide thesis':'Show thesis'}</button><button title="Open TradingView" onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbolForChart)}`,'_blank','noopener,noreferrer')}><ExternalLink size={14}/>TradingView</button><button title="Full screen chart" onClick={()=>document.querySelector('.terminal-chart-wrap')?.requestFullscreen?.()}><Maximize2 size={14}/></button></div>
    </div>

    <div className="terminal-strip">
      <div className="strip-context"><span className="terminal-kicker">ACTIVE THESIS</span><strong>{setup?displayPair(setup.market,setup.symbol):'No setup loaded'}</strong><small>{setup?`${setup.timeframe} · generated ${new Date(setup.generatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Market Analysis is the source of truth for setup generation.'}</small></div>
      {setup?<><Metric label="BIAS" value={setup.setup.bias} tone={setup.setup.bias.toLowerCase()}/><Metric label="ENTRY" value={setup.setup.entry}/><Metric label="STOP" value={setup.setup.stopLoss} tone="danger"/><Metric label="TP1" value={setup.setup.takeProfit1}/><Metric label="TP2" value={setup.setup.takeProfit2}/><Metric label="CONF" value={`${setup.setup.confidence}%`}/><Metric label="R/R" value={setup.setup.riskReward}/></>:<div className="strip-empty">Use the chart for price action, drawings and indicators. Use Market Analysis to generate the trade thesis.</div>}
    </div>
   </section>
 </div>;
}

function Metric({label,value,tone}){return <div className={`terminal-metric ${tone||''}`}><span>{label}</span><b>{value??'—'}</b></div>}
function SetupHud({setup,onClose}){const bias=setup.setup.bias;return <div className="setup-hud"><div className="hud-head"><div><span className="terminal-kicker">KITAGENT THESIS</span><strong>{displayPair(setup.market,setup.symbol)}</strong><small>{setup.timeframe} · {setup.aligned}/{setup.totalTimeframes} confluence</small></div><div className={`hud-bias ${bias.toLowerCase()}`}>{bias==='LONG'?<TrendingUp/>:bias==='SHORT'?<TrendingDown/>:<Target/>}<b>{bias}</b><span>{setup.setup.confidence}%</span></div><button onClick={onClose}><X size={14}/></button></div><div className="hud-levels"><Metric label="ENTRY" value={setup.setup.entry}/><Metric label="STOP" value={setup.setup.stopLoss} tone="danger"/><Metric label="TP1" value={setup.setup.takeProfit1}/><Metric label="TP2" value={setup.setup.takeProfit2}/></div><div className="hud-foot"><ShieldCheck size={13}/><span>Read-only visual confirmation. No order is placed from this workspace.</span></div></div>}
function CrosshairIcon(){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="5"/></svg>}
function TradingViewChart({market,pair,timeframe}){const key=`${market}-${pair}-${timeframe}`;useEffect(()=>{const node=document.getElementById('kitagent-tv-chart');if(!node)return;node.innerHTML='';const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.cssText='height:100%;width:100%';node.appendChild(widget);const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.type='text/javascript';script.async=true;script.innerHTML=JSON.stringify({autosize:true,symbol:tvSymbol(market,pair),interval:TV_INTERVAL[timeframe]||'60',timezone:'Etc/UTC',theme:'dark',style:'1',withdateranges:true,hide_side_toolbar:false,allow_symbol_change:true,save_image:false,calendar:false,hide_volume:false,locale:'en',support_host:'https://www.tradingview.com',show_popup_button:false});node.appendChild(script);return()=>{node.innerHTML=''}},[key]);return <div id="kitagent-tv-chart" className="tradingview-widget-container" key={key}/>}
