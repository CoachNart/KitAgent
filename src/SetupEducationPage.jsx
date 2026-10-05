import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowUpRight,CheckCircle2,CircleHelp,ShieldCheck,Target,Waypoints,Zap} from 'lucide-react';
import {STRATEGY_LIBRARY} from './MarketExtras.jsx';

const LIVE_KEY='kitagent:last-market-setup:v3';
function humanEvidence(value){const s=String(value||'');return s.replace(/HTF (LONG|SHORT)/g,'Higher-timeframe direction: $1').replace(/Structure (LONG|SHORT)/g,'Middle structure: $1').replace(/Weekly (LONG|SHORT)/g,'Weekly direction: $1').replace(/Daily (LONG|SHORT)/g,'Daily direction: $1').replace('Structural invalidation stop.','Stop protected by a validated structural swing.').replace('POI invalidation stop.','Stop protected beyond the entry area.').replace('Sweep invalidation stop.','Stop protected beyond the sweep extreme.').replace('Confirmed structural impulse.','A recent directional impulse is confirmed.').replace('Measured retracement.','Price retraced into the planned area.').replace('Rejection/engulfing confirmed.','A qualifying rejection or engulfing candle is confirmed.').replace('Reclaim confirmed.','Price reclaimed the swept level.').replace('Range liquidity swept/reclaimed.','One side of the reference range was swept and reclaimed.').replace('Structural liquidity.','Meaningful structural liquidity is present.');}
function fmt(v){if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}

export default function SetupEducationPage({onBack}){
 const [selected,setSelected]=useState('TOP_DOWN');
 const [live,setLive]=useState(null);
 useEffect(()=>{try{const raw=localStorage.getItem(LIVE_KEY);if(raw)setLive(JSON.parse(raw))}catch{}},[]);
 const item=useMemo(()=>STRATEGY_LIBRARY.find(x=>x.key===selected)||STRATEGY_LIBRARY[0],[selected]);
 const setup=live?.setup;
 const liveStrategy=live?.strategy||setup?.strategy;
 const hasLive=Boolean(setup?.tradeReady&&liveStrategy===selected);
 const context=setup?.tradeBreakdown?.marketContext||setup?.structureEvidence||{};
 const event=context.latestBOS||context.latestCHoCH||context.latestMSS;
 const direction=setup?.bias;
 return <div className='setup-guide-page'>
  <header className='setup-guide-hero'>
   <button type='button' className='setup-guide-back' onClick={onBack}><ArrowLeft size={15}/> Market analysis</button>
   <div className='setup-guide-eyebrow'><Zap size={12}/> KITSETUPS SETUP ENGINE</div>
   <h1>Understand the setup<br/><span>before you trade it.</span></h1>
   <p>Every setup is built from live market structure. This guide shows what the engine must prove, what invalidates the idea, and how the target is selected.</p>
   <div className='setup-guide-flow'><span><b>01</b> Direction</span><i>→</i><span><b>02</b> Structure</span><i>→</i><span><b>03</b> Trigger</span><i>→</i><span><b>04</b> Protection</span><i>→</i><span><b>05</b> Target</span></div>
  </header>
  <section className='setup-guide-live'>
   <div className='setup-guide-section-head'><div><span className='setup-guide-kicker'>LIVE SETUP ANATOMY</span><h2>See the actual evidence behind a setup</h2><p>When a live analysis exists for the selected strategy, these values come from the same market read used to generate the setup.</p></div>{hasLive&&<span className='setup-live-badge'><i/> LIVE {live.symbol}</span>}</div>
   {hasLive ? <div className='setup-live-grid'>
    <div className='setup-live-card'><span>BIAS</span><b className={direction==='LONG'?'is-long':'is-short'}>{direction}</b><small>{setup.entryTimeframe} execution · {setup.analysisTimeframes?.join(' → ')}</small></div>
    <div className='setup-live-card'><span>STRUCTURE EVENT</span><b>{event?.direction||'—'} {event?.level?'· '+fmt(event.level):''}</b><small>{event?.level?'Observed on the live structure read.':'No qualifying break event exposed by this analysis.'}</small></div>
    <div className='setup-live-card'><span>ENTRY</span><b>{fmt(setup.entry)}</b><small>{setup.orderType||'—'} · {setup.entryReason||'Engine-selected execution level'}</small></div>
    <div className='setup-live-card'><span>INVALIDATION</span><b>{fmt(setup.stopLoss)}</b><small>{setup.invalidationSource||'Validated structural invalidation'}</small></div>
    <div className='setup-live-card'><span>TARGET</span><b>{fmt(setup.takeProfit1)}</b><small>{setup.riskReward||'—'} · structural/liquidity target</small></div>
    <div className='setup-live-card setup-live-proof'><span>WHY IT PASSED</span><b>Strategy + structure + risk checks passed</b><small>{(setup.strategyEvidence||[]).map(humanEvidence).filter(Boolean).slice(0,3).join(' · ')||'No additional strategy evidence was returned.'}</small></div>
   </div> : <div className='setup-guide-empty'><CircleHelp size={18}/><div><b>No live {item.name} analysis loaded</b><span>Run {item.name} in Market Analysis, then return here to see its actual levels and evidence.</span></div></div>}
  </section>
  <section className='setup-guide-library'>
   <div className='setup-guide-section-head'><div><span className='setup-guide-kicker'>STRATEGY LIBRARY</span><h2>How each setup is built</h2><p>Select a strategy to inspect its exact sequence of conditions.</p></div></div>
   <div className='setup-guide-tabs'>{STRATEGY_LIBRARY.map(x=><button type='button' key={x.key} className={x.key===selected?'active':''} onClick={()=>setSelected(x.key)}>{x.name}<small>{x.short}</small></button>)}</div>
   <article className='setup-strategy-detail'>
    <div className='setup-strategy-title'><div><span className='setup-guide-kicker'>RULESET</span><h3>{item.name}</h3><p>{item.description}</p></div><div className='setup-strategy-mark'><Waypoints size={20}/></div></div>
    <div className='setup-strategy-steps'>{item.steps.map(([title,body],i)=><div key={title}><span>{String(i+1).padStart(2,'0')}</span><div><b>{title.replace(/^\d+ · /,'')}</b><p>{body}</p></div></div>)}</div>
    <div className='setup-rules'><div><ShieldCheck size={15}/><b>Pass conditions</b><p>{item.rules.map(rule=><span key={rule}><CheckCircle2 size={11}/>{rule}</span>)}</p></div><div><Target size={15}/><b>Risk discipline</b><p>Entry must match the strategy direction. Invalidation must sit on the correct side of structure. The target must be meaningful and the geometry must reach at least <strong>2R</strong>.</p></div></div>
   </article>
  </section>
  <section className='setup-guide-principles'><div><span className='setup-guide-kicker'>MARKET LOGIC</span><h2>What the engine is actually checking</h2></div><div className='setup-principle-grid'>
   <article><b>Direction is a hierarchy</b><p>The higher timeframe establishes the directional framework. Lower timeframes refine the opportunity; they do not automatically override the macro structure.</p></article>
   <article><b>Breaks need context</b><p>BOS, CHoCH and MSS are structural events, not labels placed on every candle. The engine reads confirmed swing relationships and price breaks from the live candle series.</p></article>
   <article><b>Entry is a location</b><p>A setup can use a market entry or a planned limit entry. A limit level must be on the correct side of current price and come from a qualified structural location.</p></article>
   <article><b>Stops prove the thesis wrong</b><p>The stop is tied to the structural invalidation reference and buffered for volatility. It is not chosen from an arbitrary recent wick.</p></article>
   <article><b>Targets pay for the risk</b><p>The target is selected from meaningful opposing structure or liquidity. If the nearest valid level cannot produce 2R, the engine can evaluate the next structural target instead.</p></article>
   <article><b>No trade is a valid result</b><p>If structure, confirmation, invalidation, target or risk geometry fails, the engine should show no setup rather than invent levels to make a trade appear.</p></article>
  </div></section>
  <footer className='setup-guide-footer'><button type='button' onClick={onBack}>Back to live analysis <ArrowUpRight size={14}/></button></footer>
 </div>;
}