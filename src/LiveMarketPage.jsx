import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,RefreshCw,ScanSearch,TrendingDown,TrendingUp,Clock} from 'lucide-react';
import {auth} from './firebase.js';
import {MarketWatchlist, StrategySelector, StrategyExplanation} from './MarketExtras.jsx';
import './market-extras.css';
export const TIMEFRAMES=['AUTO','15m','30m','1H','2H','4H'];
const TIMEFRAME_GUIDE={
 'AUTO':{title:'AUTO execution horizon',desc:'Evaluates 15M, 30M, 1H, 2H and 4H for the cleanest valid execution structure. No timeframe is forced.'},
 '15m':{title:'15M opportunity horizon',desc:'Hunts intraday opportunities with the selected strategy. Higher context is handled automatically when that strategy needs it.'},
 '30m':{title:'30M opportunity horizon',desc:'Hunts more developed intraday opportunities. Strategy rules determine the supporting context and confirmation.'},
 '1H':{title:'1H opportunity horizon',desc:'Uses a broader intraday structure to find fewer, more developed opportunities.'},
 '2H':{title:'2H opportunity horizon',desc:'Uses a higher swing structure for larger setups while keeping the selected strategy in control.'},
 '4H':{title:'4H opportunity horizon',desc:'Looks for larger swing opportunities using higher-timeframe structure and the selected strategy rules.'}
};
const instrumentCache=new Map();
const instrumentRequests=new Map();
function symbolFor(pair){return pair.replace('/','');}
function price(v){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}
async function waitForAuthUser(timeoutMs=5000){if(auth?.currentUser)return auth.currentUser;return new Promise(resolve=>{let done=false;let unsubscribe=null;const finish=u=>{if(done)return;done=true;clearTimeout(timer);unsubscribe?.();resolve(u||null)};unsubscribe=auth?.onAuthStateChanged(finish)||null;const timer=setTimeout(()=>finish(auth?.currentUser||null),timeoutMs)})}
async function authToken(forceRefresh=false){const user=await waitForAuthUser();if(!user)return '';return user.getIdToken(forceRefresh)}
async function persistSignal(body){const user=await waitForAuthUser(2500),setup=body?.setup;if(!user||!setup?.tradeReady||!['MARKET','LIMIT'].includes(String(setup.orderType||'').toUpperCase())||!['LONG','SHORT'].includes(String(setup.bias||'').toUpperCase())||![setup.entry,setup.stopLoss,setup.takeProfit1].every(v=>Number.isFinite(Number(v))))return null;try{const token=await user.getIdToken();const response=await fetch('/api/signals',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({market:body.market,symbol:body.symbol,timeframe:body.timeframe,strategy:body.strategy||body.setup?.strategy||body.setup?.strategyName||'',setup:body.setup,aligned:body.aligned,totalTimeframes:body.totalTimeframes,confluence:body.confluence})});if(!response.ok)return null;const result=await response.json();window.dispatchEvent(new CustomEvent('kitagent-signal-recorded',{detail:result.signal}));return result;}catch(error){console.warn('KitSetups signal history sync failed:',error);return null;}}
export default function LiveMarketPage(){const market='perpetual';const [pair,setPair]=useState(''),[timeframe,setTimeframe]=useState('AUTO'),[strategy,setStrategy]=useState('TOP_DOWN'),[loading,setLoading]=useState(false),[sourceLoading,setSourceLoading]=useState(true),[error,setError]=useState(''),[result,setResult]=useState(()=>{try{const raw=localStorage.getItem('kitagent:last-market-setup:v3');return raw?JSON.parse(raw):null}catch{return null}}),[savedSignal,setSavedSignal]=useState(null),[instrumentQuery,setInstrumentQuery]=useState(''),[instruments,setInstruments]=useState([]),[pickerOpen,setPickerOpen]=useState(false);

 useEffect(()=>{if(!TIMEFRAMES.includes(timeframe))setTimeframe('AUTO')},[timeframe]);

 useEffect(()=>{if(result?.market==='perpetual'&&result?.symbol){setPair(result.symbol.includes('/')?result.symbol:result.symbol.replace(/USDT$/,'/USDT'));setTimeframe(TIMEFRAMES.includes(result.timeframe)?result.timeframe:'AUTO');setStrategy(result.strategy||result.setup?.strategy||'TOP_DOWN')}},[]);

 useEffect(()=>{let cancelled=false;setError('');setInstrumentQuery('');setPickerOpen(false);const cached=instrumentCache.get(market);if(cached?.length){setInstruments(cached);setPair(p=>p&&cached.some(x=>x.symbol===p)?p:cached[0]?.symbol||'');setSourceLoading(false);return()=>{cancelled=true}}setSourceLoading(true);let request=instrumentRequests.get(market);if(!request){request=(async()=>{const token=await authToken();const requestOptions={headers:token?{Authorization:'Bearer '+token}: {},cache:'no-store'};let r=await fetch('/api/market?action=instruments&market='+encodeURIComponent(market),requestOptions);let body=await r.json().catch(()=>({}));if((r.status===401||r.status===403)){const freshToken=await authToken(true);if(freshToken){r=await fetch('/api/market?action=instruments&market='+encodeURIComponent(market),{headers:{Authorization:'Bearer '+freshToken},cache:'no-store'});body=await r.json().catch(()=>({}));}}if(!r.ok){throw new Error(body?.error||'Live market instruments are temporarily unavailable. Please retry.');}if(!Array.isArray(body?.instruments)||!body.instruments.length)throw new Error('No Crypto perpetual instruments are currently available. Please retry.');const live=body.instruments.map(x=>({symbol:x.symbol,name:x.name||''}));instrumentCache.set(market,live);return live})().finally(()=>instrumentRequests.delete(market));instrumentRequests.set(market,request)}request.then(live=>{if(cancelled)return;setInstruments(live);setPair(p=>p&&live.some(x=>x.symbol===p)?p:live[0]?.symbol||'');}).catch(e=>{if(!cancelled){setInstruments([]);setPair('');setError(e?.message||'Unable to load live instruments from the market-data source. Please retry.')}}).finally(()=>{if(!cancelled)setSourceLoading(false)});return()=>{cancelled=true}},[market]);

 const filteredPairs=useMemo(()=>{const q=instrumentQuery.trim().toUpperCase();return q?instruments.filter(x=>`${x.symbol} ${x.name||''}`.toUpperCase().includes(q)):instruments},[instruments,instrumentQuery]);
 const customCryptoSymbol=useMemo(()=>{const raw=instrumentQuery.trim().toUpperCase().replace(/\s+/g,'');if(!raw)return '';const base=raw.replace(/\/USDT$/,'').replace(/USDT$/,'');if(!/^[A-Z0-9]+$/.test(base))return '';const candidate=`${base}/USDT`;return instruments.some(x=>x.symbol===candidate)?'':candidate},[instrumentQuery,instruments]);

 const analyze=async()=>{if(!pair)return;setLoading(true);setError('');try{const endpoint='/api/market';const token=await authToken();if(!token)throw new Error('Authentication is still initializing. Please retry.');const r=await fetch(`${endpoint}?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbolFor(pair))}&timeframe=${encodeURIComponent(timeframe)}&strategy=${encodeURIComponent(strategy)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok){if(r.status===401)throw new Error('Your session is still initializing. Please retry.');if(r.status===403){window.dispatchEvent(new CustomEvent('kitagent-open-profile'));throw new Error(body.error||'Your trial or Premium access has expired')}throw new Error(body.error||`Market analysis failed (${r.status})`);}setResult(body);try{localStorage.setItem('kitagent:last-market-setup:v3',JSON.stringify(body));}catch{}window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:body}));persistSignal(body).then(saved=>{if(saved?.signal)setSavedSignal(saved.signal)});}catch(e){setError(e.message||'Unable to read market data right now.')}finally{setLoading(false)}};

 return (
    <div className="live-market page-wrap">
      <div className="live-market-head">
        <div>
          <span className="tiny-label">INTELLIGENCE LAYER</span>
          <h2>Market analysis</h2>
          <p>Live market data, multi-timeframe structure and a strategy-specific setup engine.</p>
        </div>
        <span className="live-readonly"><ScanSearch size={13}/> READ ONLY</span>
      </div>

      <MarketWatchlist market={market} symbol={pair} onSelect={(next)=>setPair(next)}/>

      <section className="live-market-card">
        <div className="live-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" className="active">CRYPTO PERPETUALS</button></div>

        <div className="live-controls">
          <label className="live-field market-picker">
            <span>PERPETUAL</span>
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
            <span>EXECUTION TIMEFRAME</span>
            <div>
              <select value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{TIMEFRAMES.map(x=><option key={x} value={x}>{x}</option>)}</select>
              <ChevronDown/>
            </div>
          </label>

          <StrategySelector value={strategy} onChange={setStrategy}/>

          <button type="button" className="live-analyze" onClick={analyze} disabled={loading||sourceLoading||!pair}>
            {loading?<><RefreshCw className="spin"/> Reading market</>:sourceLoading?<><RefreshCw className="spin"/> Loading source</>:<><BarChart3/> Analyze pair</>}
          </button>
        </div>

        {error&&<div className="live-error">{error}<button type="button" onClick={analyze}>Retry</button></div>}
        {!result&&!loading&&!error&&
          <div className="live-empty">
            <ScanSearch/>
            <b>Ready to analyze {pair||'a supported market instrument'}</b>
            <span>The selected strategy will be tested against fresh candles, top-down structure and its own entry, invalidation and target rules.</span>
          </div>
        }
        {loading&&
          <div className="live-loading">
            <span className="loading-orb"/>
            <b>{TIMEFRAME_GUIDE[timeframe]?.title||'Reading market structure'}</b>
            <small>{TIMEFRAME_GUIDE[timeframe]?.desc||'Building the top-down market read.'}</small>
          </div>
        }
        {result&&
          <>
            <AnalysisResult result={result} savedSignal={savedSignal}/>
            <StrategyExplanation setup={result.setup} strategy={result.strategy||strategy}/>
          </>
        }
      </section>
    </div>
  );
}
function strategyWaitCopy(strategy){return ({TOP_DOWN:'Waiting for higher-timeframe structure and a confirmed execution condition.',PULLBACK:'Waiting for a fresh pullback into a qualified FVG or order block.',BREAKOUT:'Waiting for a decisive break, a retest of the broken level, and confirmed continuation.',SMC:'Waiting for a liquidity sweep, displacement and structure break at a valid point of interest.',MSNR:'Waiting for price to tap a fresh MSNR level and confirm the reaction on the lower timeframe.',PRICE_ACTION:'Waiting for a clean structural level with a confirmed rejection or engulfing candle.',LIQUIDITY_REVERSAL:'Waiting for a liquidity sweep, reclaim and displacement before reversal entry.',CRT:'Waiting for a completed candle range to be swept and reclaimed before targeting the opposite side.'}[strategy]||'No valid entry condition is present yet.');}
function AnalysisResult({result,savedSignal}){
  const s=result.setup||{};
  const hasTrade=Boolean(s.tradeReady&&['LONG','SHORT'].includes(String(s.bias||'').toUpperCase())&&['MARKET','LIMIT'].includes(String(s.orderType||'').toUpperCase())&&[s.entry,s.stopLoss,s.takeProfit1].every(v=>Number.isFinite(Number(v))));
  const long=hasTrade&&s.bias==='LONG',short=hasTrade&&s.bias==='SHORT',wait=!hasTrade,Icon=long?TrendingUp:short?TrendingDown:Clock;
  const stopDistanceLabel=s.stopDistanceUnits!=null ? String(s.stopDistanceUnits)+' '+(s.priceUnitLabel==='pips'?'pips':'pts') : '—';
  const direction=long?'LONG':short?'SHORT':'NO TRADE',tone=wait?'wait':(long?'long':'short');
  return <div className="live-result">
    <div className={'setup-card-v2 '+tone}>
      <div className="setup-v2-head">
        <div className="setup-v2-symbol"><span><b>STRATEGY</b> · {s.strategyName||result.strategy||'Top-Down'} · EXECUTION {s.entryTimeframe||result.timeframe}</span><h3>{result.symbol.includes('/')?result.symbol:result.symbol.replace(/USDT$/,'/USDT')}</h3></div>
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

  return <section className="risk-calculator" aria-label="Risk calculator">
    <div className="risk-calc-head">
      <div>
        <span className="risk-kicker">POSITION MANAGEMENT</span>
        <h3>Risk calculator</h3>
        <p>{validTrade?'Size this generated setup before entering the trade.':'Set up a position manually, or generate a qualified setup to auto-fill these prices.'}</p>
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
      <button type="button" onClick={calculate}>Calculate position</button>
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

    <p className="risk-disclaimer">Estimated liquidation uses a simplified isolated-margin formula. Actual liquidation varies by exchange maintenance margin, fees and position mode.</p>
  </section>;
}
function TradeMetric({label,value,tone}){return <div className={`trade-metric ${tone||''}`}><span>{label}</span><b>{value}</b></div>}
function Indicator({label,value,tone}){return <div className={tone||''}><span>{label}</span><b>{value}</b></div>}
function Breakdown({title,value,detail}){return <div className="breakdown-item"><span>{title}</span><b>{value}</b><small>{detail}</small></div>}
