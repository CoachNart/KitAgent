import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,RefreshCw,ScanSearch,TrendingDown,TrendingUp,Clock} from 'lucide-react';
import {auth} from './firebase.js';
import {MarketWatchlist, StrategySelector} from './MarketExtras.jsx';
import './market-extras.css';
export const TIMEFRAMES=['AUTO','15m','30m','1H','2H','4H'];
const TIMEFRAME_GUIDE={
 'AUTO':{title:'AUTO · best qualified execution',desc:'Evaluates every supported execution timeframe and selects the strongest strategy-specific setup that passes all rules.'},
 '15m':{title:'15m · execution timeframe',desc:'The selected strategy must complete its own trigger and entry model on 15m; higher-timeframe context is checked automatically.'},
 '30m':{title:'30m · execution timeframe',desc:'The selected strategy must complete its own trigger and entry model on 30m; higher-timeframe context is checked automatically.'},
 '1H':{title:'1H · execution timeframe',desc:'The selected strategy must complete its own trigger and entry model on 1H; higher-timeframe context is checked automatically.'},
 '2H':{title:'2H · execution timeframe',desc:'The selected strategy must complete its own trigger and entry model on 2H; higher-timeframe context is checked automatically.'},
 '4H':{title:'4H · execution timeframe',desc:'The selected strategy must complete its own trigger and entry model on 4H; the engine adds the required higher-timeframe context automatically.'}
};
const instrumentCache=new Map();
const instrumentRequests=new Map();
function symbolFor(pair){return pair.replace('/','');}
function price(v){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}
async function waitForAuthUser(timeoutMs=5000){if(auth?.currentUser)return auth.currentUser;return new Promise(resolve=>{let done=false;let unsubscribe=null;const finish=u=>{if(done)return;done=true;clearTimeout(timer);unsubscribe?.();resolve(u||null)};unsubscribe=auth?.onAuthStateChanged(finish)||null;const timer=setTimeout(()=>finish(auth?.currentUser||null),timeoutMs)})}
async function authToken(forceRefresh=false){const user=await waitForAuthUser();if(!user)return '';return user.getIdToken(forceRefresh)}
async function persistSignal(body){const user=await waitForAuthUser(2500),setup=body?.setup;if(!user||!setup?.tradeReady||!['MARKET','LIMIT'].includes(String(setup.orderType||'').toUpperCase())||!['LONG','SHORT'].includes(String(setup.bias||'').toUpperCase())||![setup.entry,setup.stopLoss,setup.takeProfit1].every(v=>Number.isFinite(Number(v))))return null;try{const token=await user.getIdToken();const response=await fetch('/api/signals',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({market:body.market,symbol:body.symbol,timeframe:body.timeframe,strategy:body.strategy||body.setup?.strategy||body.setup?.strategyName||'',setup:body.setup,aligned:body.aligned,totalTimeframes:body.totalTimeframes,confluence:body.confluence})});if(!response.ok)return null;const result=await response.json();window.dispatchEvent(new CustomEvent('kitagent-signal-recorded',{detail:result.signal}));return result;}catch(error){console.warn('KitSetups signal history sync failed:',error);return null;}}
export default function LiveMarketPage(){const market='perpetual';const [pair,setPair]=useState(''),[timeframe,setTimeframe]=useState('AUTO'),[strategy,setStrategy]=useState('TOP_DOWN'),[loading,setLoading]=useState(false),[sourceLoading,setSourceLoading]=useState(true),[error,setError]=useState(''),[result,setResult]=useState(()=>{try{const raw=localStorage.getItem('kitagent:last-market-setup:v5');return raw?JSON.parse(raw):null}catch{return null}}),[savedSignal,setSavedSignal]=useState(null),[instrumentQuery,setInstrumentQuery]=useState(''),[instruments,setInstruments]=useState([]),[pickerOpen,setPickerOpen]=useState(false);

 useEffect(()=>{try{localStorage.removeItem('kitagent:last-market-setup:v3');localStorage.removeItem('kitagent:last-market-setup:v4')}catch{}},[]);
 useEffect(()=>{if(!TIMEFRAMES.includes(timeframe))setTimeframe('AUTO')},[timeframe]);

 useEffect(()=>{if(result?.market==='perpetual'&&result?.symbol){setPair(result.symbol.includes('/')?result.symbol:result.symbol.replace(/USDT$/,'/USDT'));setTimeframe(TIMEFRAMES.includes(result.timeframe)?result.timeframe:'AUTO');setStrategy(result.strategy||result.setup?.strategy||'TOP_DOWN')}},[]);

 useEffect(()=>{let cancelled=false;setError('');setInstrumentQuery('');setPickerOpen(false);const cached=instrumentCache.get(market);if(cached?.length){setInstruments(cached);setPair(p=>p&&cached.some(x=>x.symbol===p)?p:cached[0]?.symbol||'');setSourceLoading(false);return()=>{cancelled=true}}setSourceLoading(true);let request=instrumentRequests.get(market);if(!request){request=(async()=>{const token=await authToken();const requestOptions={headers:token?{Authorization:'Bearer '+token}: {},cache:'no-store'};let r=await fetch('/api/market?action=instruments&market='+encodeURIComponent(market),requestOptions);let body=await r.json().catch(()=>({}));if((r.status===401||r.status===403)){const freshToken=await authToken(true);if(freshToken){r=await fetch('/api/market?action=instruments&market='+encodeURIComponent(market),{headers:{Authorization:'Bearer '+freshToken},cache:'no-store'});body=await r.json().catch(()=>({}));}}if(!r.ok){throw new Error(body?.error||'Live market instruments are temporarily unavailable. Please retry.');}if(!Array.isArray(body?.instruments)||!body.instruments.length)throw new Error('No Crypto perpetual instruments are currently available. Please retry.');const live=body.instruments.map(x=>({symbol:x.symbol,name:x.name||''}));instrumentCache.set(market,live);return live})().finally(()=>instrumentRequests.delete(market));instrumentRequests.set(market,request)}request.then(live=>{if(cancelled)return;setInstruments(live);setPair(p=>p&&live.some(x=>x.symbol===p)?p:live[0]?.symbol||'');}).catch(e=>{if(!cancelled){setInstruments([]);setPair('');setError(e?.message||'Unable to load live instruments from the market-data source. Please retry.')}}).finally(()=>{if(!cancelled)setSourceLoading(false)});return()=>{cancelled=true}},[market]);

 const filteredPairs=useMemo(()=>{const q=instrumentQuery.trim().toUpperCase();return q?instruments.filter(x=>`${x.symbol} ${x.name||''}`.toUpperCase().includes(q)):instruments},[instruments,instrumentQuery]);
 const customCryptoSymbol=useMemo(()=>{const raw=instrumentQuery.trim().toUpperCase().replace(/\s+/g,'');if(!raw)return '';const base=raw.replace(/\/USDT$/,'').replace(/USDT$/,'');if(!/^[A-Z0-9]+$/.test(base))return '';const candidate=`${base}/USDT`;return instruments.some(x=>x.symbol===candidate)?'':candidate},[instrumentQuery,instruments]);

 const analyze=async()=>{if(!pair)return;setLoading(true);setError('');try{const endpoint='/api/market';const token=await authToken();if(!token)throw new Error('Authentication is still initializing. Please retry.');const r=await fetch(`${endpoint}?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbolFor(pair))}&timeframe=${encodeURIComponent(timeframe)}&strategy=${encodeURIComponent(strategy)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok){if(r.status===401)throw new Error('Your session is still initializing. Please retry.');if(r.status===403){window.dispatchEvent(new CustomEvent('kitagent-open-profile'));throw new Error(body.error||'Your trial or Premium access has expired')}throw new Error(body.error||`Market analysis failed (${r.status})`);}setResult(body);try{localStorage.setItem('kitagent:last-market-setup:v5',JSON.stringify(body));}catch{}window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:body}));persistSignal(body).then(saved=>{if(saved?.signal)setSavedSignal(saved.signal)});}catch(e){setError(e.message||'Unable to read market data right now.')}finally{setLoading(false)}};

 return (
    <div className="live-market page-wrap">
      <div className="live-market-head">
        <div>
          <h2>Market analysis</h2>
        </div>
        <span className="live-readonly"><ScanSearch size={13}/> READ ONLY</span>
      </div>

      <MarketWatchlist market={market} symbol={pair} onSelect={(next)=>setPair(next)}/>

      <section className="live-market-card">
        <div className="live-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" className="active market-mode"><b>PERPETUALS</b></button></div>

        <div className="live-controls">
          <label className="live-field market-picker">
            <span>PAIR</span>
            <div className="instrument-picker">
              <button type="button" className="instrument-trigger" onClick={()=>setPickerOpen(v=>!v)} aria-expanded={pickerOpen}>
                <b>{pair||'Select pair'}</b><ChevronDown className={pickerOpen?'open':''}/>
              </button>
              {pickerOpen&&
                <div className="instrument-menu">
                  <div className="instrument-search">
                    <ScanSearch/>
                    <input autoFocus value={instrumentQuery} onChange={e=>setInstrumentQuery(e.target.value)} placeholder="Search crypto perpetuals…" aria-label="Search market pairs"/>
                  </div>
                  <div className="instrument-results">
                    {filteredPairs.map(x=>
                      <button type="button" key={x.symbol} className={pair===x.symbol?'selected':''} onClick={()=>{setPair(x.symbol);setInstrumentQuery('');setPickerOpen(false)}}>
                        <b>{x.symbol}</b><small>PERPETUAL</small>
                      </button>
                    )}
                    {!filteredPairs.length&&customCryptoSymbol&&
                      <button type="button" className="instrument-custom" onClick={()=>{setPair(customCryptoSymbol);setInstrumentQuery('');setPickerOpen(false)}}>
                        <b>{customCryptoSymbol}</b><small>ANALYZE SELECTED SYMBOL</small>
                      </button>
                    }
                    {!filteredPairs.length&&!customCryptoSymbol&&<small className="instrument-empty">No matching pairs found.</small>}
                  </div>
                </div>
              }
            </div>
          </label>

          <label className="live-field timeframe">
            <span>EXECUTION</span>
            <div>
              <select value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{TIMEFRAMES.map(x=><option key={x} value={x}>{x}</option>)}</select>
              <ChevronDown/>
            </div>
          </label>

          <StrategySelector value={strategy} onChange={setStrategy}/>
          <button type="button" className="strategy-guide-button" onClick={()=>window.dispatchEvent(new CustomEvent('kitsetups-open-setup-guide'))} aria-label="Open strategy library">
            <span><small>READ THE RULES</small><b>Strategy library</b></span><span className="strategy-guide-arrow">↗</span>
          </button>
          <button type="button" className="live-analyze" onClick={analyze} disabled={loading||sourceLoading||!pair}>
            {loading?<><RefreshCw className="spin"/> Reading market</>:sourceLoading?<><RefreshCw className="spin"/> Loading source</>:<><BarChart3/> Analyze pair</>}
          </button>
        </div>

        {error&&<div className="live-error">{error}<button type="button" onClick={analyze}>Retry</button></div>}
        {!result&&!loading&&!error&&
          <div className="live-empty"><ScanSearch/><b>Select a market and analyze</b><span>Live structure · execution · risk</span></div>
        }
        {loading&&
          <div className="live-loading"><span className="loading-orb"/><b>Reading market</b><small>{timeframe} · live structure</small></div>
        }
        {result&&
          <>
            <AnalysisResult result={result} savedSignal={savedSignal}/>
          </>
        }
      </section>
    </div>
  );
}
const STRATEGY_WAIT_COPY={TOP_DOWN:'Waiting for aligned HTF direction, an execution BOS, and a retest-and-hold.',PULLBACK:'Waiting for a confirmed impulse, 38.2–61.8% retracement, and closed continuation break.',BREAKOUT:'Waiting for a multi-touch level, decisive breakout, retest hold, and continuation close.',SMC:'Waiting for a valid liquidity sweep, post-sweep MSS/displacement, and fresh FVG retracement.',MSNR:'Waiting for a fresh MSNR key level and its exact closed-candle confirmation sequence.',CRT:'Waiting for the completed CRT range to sweep/reclaim, then MSS/displacement and a valid retest.'};
function strategyWaitCopy(strategy){return STRATEGY_WAIT_COPY[strategy]||'No valid strategy-specific entry condition is present yet.';}
function AnalysisResult({result,savedSignal}){
  const s=result.setup||{};
  const hasTrade=Boolean(s.tradeReady&&['LONG','SHORT'].includes(String(s.bias||'').toUpperCase())&&['MARKET','LIMIT'].includes(String(s.orderType||'').toUpperCase())&&[s.entry,s.stopLoss,s.takeProfit1].every(v=>Number.isFinite(Number(v))));
  const long=hasTrade&&s.bias==='LONG',short=hasTrade&&s.bias==='SHORT',wait=!hasTrade,Icon=long?TrendingUp:short?TrendingDown:Clock;
  const stopDistanceLabel=s.stopDistanceUnits!=null ? String(s.stopDistanceUnits)+' '+(s.priceUnitLabel==='pips'?'pips':'pts') : '—';
  const direction=long?'LONG':short?'SHORT':'NO TRADE',tone=wait?'wait':(long?'long':'short');
  return <div className="live-result">
    <div className={'setup-card-v2 '+tone}>
      <div className="setup-v2-head">
        <div className="setup-v2-symbol"><span><b>STRATEGY</b> · {s.strategyName||result.strategy||'Top-Down'} · ENTRY {s.entryTimeframe||result.timeframe}</span><h3>{result.symbol.includes('/')?result.symbol:result.symbol.replace(/USDT$/,'/USDT')}</h3></div>
        <div className="setup-v2-bias"><Icon size={15}/><b>{direction}</b></div>
        <div className="setup-v2-confidence"><b>{hasTrade?s.confidence||0:0}%</b><span>CONFIDENCE</span></div>
      </div>
      {!hasTrade ? <div className="strategy-status-card"><span>NO TRADE</span><b>{strategyWaitCopy(result.strategy||'TOP_DOWN')}</b></div> : <>
        <div className="strategy-trade-status"><span>{s.orderType==='LIMIT'?'LIMIT ORDER':'MARKET ORDER'}</span><b>{s.orderType==='LIMIT'?'WAITING AT PLANNED LEVEL':'EXECUTION AVAILABLE NOW'}</b></div>
        <div className="setup-v2-levels">
          <div className="v2-level entry"><span>{s.orderType==='LIMIT'?'LIMIT ENTRY':'ENTRY'} <em className="order-type-inline">{s.orderType||'MARKET'}</em></span><b>{price(s.entry)}</b>{s.orderType==='LIMIT'&&<small>Current {price(s.marketEntry)}</small>}</div>
          <div className="v2-level stop"><span>STOP</span><b>{price(s.stopLoss)}</b>{s.structuralInvalidation!=null&&<small>Invalidation {price(s.structuralInvalidation)} · {stopDistanceLabel} risk</small>}</div>
          <div className="v2-level tp"><span>TP</span><b>{price(s.takeProfit1)}</b></div>
        </div>
        <div className="strategy-trade-footer"><span>RR {hasTrade?s.riskReward:'—'}</span><span>{s.liquidityType||'STRUCTURAL TARGET'}</span></div>
      </>}
    </div>
    <RiskCalculator setup={s}/>
    {hasTrade&&<button type="button" className="setup-guide-button" onClick={()=>window.dispatchEvent(new CustomEvent("kitsetups-open-breakdown"))}><span>Read about setup</span><ChevronDown size={13}/></button>}
    {hasTrade&&<TradeBreakdown setup={s} result={result}/>} 
  </div>
}


function RiskCalculator({setup}){
  const generatedDirection=String(setup?.bias||'').toUpperCase();
  const validTrade=Boolean(
    setup?.tradeReady &&
    ['LONG','SHORT'].includes(generatedDirection) &&
    [setup.entry,setup.stopLoss,setup.takeProfit1].every(v=>Number.isFinite(Number(v)))
  );
  const [manualDirection,setManualDirection]=useState('LONG');
  const direction=validTrade?generatedDirection:manualDirection;
  const [margin,setMargin]=useState('');
  const [leverage,setLeverage]=useState('5');
  const [entry,setEntry]=useState('');
  const [stopLoss,setStopLoss]=useState('');
  const [takeProfit,setTakeProfit]=useState('');
  const [calculation,setCalculation]=useState(null);
  const [validation,setValidation]=useState('');

  useEffect(()=>{
    if(!validTrade)return;
    setEntry(String(setup.entry));
    setStopLoss(String(setup.stopLoss));
    setTakeProfit(String(setup.takeProfit1));
    setCalculation(null);
    setValidation('');
  },[validTrade,setup?.entry,setup?.stopLoss,setup?.takeProfit1]);

  const estimatedLiquidation=(()=>{
    const l=Number(leverage), e=Number(entry);
    if(!(l>0&&e>0))return null;
    return direction==='LONG'?e*(1-1/l):e*(1+1/l);
  })();

  const calculate=()=>{
    const m=Number(margin), l=Number(leverage), e=Number(entry), sl=Number(stopLoss), tp=Number(takeProfit);
    if(!(m>0))return setValidation('Enter a margin greater than 0.');
    if(!(l>0))return setValidation('Enter leverage greater than 0.');
    if(!(e>0&&sl>0&&tp>0))return setValidation('Entry, stop loss and take profit must be valid prices.');
    if(direction==='LONG' && !(sl<e&&tp>e))return setValidation('For a LONG setup, SL must be below entry and TP above entry.');
    if(direction==='SHORT' && !(sl>e&&tp<e))return setValidation('For a SHORT setup, SL must be above entry and TP below entry.');
    const notional=m*l;
    const size=notional/e;
    const risk=Math.abs(e-sl)*size;
    const profit=Math.abs(tp-e)*size;
    const rr=risk>0?profit/risk:0;
    const liquidation=direction==='LONG'?e*(1-1/l):e*(1+1/l);
    const liqDistance=Math.abs(liquidation-e)/e*100;
    setValidation('');
    setCalculation({notional,size,risk,profit,rr,liquidation,liqDistance});
  };

  return <section className={`risk-calculator ${direction==='LONG'?'risk-long':'risk-short'}`} aria-label="Risk calculator">
    <div className="risk-calc-head">
      <div>
        <h3>Position calculator</h3><span className="risk-live-note">{validTrade?'SETUP AUTO-FILLED':'MANUAL'}</span>
      </div>
      {validTrade ? <span className="risk-direction">{direction}</span> : <select className="risk-direction-select" aria-label="Direction" value={manualDirection} onChange={e=>{setManualDirection(e.target.value);setCalculation(null)}}><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select>}
    </div>

    <div className="risk-calc-grid">
      <label className="risk-field"><span>MARGIN</span><div><em>$</em><input inputMode="decimal" value={margin} onChange={e=>{setMargin(e.target.value);setCalculation(null)}} placeholder="1,000"/></div></label>
      <label className="risk-field"><span>LEVERAGE</span><div><input inputMode="decimal" value={leverage} onChange={e=>{setLeverage(e.target.value);setCalculation(null)}} placeholder="5"/><em>×</em></div></label>
      <label className="risk-field"><span>ENTRY {validTrade&&<em className="risk-autofill-label">AUTO</em>}</span><div><input inputMode="decimal" value={entry} onChange={e=>{setEntry(e.target.value);setCalculation(null)}}/></div></label>
      <label className="risk-field"><span>STOP LOSS {validTrade&&<em className="risk-autofill-label">AUTO</em>}</span><div><input inputMode="decimal" value={stopLoss} onChange={e=>{setStopLoss(e.target.value);setCalculation(null)}}/></div></label>
      <label className="risk-field"><span>TAKE PROFIT {validTrade&&<em className="risk-autofill-label">AUTO</em>}</span><div><input inputMode="decimal" value={takeProfit} onChange={e=>{setTakeProfit(e.target.value);setCalculation(null)}}/></div></label>
      <div className="risk-field risk-auto"><span>EST. LIQUIDATION</span><div><b>{estimatedLiquidation!=null?price(estimatedLiquidation):'—'}</b><em>AUTO</em></div></div>
    </div>

    <div className="risk-calc-action">
      <button type="button" onClick={calculate}>Calculate</button>
      {validation&&<span role="alert">{validation}</span>}
    </div>

    {calculation&&<div className="risk-results">
      <div className="risk-result-primary"><span>POSITION SIZE</span><b>{price(calculation.size)}</b><small>units</small></div>
      <div><span>POSITION VALUE</span><b>{price(calculation.notional)}</b></div>
      <div className="risk-loss"><span>MAX LOSS AT SL</span><b>−{price(calculation.risk)}</b></div>
      <div className="risk-profit"><span>POTENTIAL PROFIT</span><b>+{price(calculation.profit)}</b></div>
      <div><span>RISK / REWARD</span><b>1 : {calculation.rr.toFixed(2)}</b></div>
      <div><span>LIQUIDATION DISTANCE</span><b>{calculation.liqDistance.toFixed(2)}%</b></div>
    </div>}

    <p className="risk-disclaimer">Estimated liquidation · isolated margin</p>
  </section>;
}
function TradeBreakdown({setup,result}){
 const [open,setOpen]=useState(false);
 const b=setup?.tradeBreakdown||{},d=setup?.strategyDetails||{},strategy=result?.strategy||setup?.strategy||'';
 const fmt=v=>v==null||Number.isNaN(Number(v))?'—':price(v);
 const dir=String(setup?.bias||'').toUpperCase();
 const baseDirection=dir==='LONG'?'The higher-timeframe structure supports a bullish thesis.':dir==='SHORT'?'The higher-timeframe structure supports a bearish thesis.':'No directional thesis is currently executable.';
 let rows=[],levels=[];
 if(strategy==='TOP_DOWN'){
   const bos=d.executionBOS,rt=d.retest,t=d.target;
   rows=[['MARKET READ',baseDirection],['BOS','Closed execution BOS beyond '+fmt(bos?.level)+' on the '+(setup.entryTimeframe||'entry')+' timeframe.'],['RETEST','Price returned to '+fmt(bos?.level)+' and held it as the new structural side.'],['ENTRY',setup.orderType==='LIMIT'?'Planned entry waits at the qualified retest location.':'Entry is actionable at the qualified retest condition.'],['INVALIDATION','Stop protects the retest candle extreme with a volatility buffer.'],['TARGET','Target '+fmt(t?.price||d?.target)+' is the continuation structural objective and passed the 2R gate.']];
   levels=[['BOS LEVEL',bos?.level,'Execution BOS'],['RETEST',rt?.price,'Retest close'],['TARGET',t?.price,'Structural continuation']];
 } else if(strategy==='PULLBACK'){
   const z=d.retracement,t=d.target;
   rows=[['MARKET READ',baseDirection],['IMPULSE','A confirmed directional impulse runs from '+fmt(d.impulse?.start?.price)+' to '+fmt(d.impulse?.end?.price)+'.'],['RETRACEMENT','Price entered the 38.2–61.8% retracement zone: '+fmt(z?.low)+'–'+fmt(z?.high)+'.'],['CONFIRMATION','A closed continuation break confirmed the pullback ended without breaking the impulse origin.'],['INVALIDATION','Stop protects the pullback candle and impulse origin.'],['TARGET','The impulse extreme or later structure is used only when it remains beyond entry and provides at least 2R.']];
   levels=[['IMPULSE END',d.impulse?.end?.price,'Continuation objective'],['RETRACE LOW',z?.low,'38.2–61.8% zone'],['RETRACE HIGH',z?.high,'38.2–61.8% zone'],['TARGET',t?.price,'Structural target']];
 } else if(strategy==='BREAKOUT'){
   const l=d.level,br=d.breakout,rt=d.retest,t=d.target;
   rows=[['MARKET READ',baseDirection],['LEVEL','Multi-touch '+(dir==='LONG'?'resistance':'support')+' clustered at '+fmt(l?.level)+'.'],['BREAKOUT','Closed candle broke the level decisively with body/range confirmation'+(br?.atrMultiple?' ('+Number(br.atrMultiple).toFixed(2)+'× ATR).':'.')],['RETEST','The broken level held its new role; a close back through it would invalidate the setup.'],['CONTINUATION','A later closed candle confirmed continuation beyond the retest candle.'],['INVALIDATION','Stop protects the retest/level with a volatility buffer.'],['TARGET','Target '+fmt(t?.price)+' is the structural or range-projection objective and passed 2R.']];
   levels=[['LEVEL',l?.level,'Multi-touch boundary'],['BREAKOUT',br?.candle?.close,'Decisive close'],['RETEST',rt?.candle?.close,'Role reversal'],['TARGET',t?.price,'Continuation objective']];
 } else if(strategy==='SMC'){
   const x=d;
   rows=[['MARKET READ','HTF bias is '+(x?.htfBias||dir)+'.'],['LIQUIDITY SWEEP','Price swept the opposing liquidity pool at '+fmt(x?.sweep?.level)+' and reclaimed it.'],['MSS + DISPLACEMENT','Post-sweep MSS at '+fmt(x?.mss?.level)+' was produced by meaningful displacement.'],['FVG','Fresh '+(x?.fvg?.direction||'directional')+' FVG: '+fmt(x?.fvg?.low)+'–'+fmt(x?.fvg?.high)+', positioned in '+(x?.dealingRange?(x.fvg.midpoint<=x.dealingRange.equilibrium?'discount':'premium'):'the validated dealing range')+'.'],['ENTRY','Entry is the FVG midpoint '+fmt(x?.fvg?.midpoint)+'.'],['INVALIDATION','Stop sits beyond the sweep extreme with volatility buffer.'],['TARGET','Target '+fmt(x?.target)+' is the opposing liquidity objective and passed 2R.']];
   levels=[['SWEEP',x?.sweep?.level,'Liquidity level'],['MSS',x?.mss?.level,'Structure shift'],['FVG MID',x?.fvg?.midpoint,'Entry'],['TARGET',x?.target,'Liquidity objective']];
 } else if(strategy==='MSNR'){
   const x=d,level=x?.level,ev=x?.confirmation,obj=x?.objective;
   rows=[['KEY LEVEL',(level?.type||'MSNR')+' '+(level?.side||'LEVEL')+' at '+fmt(level?.price)+'.'],['FRESHNESS',level?.fresh?'Level was fresh before confirmation.':'Level was not fresh before confirmation.'],['CONFIRMATION',ev?.type?ev.type+' confirmed with the required closed-candle sequence and full-body hold.':'Exact MSNR confirmation passed.'],['ENTRY','Live price remained close enough to the confirmation candle to be executable.'],['INVALIDATION','Stop protects the MSNR level and confirmation-candle extreme with buffer.'],['TARGET',(obj?.type||'Opposing MSNR level')+' at '+fmt(obj?.price)+' is the next valid opposing objective and passed 2R.']];
   levels=[['LEVEL',level?.price,level?.type],['CONFIRMATION',ev?.signalCandle?.close,'Closed confirmation'],['TARGET',obj?.price,obj?.type]];
 } else if(strategy==='CRT'){
   const x=d;
   rows=[['REFERENCE RANGE','Completed '+(x?.anchor?.timeframe||'HTF')+' candle: '+fmt(x?.anchor?.low)+'–'+fmt(x?.anchor?.high)+'.'],['HTF SWEEP','The following higher-timeframe candle swept the '+(x?.sweep?.side||'boundary')+' side and closed back inside the range.'],['EXECUTION SWEEP','The entry timeframe confirmed the same boundary sweep/reclaim.'],['MSS + DISPLACEMENT','Lower-timeframe structure shifted at '+fmt(x?.mss?.level)+' with meaningful displacement.'],['RETEST','Price retested and held the MSS level before entry.'],['INVALIDATION','Stop protects the sweep extreme with a volatility buffer.'],['TARGET','The opposite CRT boundary or valid external structural target provides at least 2R.']];
   levels=[['CRT HIGH',x?.anchor?.high,'Reference boundary'],['CRT LOW',x?.anchor?.low,'Reference boundary'],['MSS',x?.mss?.level,'Execution structure'],['TARGET',x?.target?.price,'CRT/external objective']];
 } else rows=[['MARKET READ',baseDirection],['ENTRY',setup.entryReason||'Strategy-specific entry condition passed.'],['INVALIDATION',setup.invalidationSource||'Validated structural invalidation.'],['TARGET',fmt(setup.takeProfit1)+' is the validated objective.']];
 return <section className={'trade-breakdown '+(open?'is-open':'')} aria-label="Trade breakdown"><button type="button" className="trade-breakdown-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span><span className="tiny-label">STRATEGY BREAKDOWN</span><strong>Why this {setup?.strategyName||result?.strategy||'setup'} qualifies</strong></span><span className="trade-breakdown-toggle-right"><small>{setup.entryTimeframe||'—'} · {setup.riskReward||'—'}</small><ChevronDown size={14}/></span></button>{open&&<div className="trade-breakdown-body"><div className="trade-breakdown-grid">{rows.map(([label,text])=><div key={label}><b>{label}</b><p>{text}</p></div>)}</div><div className="trade-breakdown-levels">{levels.filter(x=>x[1]!=null).map(([label,value,detail])=><div key={label}><span>{label}</span><b>{fmt(value)}</b><small>{detail}</small></div>)}</div><small className="trade-breakdown-source">Strategy model: {setup?.strategyReason||'Current engine contract'} · source: live Bybit closed candles and quote · {((setup?.analysisTimeframes)||[]).join(' → ')||'strategy-defined context'}.</small></div>}</section>
}function TradeMetric({label,value,tone}){return <div className={`trade-metric ${tone||''}`}><span>{label}</span><b>{value}</b></div>}
function Indicator({label,value,tone}){return <div className={tone||''}><span>{label}</span><b>{value}</b></div>}
function Breakdown({title,value,detail}){return <div className="breakdown-item"><span>{title}</span><b>{value}</b><small>{detail}</small></div>}
