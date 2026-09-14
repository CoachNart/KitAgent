import { authenticate, requireActiveAccess } from '../server/access.js';
const TIMEFRAME_MAP={'1m':{forex:'5m',crypto:'1m'},'5m':{forex:'5m',crypto:'5m'},'15m':{forex:'15m',crypto:'15m'},'30m':{forex:'30m',crypto:'30m'},'1H':{forex:'1h',crypto:'1h'},'4H':{forex:'4h',crypto:'4h'},'1D':{forex:'1d',crypto:'1d'},'1W':{forex:'1wk',crypto:'1w'}};
const CONFLUENCE=['1H','4H','1D'];const allowedIntervals=new Set(['1m','5m','15m','30m','4H','1H','1D','1W']);
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(payload))}
function sma(v,n){if(v.length<n)return null;return v.slice(-n).reduce((a,b)=>a+b,0)/n}
function ema(v,n){if(v.length<n)return null;let e=sma(v.slice(0,n),n),k=2/(n+1);for(let i=n;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v,n=14){if(v.length<n+1)return 50;let g=0,l=0;for(let i=1;i<=n;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}let ag=g/n,al=l/n;for(let i=n+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n}if(al===0)return 100;return 100-100/(1+ag/al)}
function atr(c,n=14){if(c.length<n+1)return null;const t=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1];t.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)))}return sma(t.slice(-n),n)}
function roundPrice(v){if(v==null||!Number.isFinite(Number(v)))return null;v=Number(v);if(v>=1000)return Number(v.toFixed(2));if(v>=100)return Number(v.toFixed(3));if(v>=1)return Number(v.toFixed(5));if(v>=.1)return Number(v.toFixed(6));return Number(v.toPrecision(7))}
function normalize(rows){return rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite))}
function aggregateFourHour(c){const g=new Map(),b=14400000;for(const x of c){const k=Math.floor(x.time/b)*b;if(!g.has(k))g.set(k,[]);g.get(k).push(x)}return [...g].sort((a,b)=>a[0]-b[0]).map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a.at(-1).close,volume:a.reduce((s,x)=>s+x.volume,0)}))}
async function fetchYahoo(symbol,interval){const ri=interval==='4h'?'1h':interval,range=['5m','15m','30m'].includes(ri)?'7d':ri==='1h'?'3mo':ri==='1d'?'1y':'5y';let err='Forex data provider unavailable';for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com'])try{const r=await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${ri}&events=div%2Csplits`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});if(!r.ok){err=`Forex data provider returned ${r.status}`;continue}const body=await r.json(),q=body?.chart?.result?.[0]?.indicators?.quote?.[0],rows=(body?.chart?.result?.[0]?.timestamp||[]).map((t,i)=>[t*1000,q?.open?.[i],q?.high?.[i],q?.low?.[i],q?.close?.[i],q?.volume?.[i]||0]).filter(x=>x[4]!=null),c=normalize(rows);if(c.length<60){err='Forex provider returned insufficient candles';continue}return interval==='4h'?aggregateFourHour(c):c}catch(e){err=e?.message||err}throw new Error(err)}
async function fetchBinance(symbol,interval,perpetual){const endpoints=perpetual?['https://fapi.binance.com/fapi/v1/klines','https://fstream.binance.com/fapi/v1/klines','https://www.binance.com/fapi/v1/klines']:['https://data-api.binance.vision/api/v3/klines','https://api.binance.com/api/v3/klines'];let err='Crypto data provider unavailable';for(const base of endpoints)try{const r=await fetch(`${base}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok){err=`Binance returned ${r.status}`;continue}const rows=await r.json();if(!Array.isArray(rows)||!rows.length){err='Binance returned no candles';continue}return normalize(rows)}catch(e){err=e?.message||err}throw new Error(err)}
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
async function fetchBybit(symbol,timeframe){const r=await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${BYBIT_INTERVAL[timeframe]}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Bybit returned ${r.status}`);const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)throw new Error(body?.retMsg||'Bybit returned no perpetual candles');return normalize(body.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function candlesFor(market,symbol,timeframe){const mapped=TIMEFRAME_MAP[timeframe]?.[market==='forex'?'forex':'crypto'];if(!mapped)throw new Error('Unsupported timeframe');if(market==='forex')return fetchYahoo(`${symbol}=X`,mapped);const clean=symbol.replace(/[^A-Z0-9]/gi,'');if(market==='perpetual'){try{return await fetchBinance(clean,mapped,true)}catch(a){try{return await fetchBybit(clean,timeframe)}catch(b){throw new Error(`Perpetual market data unavailable: ${a.message}; ${b.message}`)}}}return fetchBinance(clean,mapped,false)}
function pivotHigh(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].high<=c[i-j].high)return false;for(let j=1;j<=right;j++)if(c[i].high<c[i+j].high)return false;return true}
function pivotLow(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].low>=c[i-j].low)return false;for(let j=1;j<=right;j++)if(c[i].low>c[i+j].low)return false;return true}
function liquidityCandidates(c,bias,entry,atrValue){const start=Math.max(2,c.length-140),out=[],minDistance=Math.max(.001,Math.min(.004,(atrValue/entry)*.45)),maxDistance=Math.min(.10,Math.max(.015,(atrValue/entry)*8));for(let i=start;i<c.length-2;i++){if(bias==='LONG'&&pivotHigh(c,i)){const level=c[i].high;if(level<=entry)continue;const distance=(level-entry)/entry;if(distance<minDistance||distance>maxDistance)continue;let touches=1;for(let j=Math.max(start,i-20);j<i;j++)if(Math.abs(c[j].high-level)<=Math.max((c[j].high-c[j].low)*.25,entry*.00035))touches++;out.push({level,type:touches>=2?'Equal/clustered highs':'Internal swing high',touches,distance,index:i})}if(bias==='SHORT'&&pivotLow(c,i)){const level=c[i].low;if(level>=entry)continue;const distance=(entry-level)/entry;if(distance<minDistance||distance>maxDistance)continue;let touches=1;for(let j=Math.max(start,i-20);j<i;j++)if(Math.abs(c[j].low-level)<=Math.max((c[j].high-c[j].low)*.25,entry*.00035))touches++;out.push({level,type:touches>=2?'Equal/clustered lows':'Internal swing low',touches,distance,index:i})}}return out.sort((a,b)=>((b.touches-a.touches)*.35)+(a.distance-b.distance)*12-(b.index-a.index)*.0005)}
function chooseLiquidityTarget(c,bias,entry,a){const candidates=liquidityCandidates(c,bias,entry,a);if(!candidates.length)return null;const chosen=candidates[0],buffer=Math.max(a*.08,entry*.00015),target=bias==='LONG'?chosen.level-buffer:chosen.level+buffer;if((bias==='LONG'&&target<=entry)||(bias==='SHORT'&&target>=entry))return null;return{target,type:chosen.type,liquidityLevel:chosen.level,touches:chosen.touches,distancePct:Number((chosen.distance*100).toFixed(2)),reason:`Targeting ${chosen.type.toLowerCase()} at ${roundPrice(chosen.level)}; TP is placed just before the liquidity to account for reaction.`}}
function protectiveStop(c,bias,entry,a){const recent=c.slice(-12),recentLow=Math.min(...recent.map(x=>x.low)),recentHigh=Math.max(...recent.map(x=>x.high)),d=Math.max(a*.85,entry*.0015);let stop=bias==='LONG'?Math.min(recentLow,entry-d):Math.max(recentHigh,entry+d);const maxRisk=Math.max(entry*.025,a*1.6);if(bias==='LONG')stop=Math.max(stop,entry-maxRisk);else stop=Math.min(stop,entry+maxRisk);if(bias==='LONG'&&stop>=entry)stop=entry-Math.min(d,maxRisk);if(bias==='SHORT'&&stop<=entry)stop=entry+Math.min(d,maxRisk);return stop}
function structuralEntry(c,bias,current,a){
  const e20=ema(c.map(x=>x.close),20);
  const recent=c.slice(-8);
  const recentLow=Math.min(...recent.map(x=>x.low)),recentHigh=Math.max(...recent.map(x=>x.high));
  const pullback=bias==='LONG'?Math.min(current,e20??current):Math.max(current,e20??current);
  const maxPullback=Math.max(a*.9,current*.006);
  const limit=bias==='LONG'?Math.max(recentLow,current-maxPullback):Math.min(recentHigh,current+maxPullback);
  if(!Number.isFinite(limit))return current;
  if(bias==='LONG'&&limit>=current)return current;
  if(bias==='SHORT'&&limit<=current)return current;
  return limit;
}
function stopForEntry(c,bias,entry,a){
  const recent=c.slice(-16),low=Math.min(...recent.map(x=>x.low)),high=Math.max(...recent.map(x=>x.high));
  const buffer=Math.max(a*.35,entry*.001);
  let stop=bias==='LONG'?low-buffer:high+buffer;
  const maxRisk=Math.max(entry*.035,a*2.2);
  if(bias==='LONG')stop=Math.max(stop,entry-maxRisk);else stop=Math.min(stop,entry+maxRisk);
  return stop;
}
function targetPool(c,bias,entry,a){
  return liquidityCandidates(c,bias,entry,a).map(x=>x.level).filter(Number.isFinite).sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function evaluateTrade(c,bias,entry,a,minRR=1.8){
  const stop=stopForEntry(c,bias,entry,a),risk=Math.abs(entry-stop);
  if(!risk||!Number.isFinite(risk))return null;
  const pools=targetPool(c,bias,entry,a);
  const scored=pools.map(level=>({level,rr:Math.abs(level-entry)/risk})).filter(x=>x.rr>=minRR);
  if(!scored.length)return null;
  // Prefer a nearer legitimate target when it already offers quality RR;
  // don't stretch targets just to manufacture a pretty ratio.
  const chosen=scored.sort((x,y)=>x.rr-y.rr)[0];
  const remaining=pools.filter(level=>Math.abs(level-chosen.level)>a*.25&&Math.abs(level-entry)/risk>chosen.rr);
  const target2=remaining.length?remaining.sort((x,y)=>Math.abs(x-entry)/risk-Math.abs(y-entry)/risk)[0]:null;
  return {entry,stop,risk,target:chosen.level,target2,rr:chosen.rr};
}
function analyzeCandles(c,forcedBias=null){
  if(c.length<60)throw new Error(`Not enough candles for a reliable setup (${c.length} received)`);
  const closes=c.map(x=>x.close),last=c.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c);
  if(![e20,e50,a].every(Number.isFinite))throw new Error('Indicators could not be calculated from market data');
  const recent=c.slice(-30),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
  const score=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0);
  const engineBias=score>=2?'LONG':score<=-2?'SHORT':'WAIT',bias=forcedBias||engineBias;
  let trade=null,orderType='WAIT',entry=last.close,limitEntry=null,setupReason='No quality setup at the current price.';
  if(bias!=='WAIT'){
    // First test the current market price. If the market is already offering
    // a clean structure, use it; otherwise look for a sensible pullback entry.
    const marketTrade=evaluateTrade(c,bias,last.close,a,1.8);
    if(marketTrade){
      trade=marketTrade; orderType='MARKET'; entry=last.close;
      setupReason='Current price offers a valid structural entry with sufficient room to the first meaningful target.';
    } else {
      const candidate=structuralEntry(c,bias,last.close,a);
      const limitTrade=candidate!==last.close?evaluateTrade(c,bias,candidate,a,1.8):null;
      if(limitTrade){
        trade=limitTrade; orderType='LIMIT'; entry=candidate; limitEntry=candidate;
        setupReason='Current price is not attractive enough. A pullback limit entry offers the cleaner structure and sufficient target room.';
      } else {
        setupReason='Direction is visible, but neither the current price nor a sensible pullback offers enough target room. No trade is forced.';
      }
    }
  }
  const confidence=Math.min(92,Math.max(42,Math.round(50+Math.abs(score)*7+(r>55||r<45?5:0)+(last.close>e20&&e20>e50||last.close<e20&&e20<e50?5:0))));
  const stop=trade?.stop??null,risk=trade?.risk??null,riskPct=entry>0&&risk!=null?(risk/entry)*100:null;
  const target1=trade?.target??null,target2=trade?.target2??null,targetRisk=trade?.rr??null;
  const tradeReady=Boolean(trade&&target1!=null&&targetRisk>=1.8);
  const status=tradeReady?(targetRisk>=2.5?'A-GRADE':targetRisk>=2?'QUALITY':'ACCEPTABLE'):'WAIT';
  const liquidity=target1?chooseLiquidityTarget(c,bias,entry,a):null;
  return {
    bias,engineBias,confidence,entry:roundPrice(tradeReady?entry:null),marketEntry:roundPrice(last.close),
    limitEntry:roundPrice(limitEntry),orderType:tradeReady?orderType:'WAIT',
    stopLoss:roundPrice(tradeReady?stop:null),takeProfit1:roundPrice(tradeReady?target1:null),takeProfit2:roundPrice(tradeReady?target2:null),
    riskReward:tradeReady?`1:${targetRisk.toFixed(2)}`:'—',riskPercent:tradeReady?Number(riskPct.toFixed(2)):null,
    tradeReady,riskRewardValue:tradeReady?Number(targetRisk.toFixed(2)):null,quality:status,setupStatus:tradeReady?'TRADE READY':'WAIT',
    setupReason,rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),
    swingHigh:roundPrice(hi),swingLow:roundPrice(lo),liquidityTarget:liquidity?roundPrice(liquidity.liquidityLevel):null,
    liquidityType:liquidity?.type||'No confirmed target',liquidityTouches:liquidity?.touches||0,liquidityDistancePct:liquidity?.distancePct||null,
    liquidityReason:tradeReady?(liquidity?.reason||'Target is derived from a legitimate structural/liquidity level.'):'No target is shown because no quality trade is currently available.',
    timestamp:last.time
  };
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');if(!['forex','crypto','perpetual'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});const current=await candlesFor(market,symbol,timeframe),setup=analyzeCandles(current),confluence=await Promise.all(CONFLUENCE.map(async tf=>{try{const a=analyzeCandles(await candlesFor(market,symbol,tf));return{timeframe:tf,bias:a.bias,confidence:a.confidence}}catch(e){return{timeframe:tf,bias:'UNAVAILABLE',confidence:0,error:e?.message||'Unavailable'}}}));const directional=confluence.filter(x=>x.bias==='LONG'||x.bias==='SHORT'),longVotes=directional.filter(x=>x.bias==='LONG').length,shortVotes=directional.filter(x=>x.bias==='SHORT').length,inferred=longVotes>shortVotes?'LONG':shortVotes>longVotes?'SHORT':'WAIT',finalBias=setup.bias!=='WAIT'?setup.bias:inferred,aligned=confluence.filter(x=>x.bias===finalBias&&finalBias!=='WAIT').length,finalConfidence=Math.min(95,Math.max(35,Math.round(setup.confidence+aligned*4-(setup.bias==='WAIT'?4:0)))),finalSetup=finalBias===setup.bias?setup:(finalBias==='WAIT'?{...setup,bias:'WAIT',confidence:finalConfidence}:analyzeCandles(current,finalBias));return json(res,200,{ok:true,market,symbol,timeframe,setup:{...finalSetup,confidence:finalConfidence},confluence,aligned,totalTimeframes:4,source:market==='forex'?'Yahoo Finance chart data':market==='perpetual'?'Binance USD-M futures with Bybit linear fallback':'Binance spot klines',generatedAt:new Date().toISOString()})}catch(e){const code=e?.code||'',status=code==='AUTH_REQUIRED'||code==='AUTH_INVALID'?401:code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:e?.message||'Market analysis failed',code:code||'MARKET_ERROR'})}}
