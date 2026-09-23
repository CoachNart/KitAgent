import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, Star, X, Target, ShieldCheck } from 'lucide-react';


const STRATEGY_LIBRARY=[
 {key:'TOP_DOWN',name:'Top-Down',short:'HTF structure first',description:'Higher-timeframe storyline → middle structure → execution condition.',rules:['HTF establishes direction','Middle TF confirms or conflicts','Execution TF must provide a live trade condition']},
 {key:'PULLBACK',name:'Pullback',short:'Impulse → retracement → continuation',description:'Trades a retracement into a fresh FVG or order block after a real impulse.',rules:['Directional impulse','Fresh FVG / order block','Zone remains executable','Minimum 2.25R']},
 {key:'BREAKOUT',name:'Breakout',short:'Close → displacement → continuation',description:'Requires a decisive close through structure with displacement; wick-only breaks do not qualify.',rules:['Recent BOS','Decisive close','Displacement','Fresh enough to execute']},
 {key:'SMC',name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a sweep, displacement, structure break and fresh FVG/order-block point of interest.',rules:['Liquidity sweep','Displacement','BOS','Fresh POI']},
 {key:'MSNR',name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Daily/4H storyline, fresh support/resistance, V/A formations, SBR/RBS and kissing-candle bases, then waits for lower-timeframe confirmation.',rules:['Fresh HTF level','SBR / RBS or V / A evidence','Kissing-candle base can define the zone','Tap + lower-TF BOS / engulfing / rejection']},
 {key:'PRICE_ACTION',name:'Price Action',short:'Structure + candle confirmation',description:'Trades meaningful structure only after a clear rejection or engulfing confirmation.',rules:['Structural level','Rejection or engulfing','Structural invalidation','Minimum 2.25R']},
 {key:'LIQUIDITY_REVERSAL',name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Waits for price to take liquidity, reclaim the level and displace before considering a reversal.',rules:['Genuine sweep','Reclaim','Displacement','Structural stop']},
 {key:'CRT',name:'CRT',short:'Range → sweep → reclaim',description:'Candle Range Theory: works from a completed candle range, waits for one side to be swept, then requires a reclaim before targeting the opposite side.',rules:['Completed reference range','One-side liquidity sweep','Midpoint reclaim','Range-based invalidation','Minimum 2.25R']}
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
 const detail={
  TOP_DOWN:{entry:'HTF direction → middle confirmation → current execution condition.',invalidation:'Reject when higher-timeframe direction is absent or middle structure hard-conflicts.',target:'Qualified structural/liquidity targets under the existing risk model.'},
  PULLBACK:{entry:'Impulse → retracement into a fresh FVG/order block → continuation confirmation.',invalidation:'Zone invalidation or structural break against the HTF direction.',target:'Next qualified external liquidity beyond the entry.'},
  BREAKOUT:{entry:'Decisive close through structure with displacement; wick-only breaks are rejected.',invalidation:'Breakout fails back through the broken structure before acceptance.',target:'Next qualified liquidity level after the break.'},
  SMC:{entry:'Liquidity sweep → displacement → BOS → fresh FVG/order-block POI.',invalidation:'The sweep/POI structure fails and the protected level is lost.',target:'External liquidity created by the prior structure.'},
  MSNR:{entry:'Fresh Daily/4H support or resistance → tap → lower-timeframe BOS, engulfing or rejection confirmation.',invalidation:'The MSNR level breaks without the expected reaction/confirmation.',target:'Next structural/liquidity level from the live market.'},
  PRICE_ACTION:{entry:'Meaningful structural level → rejection or engulfing confirmation → execution.',invalidation:'The structural level fails and invalidates the candle thesis.',target:'Next qualified structural/liquidity level with minimum 2.25R.'},
  LIQUIDITY_REVERSAL:{entry:'Genuine liquidity sweep → reclaim → displacement → reversal execution.',invalidation:'Price fails to reclaim the swept level or breaks reversal structure.',target:'Opposing external liquidity.'},
  CRT:{entry:'Completed candle range → one-side sweep → reclaim through the range midpoint → execution.',invalidation:'The sweep extreme is lost or price fails to reclaim the range.',target:'Opposite side of the reference range, subject to the live risk model.'}
 }[item.key]||{};
 return <section className="strategy-explanation" aria-label={item.name+' strategy explanation'}>
  <div className="strategy-explanation-head"><div><span className="extras-kicker">STRATEGY MODEL</span><h3>{item.name}</h3><p>{item.description}</p></div><span>{item.short}</span></div>
  <div className="strategy-explanation-grid">
   <div><b>Entry model</b><span>{detail.entry}</span></div>
   <div><b>Live evidence</b><span>{evidence.length?evidence.map((x,i)=><em key={i}>{x}</em>):'No qualifying evidence yet.'}</span></div>
   <div><b>Invalidation</b><span>{detail.invalidation}</span></div>
   <div><b>Target model</b><span>{detail.target}</span></div>
   <div><b>Current engine state</b><span>{setup?.strategyReason||'Analyze the market to run this strategy against live candles.'}</span></div>
   <div><b>Decision</b><span>{setup?.strategyValid?'Strategy conditions are satisfied by the current market data.':'No trade is issued until the strategy conditions are satisfied.'}</span></div>
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
  const [items, setItems] = useState(readWatchlist);
  const saved = items.some(x => x.symbol === symbol && x.market === market);

  useEffect(() => { saveWatchlist(items); }, [items]);

  const toggle = () => {
    setItems(current => {
      const exists = current.some(x => x.symbol === symbol && x.market === market);
      return exists
        ? current.filter(x => !(x.symbol === symbol && x.market === market))
        : [{ symbol, market }, ...current].slice(0, 12);
    });
  };

  return (
    <section className="market-watchlist" aria-label="Market watchlist">
      <div className="watchlist-head">
        <div className="watchlist-title">
          <span className="extras-kicker"><Star size={11} /> WATCHLIST</span>
          <strong>Your markets</strong>
          <small>Saved on this device · available whenever you return</small>
        </div>
        <button type="button" className={saved ? 'watch-current saved' : 'watch-current'} onClick={toggle}>
          {saved ? <Check size={13} /> : <Plus size={13} />}
          {saved ? 'Saved' : 'Add market'}
        </button>
      </div>

      <div className="watchlist-items">
        {items.length ? items.map(item => (
          <button
            type="button"
            key={item.market + ':' + item.symbol}
            className={item.symbol === symbol && item.market === market ? 'watch-chip active' : 'watch-chip'}
            onClick={() => onSelect?.(item.symbol, item.market)}
            title={`Open ${item.symbol}`}
          >
            <span className="watch-dot" />
            <span>{item.symbol}</span>
            <em>{item.market === 'forex' ? 'FX' : item.market === 'commodities' ? 'CMDTY' : item.market === 'indices' ? 'INDEX' : 'PERP'}</em>
            {item.symbol === symbol && item.market === market && <span className="watch-active-mark">LIVE</span>}
          </button>
        )) : (
          <div className="watch-empty">
            <Bookmark size={14} />
            <span><b>No saved markets yet.</b> Add one and it stays here when you leave and come back.</span>
          </div>
        )}
      </div>
    </section>
  );
}

