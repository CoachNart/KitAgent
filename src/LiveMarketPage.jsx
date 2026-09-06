import {useEffect,useMemo,useState} from 'react';
import {BarChart3,ChevronDown,RefreshCw,ScanSearch,ShieldCheck,TrendingDown,TrendingUp} from 'lucide-react';

const FOREX=['AUDCAD','AUDCHF','AUDJPY','AUDNZD','AUDUSD','CADCHF','CADJPY','CHFJPY','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDCHF','NZDJPY','NZDUSD','USDCAD','USDCHF','USDJPY','USDNOK','USDSEK','USDZAR','USDSGD','EURPLN','EURSEK','EURNOK','EURPLN','EURTRY','GBPPLN','GBPSEK','GBPNOK','NOKSEK','NZDSGD','SGDJPY','CHFSGD','CADSGD','AUDSGD','AUDNOK','AUDSEK','CADNOK','CADSEK','CHFPLN','CHFZAR','EURSGD','GBPZAR','NZDZAR','USDHKD','USDMXN','USDTRY','USDTHB','USDHUF','USDCNH'];
const CRYPTO=['BTC/USDT','ETH/USDT','SOL/USDT','XRP/USDT','BNB/USDT','DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','DOT/USDT','TRX/USDT','TON/USDT','SHIB/USDT','LTC/USDT','BCH/USDT','NEAR/USDT','UNI/USDT','AAVE/USDT','ATOM/USDT','ETC/USDT','XLM/USDT','FIL/USDT','HBAR/USDT','APT/USDT','ARB/USDT','OP/USDT','SUI/USDT','INJ/USDT','SEI/USDT','TIA/USDT','PEPE/USDT','WIF/USDT','FLOKI/USDT','JUP/USDT','ENA/USDT','MKR/USDT','RUNE/USDT','ALGO/USDT','VET/USDT','ICP/USDT','EGLD/USDT','SAND/USDT','MANA/USDT','AXS/USDT','GALA/USDT','IMX/USDT','STX/USDT','CRV/USDT','LDO/USDT','SNX/USDT','COMP/USDT','MATIC/USDT','APE/USDT','DYDX/USDT','ORDI/USDT','PYTH/USDT','JTO/USDT','ONDO/USDT','TAO/USDT','FET/USDT'];
const TIMEFRAMES=['15m','30m','1H','4H','1D','1W'];
const MARKET_TABS=[['forex','Forex'],['crypto','Crypto'],['perpetual','Perpetual']];

function symbolFor(market,pair){return market==='forex'?pair:pair.replace('/','');}
function price(v){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}

export default function LiveMarketPage(){
 const [market,setMarket]=useState('forex');
 const [pair,setPair]=useState(FOREX[0]);
 const [timeframe,setTimeframe]=useState('1H');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState(null);
 const pairs=useMemo(()=>market==='forex'?FOREX:CRYPTO,[market]);
 useEffect(()=>{setPair(pairs[0]);setResult(null);setError('')},[market,pairs]);
 const analyze=async()=>{setLoading(true);setError('');setResult(null);try{const r=await fetch(`/api/market?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbolFor(market,pair))}&timeframe=${encodeURIComponent(timeframe)}`);const body=await r.json();if(!r.ok||!body.ok)throw new Error(body.error||'Market analysis failed');setResult(body)}catch(e){setError(e.message||'Unable to read market data right now.')}finally{setLoading(false)}};
 const setup=result?.setup;
 const bias=setup?.bias||'WAIT';
 return <div className="live-market page-wrap">
   <div className="live-market-head"><div><span className="tiny-label">INTELLIGENCE LAYER</span><h2>Market analysis</h2><p>Live market data, multi-timeframe confluence and a read-only setup engine.</p></div><span className="live-readonly"><ScanSearch size={13}/> READ ONLY</span></div>
   <section className="live-market-card">
     <div className="live-tabs" role="tablist">{MARKET_TABS.map(([id,label])=><button key={id} className={market===id?'active':''} onClick={()=>setMarket(id)}>{label}</button>)}</div>
     <div className="live-controls">
       <label className="live-field"><span>MARKET</span><div><select value={pair} onChange={e=>{setPair(e.target.value);setResult(null)}}>{pairs.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></div></label>
       <label className="live-field timeframe"><span>TIMEFRAME</span><div><select value={timeframe} onChange={e=>{setTimeframe(e.target.value);setResult(null)}}>{TIMEFRAMES.map(x=><option key={x}>{x}</option>)}</select><ChevronDown/></div></label>
       <button className="live-analyze" onClick={analyze} disabled={loading}>{loading?<><RefreshCw className="spin"/> Reading market</>:<><BarChart3/> Analyze pair</>}</button>
     </div>
     {error&&<div className="live-error">{error}<button onClick={analyze}>Retry</button></div>}
     {!result&&!loading&&!error&&<div className="live-empty"><ScanSearch/><b>Ready to analyze {pair}</b><span>The engine will fetch fresh candles and calculate trend, RSI, EMA, ATR, structure and multi-timeframe confluence.</span></div>}
     {loading&&<div className="live-loading"><span className="loading-orb"/><b>Reading live market data</b><small>Calculating setup across {timeframe}, 1H, 4H and 1D.</small></div>}
     {result&&<AnalysisResult result={result}/>} 
   </section>
 </div>
}

function AnalysisResult({result}){const s=result.setup;const long=s.bias==='LONG',short=s.bias==='SHORT',wait=s.bias==='WAIT';const Icon=long?TrendingUp:TrendingDown;return <div className="live-result">
 <div className="result-hero"><div className={`bias-pill ${long?'long':short?'short':'wait'}`}>{!wait&&<Icon/>}{s.bias}</div><div className="result-symbol"><span>{result.market==='forex'?'FOREX SPOT':result.market==='perpetual'?'CRYPTO PERPETUAL':'CRYPTO SPOT'} · PRIMARY {result.timeframe}</span><h3>{result.market==='forex'?result.symbol:result.symbol.replace('USDT','/USDT')}</h3><b>{s.confidence}% <small>CONFIDENCE</small></b></div><button className="refresh-result" title="Run again" onClick={()=>window.dispatchEvent(new CustomEvent('kitagent-reanalyze'))}><RefreshCw size={15}/></button></div>
 <div className="confluence"><div><span>TIMEFRAME CONFLUENCE</span><b>{result.aligned}/{result.totalTimeframes} timeframes aligned</b></div><div className="confluence-bars">{result.confluence.map(x=><i key={x.timeframe} className={x.bias===s.bias&&s.bias!=='WAIT'?'aligned':''} title={`${x.timeframe}: ${x.bias}`}/>)}</div></div>
 <div className="trade-grid"><TradeMetric label="ENTRY" value={price(s.entry)}/><TradeMetric label="STOP LOSS" value={price(s.stopLoss)} danger/><TradeMetric label="TAKE PROFIT 1 · 1:1.5" value={price(s.takeProfit1)}/><TradeMetric label="TAKE PROFIT 2 · 1:2.5" value={price(s.takeProfit2)}/><TradeMetric label="RISK / REWARD" value={s.riskReward}/><TradeMetric label="RSI · 14" value={s.rsi}/></div>
 <div className="indicator-grid"><Indicator label="PRICE" value={price(s.price)}/><Indicator label="EMA 20" value={price(s.ema20)}/><Indicator label="EMA 50" value={price(s.ema50)}/><Indicator label="ATR 14" value={price(s.atr)}/></div>
 <div className={`setup-state ${wait?'caution':''}`}><ShieldCheck size={16}/><div><b>{wait?'SETUP NOT CONFIRMED':'SETUP READY'}</b><span>{wait?'Higher-timeframe confirmation is mixed. No directional setup is issued.':'Directional conditions and confluence meet the current engine threshold. Analysis is read-only; execution remains permission-gated.'}</span></div></div>
 </div>}
function TradeMetric({label,value,danger}){return <div className="trade-metric"><span>{label}</span><b className={danger?'danger':''}>{value}</b></div>}
function Indicator({label,value}){return <div><span>{label}</span><b>{value}</b></div>}
