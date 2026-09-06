import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,Crosshair,ExternalLink,RefreshCw,ShieldCheck,Target,TrendingDown,TrendingUp} from 'lucide-react';
import {FOREX,CRYPTO,TIMEFRAMES} from './LiveMarketPage.jsx';

const TABS=[['forex','Forex'],['crypto','Crypto'],['perpetual','Perpetual']];
const TV_INTERVAL={
  '15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'
};
function tvSymbol(market,pair){
  if(market==='forex')return `OANDA:${pair}`;
  const base=pair.replace('/','');
  return market==='perpetual'?`BINANCE:${base}.P`:`BINANCE:${base}`;
}
function displayPair(market,pair){return market==='forex'?pair:pair.replace('USDT','/USDT')}

export default function ChartTerminal(){
 const [market,setMarket]=useState('forex');
 const [pair,setPair]=useState(FOREX[0]);
 const [timeframe,setTimeframe]=useState('1H');
 const [setup,setSetup]=useState(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const pairs=useMemo(()=>market==='forex'?FOREX:CRYPTO,[market]);
 useEffect(()=>{const raw=localStorage.getItem('kitagent:last-market-setup');if(!raw)return;try{const saved=JSON.parse(raw);if(saved?.market){setMarket(saved.market);if(saved.symbol)setPair(saved.symbol);if(saved.timeframe)setTimeframe(saved.timeframe);if(saved.setup)setSetup(saved)}}catch{}}
 ,[]);
 useEffect(()=>{if(!pairs.includes(pair))setPair(pairs[0])},[market,pairs,pair]);
 const analyze=async()=>{setLoading(true);setError('');try{const r=await fetch(`/api/market?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(market==='forex'?pair:pair.replace('/',''))}&timeframe=${encodeURIComponent(timeframe)}`);const body=await r.json();if(!r.ok||!body.ok)throw new Error(body.error||'Unable to build setup');setSetup(body);localStorage.setItem('kitagent:last-market-setup',JSON.stringify(body));window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:body}));}catch(e){setError(e.message||'Unable to read market data.')}finally{setLoading(false)}};
 return <div className="chart-terminal page-wrap">
   <div className="chart-head"><div><span className="tiny-label">TECHNICAL WORKSPACE</span><h2>Chart terminal</h2><p>Use TradingView to validate KitAgent setups with live price action, indicators and drawing tools.</p></div><span className="chart-live"><i/> LIVE CHART</span></div>
   <section className="chart-shell">
    <div className="chart-toolbar">
      <div className="chart-tabs">{TABS.map(([id,label])=><button key={id} className={market===id?'active':''} onClick={()=>{setMarket(id);setSetup(null)}}>{label}</button>)}</div>
      <label><span>PAIR</span><div><select value={pair} onChange={e=>{setPair(e.target.value);setSetup(null)}}>{pairs.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></div></label>
      <label className="chart-time"><span>TF</span><div><select value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{TIMEFRAMES.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></div></label>
      <button className="chart-analyze" onClick={analyze} disabled={loading}>{loading?<RefreshCw className="spin"/>:<BarChart3/>}{loading?'Analyzing…':'Analyze setup'}</button>
    </div>
    <div className="chart-stage"><TradingViewChart market={market} pair={pair} timeframe={timeframe}/><div className="chart-badge"><Crosshair size={13}/> Drag, zoom, draw and add indicators</div></div>
    <div className="chart-bottom">
      <div className="setup-panel">
        <div className="setup-panel-head"><div><span className="tiny-label">KITAGENT SETUP</span><h3>{setup?displayPair(setup.market,setup.symbol):'No setup loaded'}</h3></div>{setup&&<span className={`setup-bias ${setup.setup.bias.toLowerCase()}`}>{setup.setup.bias==='LONG'?<TrendingUp/>:setup.setup.bias==='SHORT'?<TrendingDown/>:<Target/>}{setup.setup.bias}</span>}</div>
        {error&&<div className="chart-error">{error}<button onClick={analyze}>Retry</button></div>}
        {!setup&&!error&&<div className="setup-empty"><Target/><span>Run analysis to pin the latest entry, stop and targets beside the chart.</span></div>}
        {setup&&<><div className="setup-levels"><Level label="ENTRY" value={setup.setup.entry}/><Level label="STOP LOSS" value={setup.setup.stopLoss} danger/><Level label="TP1" value={setup.setup.takeProfit1}/><Level label="TP2" value={setup.setup.takeProfit2}/></div><div className="setup-meta"><span><b>{setup.setup.confidence}%</b> confidence</span><span><b>{setup.setup.riskReward}</b> R/R</span><span><b>{setup.setup.rsi}</b> RSI</span><span><b>{setup.aligned}/{setup.totalTimeframes}</b> confluence</span></div><div className="setup-note"><ShieldCheck size={14}/><span>Read-only confirmation. KitAgent will not place a trade from the chart.</span></div></>}
      </div>
      <div className="chart-tools"><span className="tiny-label">TECHNICAL TOOLKIT</span><h3>Confirm the thesis</h3><div className="tool-list"><span>Trendlines & rays</span><span>Fibonacci tools</span><span>Support / resistance</span><span>Indicators & oscillators</span></div>{setup&&<button className="open-chart" onClick={()=>window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(setup.market,setup.symbol))}`,'_blank','noopener,noreferrer')}><ExternalLink size={14}/> Open in TradingView</button>}</div>
    </div>
   </section>
 </div>
}

function Level({label,value,danger}){return <div className={`chart-level ${danger?'danger':''}`}><span>{label}</span><b>{value??'—'}</b></div>}

function TradingViewChart({market,pair,timeframe}){
 const key=`${market}-${pair}-${timeframe}`;
 useEffect(()=>{
  const node=document.getElementById('kitagent-tv-chart');if(!node)return;
  node.innerHTML='';
  const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';widget.style.cssText='height:100%;width:100%';node.appendChild(widget);
  const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.type='text/javascript';script.async=true;
  script.innerHTML=JSON.stringify({autosize:true,symbol:tvSymbol(market,pair),interval:TV_INTERVAL[timeframe]||'60',timezone:'Etc/UTC',theme:'dark',style:'1',withdateranges:true,hide_side_toolbar:false,allow_symbol_change:true,save_image:false,calendar:false,hide_volume:false,locale:'en',support_host:'https://www.tradingview.com',show_popup_button:true,popup_width:'1000',popup_height:'650'});
  node.appendChild(script);
  return()=>{node.innerHTML=''};
 },[key]);
 return <div id="kitagent-tv-chart" className="tradingview-widget-container" key={key}/>;
}
