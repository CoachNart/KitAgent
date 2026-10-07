import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, Plus, X, Trash2 } from 'lucide-react';


export const STRATEGY_LIBRARY=[
 {key:'TOP_DOWN',name:'Top-Down',short:'HTF alignment → BOS → retest',description:'Continuation model: the higher-timeframe structure must agree, the execution timeframe must break structure, and price must retest and hold the broken level before entry.',steps:[['1 · HTF alignment','All directional context layers must agree on the same direction. Conflicting higher-timeframe structure is rejected.'],['2 · Execution BOS','The execution timeframe must close beyond a confirmed swing in the aligned direction.'],['3 · Retest & hold','Price must return to the broken structure level and close back on the trade side.'],['4 · Protection','The stop sits beyond the retest candle extreme with a volatility buffer.'],['5 · Target','A later structural continuation target must sit beyond entry and provide at least 2R.']],rules:['Aligned higher-timeframe direction','Closed execution BOS','Retest + hold','Structural invalidation','Continuation target + 2R']},
 {key:'PULLBACK',name:'Pullback',short:'Impulse → 38.2–61.8% retrace → break',description:'Trend-continuation model: a confirmed directional impulse must retrace into the 38.2–61.8% zone, preserve its origin, then break the pullback structure.',steps:[['1 · HTF alignment','Directional context must agree before a continuation setup is considered.'],['2 · Confirmed impulse','The execution series must contain a meaningful directional swing from a protected opposite swing.'],['3 · Value retracement','Price must retrace into the 38.2–61.8% measured zone.'],['4 · Continuation break','A closed candle must break the pullback range in the impulse direction without violating the impulse origin.'],['5 · Target & risk','The stop protects the pullback/impulse origin and the impulse extreme or later structure must provide at least 2R.']],rules:['Aligned direction','Confirmed impulse','38.2–61.8% retracement','Closed continuation break','Structural target + 2R']},
 {key:'BREAKOUT',name:'Breakout & Retest',short:'Multi-touch level → break → retest',description:'Continuation model: a repeatedly tested level must break decisively on a closed candle, hold on retest, and then confirm continuation.',steps:[['1 · Defined level','A multi-touch swing cluster establishes a meaningful support/resistance boundary.'],['2 · Decisive breakout','A closed candle must break the level with strong body/range characteristics; a wick alone does not qualify.'],['3 · Retest hold','Price must return to the broken level within the allowed window and hold the new role.'],['4 · Continuation','A later closed candle must break the retest candle in the breakout direction.'],['5 · Protection & target','The stop protects the retest/level and the next structural or range-projection objective must provide at least 2R.']],rules:['Multi-touch level','Decisive closed break','Retest role reversal','Closed continuation','Structural/range target + 2R']},
 {key:'SMC',name:'SMC',short:'Liquidity sweep → MSS → displacement → FVG',description:'Liquidity-reversal model: higher-timeframe bias selects the side, a meaningful liquidity sweep is reclaimed, MSS is confirmed by displacement, and the resulting fresh FVG supplies the entry.',steps:[['1 · HTF bias','The highest context layer must be directionally bullish or bearish; the SMC thesis follows it.'],['2 · Liquidity sweep','Price must sweep the opposing liquidity pool and reclaim it, within a recent window.'],['3 · MSS + displacement','A post-sweep structure break must occur promptly and the break candle must show meaningful displacement.'],['4 · Fresh FVG & location','The displacement must create a fresh, unmitigated FVG in the trade direction and place it in discount for longs or premium for shorts.'],['5 · FVG entry & target','Entry is the FVG midpoint, the stop is beyond the sweep extreme with buffer, and the next opposing liquidity objective must provide at least 2R.']],rules:['Directional HTF bias','Reclaimed liquidity sweep','Post-sweep MSS','Meaningful displacement + fresh FVG','Premium/discount + liquidity target + 2R']},
 {key:'MSNR',name:'MSNR',short:'Key level → exact candle confirmation',description:'MSNR trades defined market-structure key levels only. The level must be fresh, price must produce the exact confirmation sequence, and the next opposing MSNR level must support the trade.',steps:[['1 · Key level','Levels are derived from A, V, Bullish Gap, Bearish Gap, RBS and SBR formations using closed candles.'],['2 · Freshness','A level must remain fresh until touched; a body break flips its role and refreshes the flipped level.'],['3 · Confirmation chain','The required candle sequence must confirm the reaction with the full body on the trade side and a valid continuation close.'],['4 · Live entry & invalidation','Entry is the live market price only while it remains close to the closed confirmation; the stop sits beyond the level/confirmation extreme with buffer.'],['5 · Opposing key level','The next valid opposing MSNR level is the objective; stale, extended or sub-2R setups are rejected.']],rules:['A/V/GAP/RBS/SBR key level','Fresh level','Exact confirmation sequence','Live non-extended entry','Opposing MSNR level + 2R']},
 {key:'CRT',name:'CRT',short:'Candle range → sweep → reclaim → MSS retest',description:'Candle Range Theory model: a completed higher-timeframe reference candle defines the range, one side is swept and reclaimed, lower-timeframe structure shifts with displacement, and the retest supplies the entry.',steps:[['1 · Reference range','A completed higher-timeframe parent candle defines the CRT high, low and midpoint.'],['2 · One-sided sweep & reclaim','The following higher-timeframe candle must take one boundary and close back inside the reference range.'],['3 · Execution sweep','The lower timeframe must confirm a corresponding sweep/reclaim of the CRT boundary.'],['4 · MSS + retest','A meaningful lower-timeframe MSS/displacement must break structure, followed by a retest that holds the broken level.'],['5 · Invalidation & target','The stop sits beyond the sweep extreme with volatility buffer; the opposite CRT boundary is preferred, otherwise a valid external structural target must provide at least 2R.']],rules:['Completed parent range','One-sided sweep + close back inside','Execution sweep/reclaim','MSS/displacement + retest','Sweep invalidation + opposing target + 2R']}
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
    <div className="watchlist-title"><span className="extras-kicker">SAVED</span><strong>Quick access</strong><small>{items.length?'Tap a pair to analyze.':'Save pairs for quick access.'}</small></div>
    <div className="watchlist-actions">
      {items.length>0&&<button type="button" className="watch-clear" onClick={()=>setItems([])} aria-label="Clear all saved pairs"><Trash2 size={11}/> Clear all</button>}
      <button type="button" className={saved?'watch-current saved':'watch-current'} onClick={toggle}>{saved?<Check size={12}/>:<Plus size={12}/>} {saved?'Saved':`Save ${symbol||'pair'}`}</button>
    </div>
   </div>
   {symbol&&<div className="watchlist-current-row"><span className="watch-current-label">CURRENT</span><b>{symbol}</b><em>PERPETUAL</em></div>}
   <div className="watchlist-items">
    {items.length?items.map(item=><button type="button" key={item.symbol} className={item.symbol===symbol?'watch-chip active':'watch-chip'} onClick={()=>onSelect?.(item.symbol)} title={`Open ${item.symbol}`}>
      <span className="watch-chip-main"><span className="watch-dot"/><strong>{item.symbol}</strong></span>
      <span className="watch-chip-market">PERP</span>
      {item.symbol===symbol&&<span className="watch-active-mark">ACTIVE</span>}
      <span role="button" tabIndex={0} className="watch-chip-remove" onClick={e=>{e.stopPropagation();setItems(current=>current.filter(x=>x.symbol!==item.symbol))}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setItems(current=>current.filter(x=>x.symbol!==item.symbol))}}} aria-label={`Remove ${item.symbol}`}><X/></span>
    </button>):<div className="watch-empty"><Bookmark size={13}/><span><b>No saved perpetuals</b><small>Add the current contract above.</small></span></div>}
   </div>
  </div>
 </section>
}
