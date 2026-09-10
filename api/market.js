import { authenticate, requireActiveAccess } from './_access.js';

const TIMEFRAME_MAP={
  '1m':{forex:'5m',crypto:'1m'},'5m':{forex:'5m',crypto:'5m'},'15m':{forex:'15m',crypto:'15m'},
  '30m':{forex:'30m',crypto:'30m'},'1H':{forex:'1h',crypto:'1h'},'4H':{forex:'4h',crypto:'4h'},
  '1D':{forex:'1d',crypto:'1d'},'1W':{forex:'1wk',crypto:'1w'}
};
const CONFLUENCE=['1H','4H','1D'];
const allowedIntervals=new Set(['1m','5m','15m','30m','4H','1H','1D','1W']);
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(payload));}
function sma(v,n){if(v.length<n)return null;return v.slice(-n).reduce((a,b)=>a+b,0)/n}
function ema(v,n){if(v.length<n)return null;let e=sma(v.slice(0,n),n),k=2/(n+1);for(let i=n;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v,n=14){if(v.length<n+1)return 50;let g=0,l=0;for(let i=1;i<=n;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}let ag=g/n,al=l/n;for(let i=n+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n}if(al===0)return 100;return 100-(100/(1+ag/al))}
function atr(c,n=14){if(c.length<n+1)return null;const t=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1];t.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)))}return sma(t.slice(-n),n)}
function roundPrice(v){if(v>=1000)return Number(v.toFixed(2));if(v>=100)return Number(v.toFixed(3));if(v>=1)return Number(v.toFixed(5));if(v>=.1)return Number(v.toFixed(6));return Number(v.toPrecision(7))}
function normalize(rows){return rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite))}
function aggregateFourHour(c){const g=new Map(),b=14400000;for(const x of c){const k=Math.floor(x.time/b)*b;if(!g.has(k))g.set(k,[]);g.get(k).push(x)}return [...g].sort((a,b)=>a[0]-b[0]).map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a.at(-1).close,volume:a.reduce((s,x)=>s+x.volume,0)}))}
async function fetchYahoo(symbol,interval){const ri=interval==='4h'?'1h':interval,range=['1m','5m','15m','30m'].includes(ri)?'7d':ri==='1h'?'3mo':ri==='1d'?'1y':'5y';let err='Forex data provider unavailable';for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com'])try{const r=await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${ri}&events=div%2Csplits`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});if(!r.ok){err=`Forex data provider returned ${r.status}`;continue}const body=await r.json(),q=body?.chart?.result?.[0]?.indicators?.quote?.[0],rows=(body?.chart?.result?.[0]?.timestamp||[]).map((t,i)=>[t*1000,q?.open?.[i],q?.high?.[i],q?.low?.[i],q?.close?.[i],q?.volume?.[i]||0]).filter(x=>x[4]!=null),c=normalize(rows);if(c.length<60){err='Forex provider returned insufficient candles';continue}return interval==='4h'?aggregateFourHour(c):c}catch(e){err=e?.message||err}throw new Error(err)}
async function fetchBinance(symbol,interval,perpetual){const endpoints=perpetual?['https://fapi.binance.com/fapi/v1/klines','https://fstream.binance.com/fapi/v1/klines','https://www.binance.com/fapi/v1/klines']:['https://data-api.binance.vision/api/v3/klines','https://api.binance.com/api/v3/klines'];let err='Crypto data provider unavailable';for(const base of endpoints)try{const r=await fetch(`${base}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok){err=`Binance returned ${r.status}`;continue}const rows=await r.json();if(!Array.isArray(rows)||!rows.length){err='Binance returned no candles';continue}return normalize(rows)}catch(e){err=e?.message||err}throw new Error(err)}
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
async function fetchBybit(symbol,timeframe){const r=await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${BYBIT_INTERVAL[timeframe]}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Bybit returned ${r.status}`);const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)throw new Error(body?.retMsg||'Bybit returned no perpetual candles');return normalize(body.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function candlesFor(market,symbol,timeframe){const mapped=TIMEFRAME_MAP[timeframe]?.[market==='forex'?'forex':'crypto'];if(!mapped)throw new Error('Unsupported timeframe');if(market==='forex')return fetchYahoo(`${symbol}=X`,mapped);const clean=symbol.replace(/[^A-Z0-9]/gi,'');if(market==='perpetual'){try{return await fetchBinance(clean,mapped,true)}catch(a){try{return await fetchBybit(clean,timeframe)}catch(b){throw new Error(`Perpetual market data unavailable: ${a.message}; ${b.message}`)}}}return fetchBinance(clean,mapped,false)}

function pivotHigh(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].high<=c[i-j].high)return false;for(let j=1;j<=right;j++)if(c[i].high<c[i+j].high)return false;return true}
function pivotLow(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].low>=c[i-j].low)return false;for(let j=1;j<=right;j++)if(c[i].low>c[i+j].low)return false;return true}
function liquidityCandidates(c,bias,entry){
  const start=Math.max(2,c.length-80),out=[];
  for(let i=start;i<c.length-2;i++){
    if(bias==='LONG'&&pivotHigh(c,i)){
      const level=c[i].high;if(level<=entry)continue;
      let touches=1;for(let j=Math.max(start,i-10);j<i;j++)if(Math.abs(c[j].high-level)<=Math.max((c[j].high-c[j].low)*0.18,entry*0.00025))touches++;
      out.push({level,type:touches>=2?'Equal/clustered highs':'Internal swing high',touches,distance:(level-entry)/entry,index:i});
    }
    if(bias==='SHORT'&&pivotLow(c,i)){
      const level=c[i].low;if(level>=entry)continue;
      let touches=1;for(let j=Math.max(start,i-10);j<i;j++)if(Math.abs(c[j].low-level)<=Math.max((c[j].high-c[j].low)*0.18,entry*0.00025))touches++;
      out.push({level,type:touches>=2?'Equal/clustered lows':'Internal swing low',touches,distance:(entry-level)/entry,index:i});
    }
  }
  return out.filter(x=>x.distance>=0.0015&&x.distance<=0.12).sort((a,b)=>(b.touches-a.touches)||(a.distance-b.distance));
}
function chooseLiquidityTarget(c,bias,entry,atrValue){
  const candidates=liquidityCandidates(c,bias,entry);
  if(!candidates.length)return null;
  const maxDistance=Math.min(0.12,Math.max(0.012,(atrValue/entry)*5));
  const viable=candidates.filter(x=>x.distance<=maxDistance);
  const pool=(viable.length?viable:candidates).sort((a,b)=>((b.touches*3)-(a.touches*3))+(a.distance-b.distance)*10);
  const chosen=pool[0];
  if(!chosen)return null;
  const buffer=Math.max(atrValue*0.08,entry*0.00015);
  const target=bias==='LONG'?chosen.level-buffer:chosen.level+buffer;
  return {target,type:chosen.type,liquidityLevel:chosen.level,touches:chosen.touches,distancePct:Number((chosen.distance*100).toFixed(2)),reason:`Nearest meaningful ${chosen.type.toLowerCase()} with ${chosen.touches} liquidity touch${chosen.touches===1?'':'es'}.`};
}
function protectiveStop(c,bias,entry,a){
  const recent=c.slice(-12),recentLow=Math.min(...recent.map(x=>x.low)),recentHigh=Math.max(...recent.map(x=>x.high));
  const d=Math.max(a*0.85,entry*0.0015);
  let stop=bias==='LONG'?Math.min(recentLow,entry-d):Math.max(recentHigh,entry+d);
  const maxRisk=Math.max(entry*0.025,a*1.6);
  if(bias==='LONG')stop=Math.max(stop,entry-maxRisk);else stop=Math.min(stop,entry+maxRisk);
  if(bias==='LONG'&&stop>=entry)stop=entry-Math.min(d,maxRisk);if(bias==='SHORT'&&stop<=entry)stop=entry+Math.min(d,maxRisk);
  return stop;
}
function analyzeCandles(c){
  if(c.length<60)throw new Error(`Not enough candles for a reliable setup (${c.length} received)`);
  const closes=c.map(x=>x.close),last=c.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c);
  if(![e20,e50,a].every(Number.isFinite))throw new Error('Indicators could not be calculated from market data');
  const recent=c.slice(-30),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
  const score=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0);
  const bias=score>=2?'LONG':score<=-2?'SHORT':'WAIT';
  let entry=last.close,stop=entry+a,target1=entry,target2=entry,liquidity=null,risk=0;
  if(bias!=='WAIT'){
    stop=protectiveStop(c,bias,entry,a);risk=Math.abs(entry-stop);
    liquidity=chooseLiquidityTarget(c,bias,entry,a);
    if(liquidity){
      const target=liquidity.target;
      if(bias==='LONG'&&target>entry)target1=target;else if(bias==='SHORT'&&target<entry)target1=target;else liquidity=null;
    }
    if(!liquidity){
      target1=bias==='LONG'?entry+risk*1.5:entry-risk*1.5;
    }
    const secondPool=liquidityCandidates(c,bias,entry).filter(x=>liquidity?Math.abs(x.level-liquidity.liquidityLevel)>a*0.25:true)[0];
    if(secondPool)target2=bias==='LONG'?secondPool.level-Math.max(a*0.05,entry*0.0001):secondPool.level+Math.max(a*0.05,entry*0.0001);
    else target2=bias==='LONG'?entry+risk*2:entry-risk*2;
    if(bias==='LONG'){target1=Math.max(entry+Math.min(risk*0.5,(target1-entry)),target1);target2=Math.max(target2,target1+risk*0.25)}
    else {target1=Math.min(entry-Math.min(risk*0.5,(entry-target1)),target1);target2=Math.min(target2,target1-risk*0.25)}
  }
  const confidence=Math.min(92,Math.max(42,Math.round(50+Math.abs(score)*7+(r>55||r<45?5:0)+(last.close>e20&&e20>e50||last.close<e20&&e20<e50?5:0))));
  const riskPct=entry>0?(risk/entry)*100:0;
  return{bias,confidence,entry:roundPrice(entry),stopLoss:roundPrice(stop),takeProfit1:roundPrice(target1),takeProfit2:roundPrice(target2),riskReward:risk>0&&bias!=='WAIT'?`1:${(Math.abs(target1-entry)/risk).toFixed(2)}`:'—',riskPercent:Number(riskPct.toFixed(2)),rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),swingHigh:roundPrice(hi),swingLow:roundPrice(lo),liquidityTarget:liquidity?roundPrice(liquidity.liquidityLevel):null,liquidityType:liquidity?.type||'Fallback volatility target',liquidityTouches:liquidity?.touches||0,liquidityDistancePct:liquidity?.distancePct||null,liquidityReason:liquidity?.reason||'No valid internal liquidity pool met the target-quality threshold; conservative fallback used.',timestamp:last.time}
}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  try{
    const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);
    const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');
    if(!['forex','crypto','perpetual'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});
    const current=await candlesFor(market,symbol,timeframe),setup=analyzeCandles(current),confluence=await Promise.all(CONFLUENCE.map(async tf=>{try{const a=analyzeCandles(await candlesFor(market,symbol,tf));return{timeframe:tf,bias:a.bias,confidence:a.confidence}}catch(e){return{timeframe:tf,bias:'UNAVAILABLE',confidence:0,error:e?.message||'Unavailable'}}}));
    const directional=confluence.filter(x=>x.bias==='LONG'||x.bias==='SHORT'),longVotes=directional.filter(x=>x.bias==='LONG').length,shortVotes=directional.filter(x=>x.bias==='SHORT').length,inferred=longVotes>shortVotes?'LONG':shortVotes>longVotes?'SHORT':'WAIT',finalBias=setup.bias!=='WAIT'?setup.bias:inferred,aligned=confluence.filter(x=>x.bias===finalBias&&finalBias!=='WAIT').length,finalConfidence=Math.min(95,Math.max(35,Math.round(setup.confidence+aligned*4-(setup.bias==='WAIT'?4:0)))),finalSetup=finalBias===setup.bias?setup:{...setup,bias:finalBias,confidence:finalConfidence};
    return json(res,200,{ok:true,market,symbol,timeframe,setup:{...finalSetup,confidence:finalConfidence},confluence,aligned,totalTimeframes:4,source:market==='forex'?'Yahoo Finance chart data':market==='perpetual'?'Binance USD-M futures with Bybit linear fallback':'Binance spot public klines',generatedAt:new Date().toISOString()})
  }catch(e){if(['AUTH_REQUIRED','AUTH_INVALID'].includes(e?.code))return json(res,401,{ok:false,error:e.message});if(e?.code==='ACCESS_EXPIRED')return json(res,403,{ok:false,error:e.message});return json(res,502,{ok:false,error:e?.message||'Market analysis failed'})}
}