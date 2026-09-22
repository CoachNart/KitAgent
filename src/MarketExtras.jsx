import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, Star, X, Target, ShieldCheck } from 'lucide-react';


const STRATEGY_LIBRARY=[
 {key:'TOP_DOWN',name:'Top-Down',short:'HTF structure first',description:'Higher-timeframe storyline → middle structure → execution condition.',rules:['HTF establishes direction','Middle TF confirms or conflicts','Execution TF must provide a live trade condition']},
 {key:'PULLBACK',name:'Pullback',short:'Impulse → retracement → continuation',description:'Trades a retracement into a fresh FVG or order block after a real impulse.',rules:['Directional impulse','Fresh FVG / order block','Zone remains executable','Minimum 2.25R']},
 {key:'BREAKOUT',name:'Breakout',short:'Close → displacement → continuation',description:'Requires a decisive close through structure with displacement; wick-only breaks do not qualify.',rules:['Recent BOS','Decisive close','Displacement','Fresh enough to execute']},
 {key:'SMC',name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a sweep, displacement, structure break and fresh FVG/order-block point of interest.',rules:['Liquidity sweep','Displacement','BOS','Fresh POI']},
 {key:'MSNR',name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Daily/4H storyline, fresh support/resistance, V/A formations, SBR/RBS and kissing-candle bases, then waits for lower-timeframe confirmation.',rules:['Fresh HTF level','SBR / RBS or V / A evidence','Kissing-candle base can define the zone','Tap + lower-TF BOS / engulfing / rejection']},
 {key:'PRICE_ACTION',name:'Price Action',short:'Structure + candle confirmation',description:'Trades meaningful structure only after a clear rejection or engulfing confirmation.',rules:['Structural level','Rejection or engulfing','Structural invalidation','Minimum 2.25R']},
 {key:'LIQUIDITY_REVERSAL',name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Waits for price to take liquidity, reclaim the level and displace before considering a reversal.',rules:['Genuine sweep','Reclaim','Displacement','Structural stop']}
];

export function StrategySelector({value,onChange}){
 return <section className="strategy-selector" aria-label="Setup strategy">
  <div className="strategy-selector-head">
   <div><span className="extras-kicker"><Target size={11}/> STRATEGY ENGINE</span><strong>Choose how KitSetups hunts the setup</strong><small>The selected rules are applied to the live market read — this is not a label layered on top of the old bias engine.</small></div>
   <span className="strategy-live"><ShieldCheck size={12}/> RULE-BASED</span>
  </div>
  <div className="strategy-options">
   {STRATEGY_LIBRARY.map(item=><button type="button" key={item.key} className={value===item.key?'strategy-option active':'strategy-option'} onClick={()=>onChange(item.key)}>
    <span><b>{item.name}</b><small>{item.short}</small></span><i>{value===item.key?'SELECTED':'USE'}</i>
   </button>)}
  </div>
 </section>
}

export function StrategyExplanation({setup,strategy}){
 const item=STRATEGY_LIBRARY.find(x=>x.key===strategy)||STRATEGY_LIBRARY[0];
 const rules=setup?.strategyEvidence?.length?setup.strategyEvidence:item.rules;
 return <section className="strategy-explanation">
  <div className="strategy-explanation-head"><div><span className="extras-kicker">WHY THIS STRATEGY</span><h3>{item.name}</h3><p>{item.description}</p></div><span>{item.short}</span></div>
  <div className="strategy-explanation-grid">
   <div><b>Objective</b><span>{item.key==='MSNR'?'Tap a fresh higher-timeframe level, then wait for lower-timeframe proof.':item.key==='SMC'?'Trade the confirmed repricing sequence after liquidity is taken.':item.key==='BREAKOUT'?'Trade acceptance beyond structure only after a decisive break.':item.key==='PULLBACK'?'Enter continuation from a fresh retracement zone.':item.key==='LIQUIDITY_REVERSAL'?'Trade the reversal only after sweep + reclaim + displacement.':'Turn the documented market structure into a current, executable trade plan.'}</span></div>
   <div><b>Engine evidence</b><span>{rules.map((x,i)=><em key={i}>{x}</em>)}</span></div>
   <div><b>Current state</b><span>{setup?.strategyReason||'Select Analyze pair to run this strategy against live candles.'}</span></div>
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
            <em>{item.market === 'forex' ? 'FX' : item.market === 'metals' ? 'CFD' : 'PERP'}</em>
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

export function SetupWhy({ setup, market, symbol }) {
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => {
    if (!setup) return [];
    const direction = setup.bias && setup.bias !== 'WAIT' ? setup.bias : setup.directionBias;
    return [
      { label:'Higher-timeframe structure', value:setup.higherBias||'WAIT', detail:setup.higherTimeframe ? `${setup.higherTimeframe} directional context` : 'Top-down structure' },
      { label:'Middle structure', value:setup.middleBias||'WAIT', detail:setup.middleTimeframe ? `${setup.middleTimeframe} confirmation layer` : 'Structure confirmation' },
      { label:'Entry alignment', value:setup.entryAligned?'ALIGNED':'WATCHING', detail:setup.entryTimeframe ? `${setup.entryTimeframe} execution layer` : 'Execution conditions' },
      { label:'Liquidity target', value:setup.liquidityType||'—', detail:'Derived from the available market structure' },
      { label:'Risk / reward', value:setup.riskReward||'—', detail:setup.stopDistanceUnits!=null ? `${setup.stopDistanceUnits} ${setup.priceUnitLabel==='pips'?'pips':'points'} risk distance` : 'Calculated from entry and invalidation' },
      { label:'Engine confidence', value:setup.confidence!=null?`${setup.confidence}%`:'—', detail:direction?`${direction} setup context`:'No directional setup' }
    ];
  }, [setup]);

  if (!setup) return null;
  const reason = setup.structureConflict
    ? 'Higher-timeframe direction is not yet confirmed by lower structure, so execution is being withheld.'
    : setup.entryAligned
      ? 'Entry conditions are aligned with the broader structure. Levels come from the live market read.'
      : setup.setupReason || 'The engine is monitoring this market for a cleaner execution condition.';

  return (
    <section className={open ? 'setup-why open' : 'setup-why'}>
      <button type="button" className="setup-why-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="setup-why-icon"><CircleHelp size={15} /></span>
        <span><b>Why this setup?</b><small>Live evidence behind this market read</small></span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="setup-why-body">
          <div className="setup-why-summary">
            <span>{market || 'MARKET'} · {symbol || '—'}</span>
            <p>{reason}</p>
          </div>
          <div className="setup-evidence-grid">
            {rows.map(row => <div className="setup-evidence" key={row.label}><span>{row.label}</span><b>{row.value}</b><small>{row.detail}</small></div>)}
          </div>
          {setup.structuralInvalidation != null && <div className="setup-invalidation"><span>INVALIDATION</span><b>{setup.structuralInvalidation}</b><small>If structure reaches this level, the current thesis is no longer valid.</small></div>}
          <div className="setup-why-note"><Check size={13} /><span>Evidence is taken from the same live setup payload used for the levels above.</span></div>
        </div>
      )}
    </section>
  );
}
