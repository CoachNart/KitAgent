import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,RefreshCw,ScanSearch,TrendingDown,TrendingUp,Clock} from 'lucide-react';
import {auth} from './firebase.js';
import {MarketWatchlist, StrategySelector, StrategyExplanation} from './MarketExtras.jsx';
import './market-extras.css';
export const FOREX=['AUDCAD','AUDCHF','AUDJPY','AUDNZD','AUDUSD','CADCHF','CADJPY','CHFJPY','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDCHF','NZDJPY','NZDUSD','USDCAD','USDCHF','USDJPY','USDNOK','USDSEK','USDZAR','USDSGD','EURPLN','EURSEK','EURNOK','EURTRY','GBPPLN','GBPSEK','GBPNOK','NOKSEK','NZDSGD','SGDJPY','CHFSGD','CADSGD','AUDSGD','AUDNOK','AUDSEK','CADNOK','CADSEK','CHFPLN','CHFZAR','EURSGD','GBPZAR','NZDZAR','USDHKD','USDMXN','USDTRY','USDTHB','USDHUF','USDCNH'];
export const METALS=['XAUUSD','XAGUSD','US30','US500','NAS100','UK100','GER40','FRA40','JP225','HK50','USOIL','UKOIL'];
export const CRYPTO=['BTC/USDT','ETH/USDT','SOL/USDT','XRP/USDT','BNB/USDT','DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','DOT/USDT','TRX/USDT','TON/USDT','SHIB/USDT','LTC/USDT','BCH/USDT','NEAR/USDT','UNI/USDT','AAVE/USDT','ATOM/USDT','ETC/USDT','XLM/USDT','FIL/USDT','HBAR/USDT','APT/USDT','ARB/USDT','OP/USDT','SUI/USDT','INJ/USDT','SEI/USDT','TIA/USDT','PEPE/USDT','WIF/USDT','FLOKI/USDT','JUP/USDT','ENA/USDT','MKR/USDT','RUNE/USDT','ALGO/USDT','VET/USDT','ICP/USDT','EGLD/USDT','SAND/USDT','MANA/USDT','AXS/USDT','GALA/USDT','IMX/USDT','STX/USDT','CRV/USDT','LDO/USDT','SNX/USDT','COMP/USDT','MATIC/USDT','APE/USDT','DYDX/USDT','ORDI/USDT','PYTH/USDT','JTO/USDT','ONDO/USDT','TAO/USDT','FET/USDT'];
export const TIMEFRAMES=['1m','5m','15m','30m','1H','4H','1D','1W'];
const TIMEFRAME_GUIDE={
 '1m':{title:'1M opportunity horizon',desc:'Hunts very short-term opportunities. The selected strategy decides how 1M structure is interpreted and what context it needs.'},
 '5m':{title:'5M opportunity horizon',desc:'Hunts short-term opportunities. The selected strategy owns the analysis and can pull higher-timeframe context when required.'},
 '15m':{title:'15M opportunity horizon',desc:'Hunts intraday opportunities with the selected strategy. Higher context is handled automatically when that strategy needs it.'},
 '30m':{title:'30M opportunity horizon',desc:'Hunts more developed intraday opportunities. Strategy rules determine the supporting context and confirmation.'},
 '1H':{title:'1H opportunity horizon',desc:'Hunts larger intraday opportunities. The selected strategy determines the structure, confirmation and entry logic.'},
 '4H':{title:'4H opportunity horizon',desc:'Hunts swing opportunities. The selected strategy automatically chooses any higher context it needs.'},
 '1D':{title:'1D opportunity horizon',desc:'Hunts multi-day opportunities. Strategy rules remain in control while higher context is handled automatically.'},
 '1W':{title:'1W opportunity horizon',desc:'Hunts longer-term opportunities. The selected strategy decides what constitutes a valid setup.'}
};
const MARKET_TABS=[['forex','Forex'],['metals','Metal / CFD'],['perpetual','Crypto']];
const CFD_CATEGORIES={XAUUSD:'Metals',XAGUSD:'Metals',USOIL:'Oil',UKOIL:'Oil',US30:'Indices',US500:'Indices',NAS100:'Indices',UK100:'Indices',GER40:'Indices',FRA40:'Indices',JP225:'Indices',HK50:'Indices'};
function symbolFor(market,pair){return market==='forex'||market==='metals'?pair:pair.replace('/','');}
function price(v){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}
async function persistSignal(body){const user=auth?.currentUser;if(!user||!body?.setup)return null;try{const token=await user.getIdToken();const response=await fetch('/api/signals',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({market:body.market,symbol:body.symbol,timeframe:body.timeframe,setup:body.setup,aligned:body.aligned,totalTimeframes:body.totalTimeframes,confluence:body.confluence})});if(!response.ok)return null;return await response.json();}catch(error){console.warn('KitSetups signal history sync failed:',error);return null;}}
export default function LiveMarketPage(){const [market,setMarket]=useState('forex'),[pair,setPair]=useState(FOREX[0]),[timeframe,setTimeframe]=useState('1H'),[strategy,setStrategy]=useState('TOP_DOWN'),[loading,setLoading]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[savedSignal,setSavedSignal]=useState(null),[instrumentQuery,setInstrumentQuery]=useState(''),[instruments,setInstruments]=useState(FOREX.map(symbol=>({symbol}))),[pickerOpen,setPickerOpen]=useState(false);

 const localInstruments=(m)=>m==='forex'?FOREX.map(symbol=>({symbol})):m==='perpetual'?CRYPTO.map(symbol=>({symbol})) :METALS.map(symbol=>({symbol}));

 useEffect(()=>{try{const raw=localStorage.getItem('kitagent:last-market-setup');if(!raw)return;const cached=JSON.parse(raw);if(cached?.ok&&cached?.setup){setResult(cached);window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:cached}));}}catch{}},[]);

 useEffect(()=>{let cancelled=false;setError('');setInstrumentQuery('');setPickerOpen(false);const next=localInstruments(market);setInstruments(next);setPair(next[0]?.symbol||'');(async()=>{try{const token=auth?.currentUser?await auth.currentUser.getIdToken():'';const r=await fetch('/api/market?action=instruments&market='+encodeURIComponent(market),{headers:token?{Authorization:'Bearer '+token}:{},cache:'no-store'});const body=await r.json().catch(()=>({}));if(cancelled||!r.ok||!Array.isArray(body?.instruments)||!body.instruments.length)return;const live=body.instruments.map(x=>({symbol:x.symbol,name:x.name||''}));setInstruments(live);setPair(p=>live.some(x=>x.symbol===p)?p:(live[0]?.symbol||''));}catch{} })();return()=>{cancelled=true}},[market]);

 const filteredPairs=useMemo(()=>{const q=instrumentQuery.trim().toUpperCase();return q?instruments.filter(x=>`${x.symbol} ${x.name||''}`.toUpperCase().includes(q)):instruments},[instruments,instrumentQuery]);

 const analyze=async()=>{if(!pair)return;setLoading(true);setError('');try{const endpoint='/api/market';const token=auth?.currentUser?await auth.currentUser.getIdToken(true):'';const r=await fetch(`${endpoint}?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbolFor(market,pair))}&timeframe=${encodeURIComponent(timeframe)}&strategy=${encodeURIComponent(strategy)}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok){if(r.status===401)throw new Error('Your session has expired. Please sign in again.');if(r.status===403){window.dispatchEvent(new CustomEvent('kitagent-open-profile'));throw new Error(body.error||'Your trial or Premium access has expired')}throw new Error(body.error||`Market analysis failed (${r.status})`);}setResult(body);try{localStorage.setItem('kitagent:last-market-setup',JSON.stringify(body));}catch{}window.dispatchEvent(new CustomEvent('kitagent-market-setup',{detail:body}));const saved=await persistSignal(body);if(saved?.signal)setSavedSignal(saved.signal)}catch(e){setError(e.message||'Unable to read market data right now.')}finally{setLoading(false)}};

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
        <div className="live-tabs" role="tablist">
          {MARKET_TABS.map(([id,label])=>
            <button key={id} type="button" role="tab" aria-selected={market===id} className={market===id?'active':''} onClick={()=>setMarket(id)}>{label}</button>
          )}
        </div>

        <div className="live-controls">
          <label className="live-field market-picker">
            <span>{market==='metals'?'METAL / CFD':'MARKET'}</span>
            <div className="instrument-picker">
              <button type="button" className="instrument-trigger" onClick={()=>setPickerOpen(v=>!v)} aria-expanded={pickerOpen}>
                <b>{pair||'Select pair'}</b><ChevronDown className={pickerOpen?'open':''}/>
              </button>
              {pickerOpen&&
                <div className="instrument-menu">
                  <div className="instrument-search">
                    <ScanSearch/>
                    <input autoFocus value={instrumentQuery} onChange={e=>setInstrumentQuery(e.target.value)} placeholder={market==='metals'?'Search assets…':'Search pairs…'} aria-label="Search market pairs"/>
                  </div>
                  <div className="instrument-results">
                    {filteredPairs.map(x=>
                      <button type="button" key={x.symbol} className={pair===x.symbol?'selected':''} onClick={()=>{setPair(x.symbol);setInstrumentQuery('');setPickerOpen(false)}}>
                        <b>{x.symbol}</b><small>{market==='metals'?CFD_CATEGORIES[x.symbol]||'CFD':''}</small>
                      </button>
                    )}
                    {!filteredPairs.length&&<small className="instrument-empty">No matching pairs found.</small>}
                  </div>
                </div>
              }
            </div>
          </label>

          <label className="live-field timeframe">
            <span>TIMEFRAME</span>
            <div>
              <select value={timeframe} onChange={e=>setTimeframe(e.target.value)}>{TIMEFRAMES.map(x=><option key={x}>{x}</option>)}</select>
              <ChevronDown/>
            </div>
          </label>

          <StrategySelector value={strategy} onChange={setStrategy}/>

          <button type="button" className="live-analyze" onClick={analyze} disabled={loading||!pair}>
            {loading?<><RefreshCw className="spin"/> Reading market</>:<><BarChart3/> Analyze pair</>}
          </button>
        </div>

        {error&&<div className="live-error">{error}<button type="button" onClick={analyze}>Retry</button></div>}
        {!result&&!loading&&!error&&
          <div className="live-empty">
            <ScanSearch/>
            <b>Ready to analyze {pair||'a supported metal or CFD instrument'}</b>
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
function strategyWaitCopy(strategy){return ({TOP_DOWN:'Waiting for higher-timeframe structure and a confirmed execution condition.',PULLBACK:'Waiting for a fresh pullback into a qualified FVG or order block.',BREAKOUT:'Waiting for a decisive break and close beyond structure with displacement.',SMC:'Waiting for a liquidity sweep, displacement and structure break at a valid point of interest.',MSNR:'Waiting for price to tap a fresh MSNR level and confirm the reaction on the lower timeframe.',PRICE_ACTION:'Waiting for a clean structural level with a confirmed rejection or engulfing candle.',LIQUIDITY_REVERSAL:'Waiting for a liquidity sweep, reclaim and displacement before reversal entry.',CRT:'Waiting for a completed candle range to be swept and reclaimed before targeting the opposite side.'}[strategy]||'No valid entry condition is present yet.');}
function AnalysisResult({result,savedSignal}){
  const s=result.setup,long=s.directionBias==='LONG',short=s.directionBias==='SHORT',wait=!s.tradeReady,Icon=long?TrendingUp:short?TrendingDown:Clock;
  const stopDistanceLabel=s.stopDistanceUnits!=null ? String(s.stopDistanceUnits)+' '+(s.priceUnitLabel==='pips'?'pips':'pts') : '—';
  const direction=long?'LONG':short?'SHORT':'NO SETUP',tone=wait?'wait':(long?'long':short?'short':'wait');
  return <div className="live-result">
    <div className={'setup-card-v2 '+tone}>
      <div className="setup-v2-head">
        <div className="setup-v2-symbol"><span><b>STRATEGY</b> · {s.strategyName||result.strategy||'Top-Down'} · {result.timeframe}</span><h3>{result.market==='forex'||result.market==='metals'?result.symbol:result.symbol.replace('USDT','/USDT')}</h3></div>
        <div className="setup-v2-bias"><Icon size={15}/><b>{direction}</b></div>
        <div className="setup-v2-confidence"><b>{s.confidence}%</b><span>CONFIDENCE</span></div>
      </div>
      {wait ? <div className="strategy-status-card"><span>NO SETUP</span><b>{strategyWaitCopy(result.strategy||'TOP_DOWN')}</b></div> : <>
        <div className="strategy-trade-status"><span>{s.orderType==='LIMIT'?'LIMIT ORDER':'MARKET ORDER'}</span><b>{s.orderType==='LIMIT'?'WAITING AT PLANNED LEVEL':'EXECUTION AVAILABLE NOW'}</b></div>
        <div className="setup-v2-levels">
          <div className="v2-level entry"><span>{s.orderType==='LIMIT'?'LIMIT ENTRY':'ENTRY'}</span><b>{price(s.entry)}</b>{s.orderType==='LIMIT'&&<small>Current {price(s.marketEntry)}</small>}</div>
          <div className="v2-level stop"><span>STOP</span><b>{price(s.stopLoss)}</b>{s.structuralInvalidation!=null&&<small>Invalidation {price(s.structuralInvalidation)} · {stopDistanceLabel} risk</small>}</div>
          <div className="v2-level tp"><span>TP 1</span><b>{price(s.takeProfit1)}</b></div>
          <div className="v2-level tp"><span>TP 2</span><b>{price(s.takeProfit2)}</b></div>
        </div>
        <div className="strategy-trade-footer"><span>RR {s.riskReward}</span><span>{s.liquidityType||'STRUCTURAL TARGET'}</span></div>
      </>}
    </div>
  </div>
}

function TradeMetric({label,value,tone}){return <div className={`trade-metric ${tone||''}`}><span>{label}</span><b>{value}</b></div>}
function Indicator({label,value,tone}){return <div className={tone||''}><span>{label}</span><b>{value}</b></div>}
function Breakdown({title,value,detail}){return <div className="breakdown-item"><span>{title}</span><b>{value}</b><small>{detail}</small></div>}


