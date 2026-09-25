import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, X, Target, ShieldCheck } from 'lucide-react';


const STRATEGY_LIBRARY=[
 {key:'TOP_DOWN',name:'Top-Down',short:'HTF structure first',description:'Higher-timeframe direction → intermediate structure → execution confirmation.',rules:['HTF establishes direction','Middle TF confirms or conflicts','Execution TF must provide a live trade condition']},
 {key:'PULLBACK',name:'Pullback',short:'Impulse → retracement → continuation',description:'Trades continuation after a confirmed directional impulse and a fresh retracement into a qualified POI.',rules:['Directional impulse','Fresh FVG / order block','Zone remains executable','Minimum 2R']},
 {key:'BREAKOUT',name:'Breakout & Retest',short:'Break → retest → continuation',description:'Requires a meaningful range boundary, decisive close beyond it, then a confirmed retest and acceptance before entry; wick-only breaks do not qualify.',rules:['Meaningful range boundary','Decisive close beyond boundary','Confirmed retest','Continuation acceptance']},
 {key:'SMC',name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a higher-timeframe directional bias, then requires liquidity to be swept, a CHoCH, BOS, displacement and a fresh POI.',rules:['Higher-timeframe bias','Liquidity sweep','CHoCH → BOS','Displacement + fresh POI']},
 {key:'MSNR',name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Daily/4H storyline with body-based A/V levels, fresh support/resistance, SBR/RBS flips and kissing-candle bases, then requires lower-timeframe confirmation.',rules:['Weekly / Daily storyline','Fresh A/V or decision level','SBR / RBS flip or base','Tap + lower-TF BOS / engulfing / rejection']},
 {key:'PRICE_ACTION',name:'Price Action',short:'Structure + candle confirmation',description:'Trades a meaningful structural swing only after price reaches it and prints a qualifying rejection or engulfing response.',rules:['Structural level','Rejection or engulfing','Structural invalidation','Minimum 2R']},
 {key:'LIQUIDITY_REVERSAL',name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Waits for a genuine liquidity sweep, reclaim, reversal CHoCH, displacement and retest before considering a reversal.',rules:['Genuine sweep','Reclaim','Reversal CHoCH','Displacement + retest']},
 {key:'CRT',name:'CRT',short:'Range → sweep → reclaim',description:'Candle Range Theory: uses a completed parent-candle range, waits for one side to be swept and reclaimed back inside the range, then targets the opposite range boundary.',rules:['Completed reference range','One-side liquidity sweep','Midpoint reclaim','Range-based invalidation','Minimum 2R']}
];

export function StrategySelector({value,onChange}){
 const item=STRATEGY_LIBRARY.find(x=>x.key===value)||STRATEGY_LIBRARY[0];
 return <label className="strategy-selector live-field" aria-label="Strategy">
   <span>STRATEGY</span>
   <div className="strategy-select-wrap">
     <select value={value} onChange={e=>onChange(e.target.value)} aria-label="Select setup strategy">
       {STRATEGY_LIBRARY.map(x=><option key={x.key} value={x.key}>{x.name}</option>)}
     </select>
     <ChevronDown size={15}/>
   </div>
   <small className="strategy-selector-note">Choose the ruleset used for this analysis.</small>
 </label>
}

export function StrategyExplanation({setup,strategy}){
 const [open,setOpen]=useState(false);
 const item=STRATEGY_LIBRARY.find(x=>x.key===strategy)||STRATEGY_LIBRARY[0];
 const evidence=setup?.strategyEvidence?.length?setup.strategyEvidence:item.rules;
 const detail={
  TOP_DOWN:{entry:'HTF direction → intermediate confirmation → current execution condition.',invalidation:'Reject when higher-timeframe direction is absent or middle structure hard-conflicts.',target:'Qualified structural/liquidity targets under the existing risk model.'},
  PULLBACK:{entry:'Directional impulse → fresh retracement POI → continuation response.',invalidation:'Zone invalidation or structural break against the HTF direction.',target:'Next qualified external liquidity beyond the entry.'},
  BREAKOUT:{entry:'Decisive close through a meaningful boundary → confirmed retest of that same broken level → continuation entry.',invalidation:'The retest structure breaks back through the broken boundary.',target:'Next qualified structural/liquidity level after the retest.'},
  SMC:{entry:'Liquidity sweep → CHoCH → BOS → displacement → fresh POI.',invalidation:'The post-sweep reversal structure fails or the protected POI is lost.',target:'External liquidity created by the prior structure.'},
  MSNR:{entry:'Weekly/Daily storyline → fresh Daily/4H MSNR level → tap → lower-timeframe confirmation.',invalidation:'The MSNR level breaks without the expected reaction/confirmation.',target:'Next structural/liquidity level from the live market.'},
  PRICE_ACTION:{entry:'Meaningful swing level → rejection or engulfing confirmation at that level → market execution.',invalidation:'The structural level fails and invalidates the candle thesis.',target:'Next qualified structural / liquidity level with at least 2R.'},
  LIQUIDITY_REVERSAL:{entry:'Genuine liquidity sweep → reclaim → reversal CHoCH → displacement → retest → execution.',invalidation:'Price fails to reclaim the swept level, loses reversal structure or invalidates the protected sweep.',target:'Opposing external liquidity.'},
  CRT:{entry:'Completed parent candle range → one-side sweep → close/reclaim back inside the range → execution.',invalidation:'The sweep extreme is lost or price fails to close/reclaim back inside the range.',target:'Opposite boundary of the reference range, subject to the live risk model.'}
 }[item.key]||{};
 return <section className={`strategy-explanation ${open?'is-open':''}`} aria-label={item.name+' strategy explanation'}>
  <button type="button" className="strategy-explanation-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
   <span><span className="extras-kicker"><CircleHelp size={11}/> STRATEGY MODEL</span><strong>{item.name}</strong><small>{open?item.description:item.short}</small></span>
   <ChevronDown className={open?'open':''} size={16}/>
  </button>
  <div className="strategy-explanation-body">
   <div className="strategy-explanation-grid">
    <div><b>Entry model</b><span>{detail.entry}</span></div>
    <div><b>Live evidence</b><span>{evidence.length?evidence.map((x,i)=><em key={i}>{x}</em>):'No qualifying evidence yet.'}</span></div>
    <div><b>Invalidation</b><span>{detail.invalidation}</span></div>
    <div><b>Target model</b><span>{detail.target}</span></div>
    <div><b>Current engine state</b><span>{setup?.strategyReason||'Analyze the market to run this strategy against live candles.'}</span></div>
    <div><b>Decision</b><span>{setup?.strategyValid?'Strategy conditions are satisfied by the current market data.':'No trade is issued until the strategy conditions are satisfied.'}</span></div>
   </div>
  </div>
 </section>
}

const WATCH_KEY = 'kitsetups-watchlist-v2';

function readWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(value) ? value.filter(x => x && x.symbol).slice(0, 12) : [];
  } catch { return []; }
}

function saveWatchlist(items) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(items.slice(0, 12))); } catch {}
}

export function MarketWatchlist({ symbol, market='perpetual', onSelect }) {
 const [items,setItems]=useState(readWatchlist);
 const [open,setOpen]=useState(false);
 const saved=items.some(x=>x.symbol===symbol&&x.market===market);
 useEffect(()=>{saveWatchlist(items)},[items]);
 const toggle=()=>setItems(current=>{const exists=current.some(x=>x.symbol===symbol&&x.market===market);return exists?current.filter(x=>!(x.symbol===symbol&&x.market===market)):[{symbol,market},...current].slice(0,12)});
 return <section className={`market-watchlist ${open?'is-open':''}`} aria-label="Market watchlist">
  <button type="button" className="watchlist-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
   <span className="watchlist-toggle-main"><span><b>Watchlist</b><small>{items.length?items.length+' saved market'+(items.length===1?'':'s')+(symbol?' · '+symbol:''):'Save markets for quick access'}</small></span></span>
   <span className="watchlist-toggle-right"><em>{items.length}</em><ChevronDown className={open?'open':''} size={16}/></span>
  </button>
  <div className="watchlist-panel">
   <div className="watchlist-head">
    <div className="watchlist-title"><span className="extras-kicker">SAVED MARKETS</span><strong>Quick access</strong><small>{items.length?'Tap a pair to open its live analysis.':'Save pairs here for one-tap access.'}</small></div>
    <button type="button" className={saved?'watch-current saved':'watch-current'} onClick={toggle}>{saved?<Check size={12}/>:<Plus size={12}/>} {saved?'Saved':`Save ${symbol||'pair'}`}</button>
   </div>
   {symbol&&<div className="watchlist-current-row"><span className="watch-current-label">CURRENT</span><b>{symbol}</b><em>{market==='forex'?'FOREX':market==='commodities'?'COMMODITIES':market==='indices'?'INDICES':'CRYPTO'}</em></div>}
   <div className="watchlist-items">
    {items.length?items.map(item=><button type="button" key={item.market+':'+item.symbol} className={item.symbol===symbol&&item.market===market?'watch-chip active':'watch-chip'} onClick={()=>onSelect?.(item.symbol,item.market)} title={`Open ${item.symbol}`}>
      <span className="watch-chip-main"><span className="watch-dot"/><strong>{item.symbol}</strong></span>
      <span className="watch-chip-market">{item.market==='forex'?'FX':item.market==='commodities'?'CMDTY':item.market==='indices'?'INDEX':'PERP'}</span>
      {item.symbol===symbol&&item.market===market&&<span className="watch-active-mark">ACTIVE</span>}
    </button>):<div className="watch-empty"><Bookmark size={13}/><span><b>No saved pairs</b><small>Add the current market above.</small></span></div>}
   </div>
  </div>
 </section>
}
