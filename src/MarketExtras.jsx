import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, X, Target, ShieldCheck } from 'lucide-react';


const STRATEGY_LIBRARY=[
 {key:'TOP_DOWN',name:'Top-Down',short:'Higher timeframe → setup → entry',description:'KitSetups starts with the bigger market direction, checks the middle structure, then looks for a tradeable condition on the selected execution timeframe.',steps:[['1 · Direction','The higher timeframe sets the market bias. KitSetups will not issue a continuation trade against that direction.'],['2 · Structure','The next timeframe must support the same direction and show meaningful structure, such as a confirmed break or sustained swing sequence.'],['3 · Setup','The selected execution timeframe must reach a qualified structural pullback location and confirm continuation before entry.'],['4 · Protection','The stop is placed beyond a validated structural swing, with a volatility buffer—not simply at the latest wick.'],['5 · Target','The target is the next meaningful opposing swing or liquidity area and must provide at least 2R.']],rules:['Higher timeframe direction','Middle timeframe agreement','Execution condition','Structural stop','Meaningful target + 2R']},
 {key:'PULLBACK',name:'CRT Pullback',short:'Impulse → retracement → continuation',description:'KitSetups looks for a strong directional move, waits for price to retrace into a qualified area, then requires the continuation structure to remain intact.',steps:[['1 · Direction','The higher timeframes establish the direction first.'],['2 · Impulse','A meaningful directional move must exist; weak or choppy movement is not enough.'],['3 · Retracement','Price must pull back into a qualified structural area rather than entering after an extended move.'],['4 · Protection','The stop sits beyond the structural swing that would prove the pullback thesis wrong.'],['5 · Target','The engine targets meaningful opposing structure and requires at least 2R.']],rules:['Directional impulse','Fresh retracement area','Continuation structure','Structural invalidation','Minimum 2R']},
 {key:'BREAKOUT',name:'Breakout & Retest',short:'Break → retest → continuation',description:'KitSetups does not chase the first breakout candle. It waits for a meaningful level to break with a decisive close, then checks whether the old boundary holds as support or resistance.',steps:[['1 · Range','A meaningful recent range boundary must be identifiable.'],['2 · Break','Price must close decisively beyond that boundary; a wick through it is not enough.'],['3 · Retest','Price must return to the broken level and show acceptance in the breakout direction.'],['4 · Protection','The stop is placed beyond the validated retest structure or structural swing.'],['5 · Target','The engine selects the next meaningful structural/liquidity target with at least 2R.']],rules:['Meaningful range','Decisive close','Confirmed retest','Continuation acceptance','Structural target + 2R']},
 {key:'SMC',name:'SMC',short:'Liquidity → displacement → structure break',description:'KitSetups uses liquidity and market structure together. A sweep alone is not enough; the move must show displacement and structural evidence before an entry is considered.',steps:[['1 · Direction','Higher-timeframe structure provides the directional framework.'],['2 · Liquidity','Price must interact with a meaningful prior high/low where liquidity can be taken.'],['3 · Confirmation','A structural shift such as CHoCH/BOS and a strong displacement move must support the idea.'],['4 · Entry area','The engine looks for a fresh order block or fair-value gap that price can react from.'],['5 · Protection & target','The stop goes beyond the entry structure and the target is meaningful external liquidity, with at least 2R.']],rules:['Higher-timeframe bias','Liquidity interaction','CHoCH/BOS','Displacement','Fresh POI + structural target']},
 {key:'MSNR',name:'MSNR',short:'Higher-timeframe level → reaction',description:'KitSetups follows the broader support/resistance storyline, identifies a fresh decision level, then waits for price to react before issuing the trade.',steps:[['1 · Storyline','Weekly and Daily structure establish the broader direction.'],['2 · Level','A fresh 4H/Daily decision area must be relevant to the current price.'],['3 · Reaction','Price must reach the area and provide lower-timeframe confirmation rather than simply touching it.'],['4 · Protection','The stop sits beyond the structural level that invalidates the reaction.'],['5 · Target','The engine looks toward the next meaningful structural/liquidity level and requires at least 2R.']],rules:['Weekly/Daily storyline','Fresh decision level','Confirmed reaction','Structural invalidation','Meaningful target + 2R']},
 {key:'PRICE_ACTION',name:'Price Action',short:'Structure + candle confirmation',description:'KitSetups waits for price to reach an important structural level and then uses the candle reaction as the trigger.',steps:[['1 · Structure','A meaningful swing level must be identified first.'],['2 · Arrival','Price must actually reach the level; the engine does not trade a candle pattern in the middle of nowhere.'],['3 · Candle signal','A qualifying rejection or engulfing response must confirm the direction.'],['4 · Protection','The stop sits beyond the structural level that would invalidate the candle idea.'],['5 · Target','The next meaningful structural/liquidity level must offer at least 2R.']],rules:['Meaningful structural level','Price reaches level','Rejection/engulfing','Structural invalidation','Minimum 2R']},
 {key:'LIQUIDITY_REVERSAL',name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'KitSetups looks for price to take a prior high or low, reclaim the level, and then prove that the reversal has structure behind it before entering.',steps:[['1 · Liquidity pool','A meaningful prior high or low must be available to sweep.'],['2 · Sweep','Price moves through that level and takes liquidity.'],['3 · Reclaim','Price closes back through the swept level instead of accepting beyond it.'],['4 · Confirmation','The reversal must show structural change and displacement before entry.'],['5 · Protection & target','The stop goes beyond the sweep extreme and the target is opposing external liquidity, with at least 2R.']],rules:['Meaningful liquidity','Sweep','Closed reclaim','Reversal structure','Sweep invalidation + 2R target']},
 {key:'CRT',name:'CRT',short:'Range → sweep → reclaim → opposite side',description:'Candle Range Theory uses a completed reference candle as the range. KitSetups waits for one side of that range to be swept and reclaimed before targeting the opposite side.',steps:[['1 · Reference range','A completed parent candle with a meaningful range becomes the reference.'],['2 · Sweep','Price must take one side of that range.'],['3 · Reclaim','Price must close back inside the range after the sweep.'],['4 · Protection','The sweep extreme becomes the key invalidation point, with structural validation applied afterward.'],['5 · Target','The opposite side of the reference range is the initial target, subject to the engine’s structural and 2R checks.']],rules:['Completed parent range','One-side sweep','Close back inside','Sweep invalidation','Opposite range boundary + 2R']}
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
 const item=STRATEGY_LIBRARY.find(x=>x.key===strategy)||STRATEGY_LIBRARY[0];
 const evidence=setup?.strategyEvidence?.length?setup.strategyEvidence:item.rules;
 const [open,setOpen]=useState(true);
 const humanEvidence=(value)=>{
  const s=String(value||'');
  return s
   .replace(/HTF (LONG|SHORT)/g,'Higher-timeframe direction: $1')
   .replace(/Structure (LONG|SHORT)/g,'Middle structure: $1')
   .replace(/Weekly (LONG|SHORT)/g,'Weekly direction: $1')
   .replace(/Daily (LONG|SHORT)/g,'Daily direction: $1')
   .replace('Structural invalidation stop.','Stop is protected by a validated structural swing.')
   .replace('POI invalidation stop.','Stop is protected beyond the entry area.')
   .replace('Sweep invalidation stop.','Stop is protected beyond the sweep extreme.')
   .replace('Confirmed structural impulse.','A recent directional impulse is confirmed.')
   .replace('Measured retracement.','Price has retraced into the planned area.')
   .replace('Rejection/engulfing confirmed.','A qualifying rejection or engulfing candle is confirmed.')
   .replace('Reclaim confirmed.','Price reclaimed the swept level.')
   .replace('Range liquidity swept/reclaimed.','One side of the reference range was swept and reclaimed.')
   .replace('Structural liquidity.','Meaningful structural liquidity is present.');
 };
 const state=setup?.strategyValid
   ? 'The required conditions are currently satisfied, so the engine can issue a trade.'
   : setup?.strategyReason||'The engine is still waiting for every required condition to line up.';
 return <section className={`strategy-explanation ${open?'is-open':''}`} aria-label={item.name+' strategy explanation'}>
  <button type="button" className="strategy-explanation-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
   <span><span className="extras-kicker"><CircleHelp size={11}/> HOW KITSETUPS BUILDS IT</span><strong>{item.name}</strong><small>{open?'Read the process from market direction to entry, stop and target.':item.short}</small></span>
   <ChevronDown className={open?'open':''} size={16}/>
  </button>
  <div className="strategy-explanation-body">
   <div className="strategy-explanation-intro">
    <strong>How this strategy works</strong>
    <p>{item.description}</p>
   </div>
   <div className="strategy-step-grid">
    {item.steps.map(([title,body])=><div key={title}><b>{title}</b><span>{body}</span></div>)}
   </div>
   <div className="strategy-terms"><b>Simple terms</b><span><strong>BOS</strong> = a meaningful break of prior structure · <strong>CHoCH</strong> = a meaningful change in structure · <strong>Liquidity</strong> = orders/stops clustered around obvious highs or lows · <strong>POI</strong> = the price area the engine uses for entry.</span></div>
   <div className="strategy-current">
    <div><b>What the engine sees now</b><span>{humanEvidence(state)}</span></div>
    <div><b>Live evidence</b><span>{evidence.length?evidence.map((x,i)=><em key={i}>{humanEvidence(x)}</em>):'No qualifying evidence yet.'}</span></div>
    <div><b>Trade rule</b><span>KitSetups issues no setup until the strategy conditions, structural validation and risk limits all pass. <strong>2R</strong> means the planned target is at least twice as far from entry as the stop.</span></div>
   </div>
  </div>
 </section>
}

const WATCH_KEY = 'kitsetups-watchlist-v2';

function readWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(value) ? value.filter(x => x && x.symbol).map(x => ({symbol:x.symbol})).slice(0, 12) : [];
  } catch { return []; }
}

function saveWatchlist(items) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(items.map(x => ({symbol:x.symbol})).slice(0, 12))); } catch {}
}

export function MarketWatchlist({ symbol, onSelect }) {
 const [items,setItems]=useState(readWatchlist);
 const [open,setOpen]=useState(false);
 const saved=items.some(x=>x.symbol===symbol);
 useEffect(()=>{saveWatchlist(items)},[items]);
 const toggle=()=>setItems(current=>{const exists=current.some(x=>x.symbol===symbol);return exists?current.filter(x=>x.symbol!==symbol):[{symbol},...current].slice(0,12)});
 return <section className={`market-watchlist ${open?'is-open':''}`} aria-label="Crypto perpetual watchlist">
  <button type="button" className="watchlist-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>
   <span className="watchlist-toggle-main"><span><b>Watchlist</b><small>{items.length?items.length+' saved perpetual'+(items.length===1?'':'s')+(symbol?' · '+symbol:''):'Save perpetuals for quick access'}</small></span></span>
   <span className="watchlist-toggle-right"><em>{items.length}</em><ChevronDown className={open?'open':''} size={16}/></span>
  </button>
  <div className="watchlist-panel">
   <div className="watchlist-head">
    <div className="watchlist-title"><span className="extras-kicker">SAVED PERPETUALS</span><strong>Quick access</strong><small>{items.length?'Tap a contract to open its live analysis.':'Save contracts here for one-tap access.'}</small></div>
    <button type="button" className={saved?'watch-current saved':'watch-current'} onClick={toggle}>{saved?<Check size={12}/>:<Plus size={12}/>} {saved?'Saved':`Save ${symbol||'contract'}`}</button>
   </div>
   {symbol&&<div className="watchlist-current-row"><span className="watch-current-label">CURRENT</span><b>{symbol}</b><em>PERPETUAL</em></div>}
   <div className="watchlist-items">
    {items.length?items.map(item=><button type="button" key={item.symbol} className={item.symbol===symbol?'watch-chip active':'watch-chip'} onClick={()=>onSelect?.(item.symbol)} title={`Open ${item.symbol}`}>
      <span className="watch-chip-main"><span className="watch-dot"/><strong>{item.symbol}</strong></span>
      <span className="watch-chip-market">PERP</span>
      {item.symbol===symbol&&<span className="watch-active-mark">ACTIVE</span>}
    </button>):<div className="watch-empty"><Bookmark size={13}/><span><b>No saved perpetuals</b><small>Add the current contract above.</small></span></div>}
   </div>
  </div>
 </section>
}
