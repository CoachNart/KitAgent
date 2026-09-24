import { authenticate, requireActiveAccess } from '../server/access.js';
import { yahooCandles, yahooPrice, yahooInstruments } from '../server/yahooMarket.js';
const TIMEFRAME_MAP={'1m':{forex:'1m',crypto:'1m'},'5m':{forex:'5m',crypto:'5m'},'15m':{forex:'15m',crypto:'15m'},'30m':{forex:'30m',crypto:'30m'},'1H':{forex:'1h',crypto:'1h'},'4H':{forex:'4h',crypto:'4h'},'1D':{forex:'1d',crypto:'1d'},'1W':{forex:'1wk',crypto:'1w'}};
const TIMEFRAME_ORDER=['1m','5m','15m','30m','1H','4H','1D','1W'];
const SETUP_MIN_RR=2.0;
function adjacentTimeframe(tf,steps=1){const i=Math.max(0,TIMEFRAME_ORDER.indexOf(tf));return TIMEFRAME_ORDER[Math.min(TIMEFRAME_ORDER.length-1,i+steps)]||'1H';}
function strategyTimeframes(tf,strategy){
  const key=normalizeStrategy(strategy),higher=adjacentTimeframe(tf,1),higher2=adjacentTimeframe(tf,2);
  // Every setup has an execution timeframe plus genuinely higher context. A 1W
  // execution chart cannot provide that hierarchy, so it is deliberately rejected.
  if(tf==='1W')throw Object.assign(new Error('1W is not a valid execution timeframe for the setup engine. Select 1D or lower.'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});
  switch(key){
    case 'TOP_DOWN': return {entry:tf,structure:higher,bias:higher2};
    case 'PULLBACK': return {entry:tf,structure:tf,bias:higher};
    case 'BREAKOUT': return {entry:tf,structure:tf,bias:higher};
    case 'SMC': return {entry:tf,structure:tf,bias:higher};
    // MSNR is specifically a Daily/4H contextual model, so do not silently
    // replace its required higher-timeframe storyline with 5m/15m context.
    case 'MSNR':
      if(!['1m','5m','15m','30m','1H','4H'].includes(tf))throw Object.assign(new Error('MSNR requires a 4H/Daily context and is available on 4H or lower execution timeframes.'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});
      return {entry:tf,structure:'4H',bias:'1D'};
    case 'PRICE_ACTION': return {entry:tf,structure:tf,bias:higher};
    case 'LIQUIDITY_REVERSAL': return {entry:tf,structure:tf,bias:higher};
    case 'CRT':
      if(!['1m','5m','15m','30m','1H','4H'].includes(tf))throw Object.assign(new Error('CRT requires a completed higher-timeframe range and is available on 4H or lower execution timeframes.'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});
      return {entry:tf,structure:higher,bias:higher2};
    default: return {entry:tf,structure:tf,bias:higher};
  }
}
const allowedIntervals=new Set(['1m','5m','15m','30m','4H','1H','1D','1W']);
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(payload))}
function sma(v,n){const a=(v||[]).map(Number).filter(Number.isFinite);if(!a.length)return null;const len=Math.min(Number(n)||a.length,a.length);return a.slice(-len).reduce((x,y)=>x+y,0)/len}
function atr(c,n=14){if(!Array.isArray(c)||c.length<2)return null;const t=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1];const tr=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));if(Number.isFinite(tr)&&tr>=0)t.push(tr)}return sma(t,n)}
function roundPrice(v){if(v==null||!Number.isFinite(Number(v)))return null;v=Number(v);if(v>=1000)return Number(v.toFixed(2));if(v>=100)return Number(v.toFixed(3));if(v>=1)return Number(v.toFixed(5));if(v>=.1)return Number(v.toFixed(6));return Number(v.toPrecision(7))}
function normalize(rows){const byTime=new Map();for(const r of rows||[]){const x={time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)};if(![x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)||x.time<=0)continue;if(x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high)||x.high<x.low)continue;byTime.set(x.time,x)}return [...byTime.values()].sort((a,b)=>a.time-b.time)}
function normalizeInstrumentList(rows){return [...new Map(rows.map(x=>[x.symbol,x])).values()];}
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
const BYBIT_INSTRUMENT_CACHE_TTL=10*60*1000;
let bybitInstrumentCache=[];
let bybitInstrumentCacheAt=0;
let bybitInstrumentRefresh=null;

async function getBybitPerpetualInstruments(){
  const now=Date.now();
  if(bybitInstrumentCache.length&&now-bybitInstrumentCacheAt<BYBIT_INSTRUMENT_CACHE_TTL)return bybitInstrumentCache;
  if(bybitInstrumentRefresh)return bybitInstrumentRefresh;
  bybitInstrumentRefresh=(async()=>{
    const all=[];
    let cursor='';
    for(let page=0;page<25;page++){
      const url=new URL('https://api.bybit.com/v5/market/instruments-info');
      url.searchParams.set('category','linear');
      url.searchParams.set('status','Trading');
      url.searchParams.set('limit','1000');
      if(cursor)url.searchParams.set('cursor',cursor);
      const r=await fetch(url.toString(),{headers:{Accept:'application/json'}});
      if(!r.ok){
        if(bybitInstrumentCache.length)return bybitInstrumentCache;
        throw Object.assign(new Error('Bybit perpetual instrument provider unavailable'),{code:'MARKET_DATA_INSTRUMENT_UNAVAILABLE'});
      }
      const body=await r.json();
      if(body?.retCode!==0){
        if(bybitInstrumentCache.length)return bybitInstrumentCache;
        throw Object.assign(new Error(body?.retMsg||'Bybit perpetual instrument provider unavailable'),{code:'MARKET_DATA_INSTRUMENT_UNAVAILABLE'});
      }
      all.push(...(body?.result?.list||[]));
      cursor=body?.result?.nextPageCursor||'';
      if(!cursor)break;
    }
    if(cursor)throw Object.assign(new Error('Bybit returned an unexpectedly large perpetual instrument catalogue'),{code:'MARKET_DATA_INSTRUMENT_UNAVAILABLE'});
    const instruments=normalizeInstrumentList(all
      .filter(x=>x.status==='Trading'&&x.contractType==='LinearPerpetual'&&x.baseCoin&&x.quoteCoin)
      .map(x=>({symbol:x.baseCoin+'/'+x.quoteCoin,providerSymbol:x.symbol,name:x.baseCoin+' / '+x.quoteCoin,type:'PERPETUAL'})))
      .sort((a,b)=>a.symbol.localeCompare(b.symbol));
    if(!instruments.length)throw Object.assign(new Error('Bybit returned no trading perpetual instruments'),{code:'MARKET_DATA_INSTRUMENT_UNAVAILABLE'});
    bybitInstrumentCache=instruments;
    bybitInstrumentCacheAt=Date.now();
    return instruments;
  })().finally(()=>{bybitInstrumentRefresh=null});
  return bybitInstrumentRefresh;
}

async function fetchBybit(symbol,timeframe){const r=await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${BYBIT_INTERVAL[timeframe]}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Bybit returned ${r.status}`);const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)throw new Error(body?.retMsg||'Bybit returned no perpetual candles');return normalize(body.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function bybitPrice(symbol){
  const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol='+encodeURIComponent(symbol),{headers:{Accept:'application/json'}});
  if(!r.ok)throw Object.assign(new Error('Bybit ticker provider unavailable'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  const body=await r.json();
  const row=body?.result?.list?.[0];
  if(body?.retCode!==0||!row)throw Object.assign(new Error(body?.retMsg||'Bybit ticker provider returned no price'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  const bid=Number(row.bid1Price),ask=Number(row.ask1Price),last=Number(row.lastPrice);
  const mid=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>0?(bid+ask)/2:last;
  if(!Number.isFinite(mid)||mid<=0)throw Object.assign(new Error('Bybit live price is unavailable'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  return {bid:Number.isFinite(bid)&&bid>0?bid:mid,ask:Number.isFinite(ask)&&ask>0?ask:mid,mid,time:new Date(Number(body.time||Date.now())).toISOString(),tradeable:true,spread:(Number.isFinite(bid)&&Number.isFinite(ask))?Math.max(0,ask-bid):0,marketState:'open',stale:false,instrument:{name:symbol}};
}
async function candlesFor(market,symbol,timeframe){if(!TIMEFRAME_MAP[timeframe])throw new Error('Unsupported timeframe');if(['forex','commodities','indices'].includes(market)){const result=await yahooCandles(symbol,timeframe,market);return normalize(result.rows)}const clean=symbol.replace(/[^A-Z0-9]/gi,'');if(market==='perpetual'||market==='crypto')return fetchBybit(clean,timeframe);throw new Error('Unsupported market data source')}
function pivotHigh(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].high<=c[i-j].high)return false;for(let j=1;j<=right;j++)if(c[i].high<c[i+j].high)return false;return true}
function pivotLow(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].low>=c[i-j].low)return false;for(let j=1;j<=right;j++)if(c[i].low>c[i+j].low)return false;return true}
function confirmedSwings(c){
  const highs=[],lows=[];for(let i=2;i<c.length-2;i++){if(pivotHigh(c,i))highs.push({p:c[i].high,i});if(pivotLow(c,i))lows.push({p:c[i].low,i});}return {highs,lows};
}
function structureBreak(c,bias,lookback=30,maxAge=Infinity){
  const st=marketStructure(c),start=Math.max(2,c.length-lookback),recentStart=Number.isFinite(maxAge)?Math.max(0,c.length-maxAge):0;
  const refs=bias==='LONG'?st.highs:st.lows;
  for(const ref of refs.filter(x=>x.i>=start&&x.i<c.length-2).slice().reverse()){
    for(let i=ref.i+1;i<c.length;i++){
      if(i<recentStart)continue;
      if((bias==='LONG'&&c[i].close>ref.p)||(bias==='SHORT'&&c[i].close<ref.p))
        return {type:'BOS',level:ref.p,index:ref.i,breakIndex:i};
    }
  }
  return null;
}
function displacement(c,bias){
  if(c.length<8)return false;const last=c.at(-1),body=Math.abs(last.close-last.open),range=last.high-last.low,avg=c.slice(-7,-1).reduce((s,x)=>s+(x.high-x.low),0)/6;
  if(!range||body<range*.55||range<avg*1.15)return false;
  return bias==='LONG'?last.close>last.open&&last.close>=last.high-range*.25:last.close<last.open&&last.close<=last.low+range*.25;
}
function liquiditySweep(c,bias,lookback=20,maxAge=Infinity){
  const st=marketStructure(c),start=Math.max(2,c.length-lookback),recentStart=Number.isFinite(maxAge)?Math.max(0,c.length-maxAge):0;
  const refs=(bias==='LONG'?st.lows:st.highs)
    .filter(x=>x.i>=start&&x.i<c.length-2)
    .slice().sort((a,b)=>b.i-a.i);
  let best=null;
  for(const ref of refs){
    for(let i=ref.i+1;i<c.length;i++){
      if(i<recentStart)continue;
      const swept=bias==='LONG'&&c[i].low<ref.p&&c[i].close>ref.p
        ||bias==='SHORT'&&c[i].high>ref.p&&c[i].close<ref.p;
      if(swept){
        const candidate={type:bias==='LONG'?'SELL-SIDE SWEEP':'BUY-SIDE SWEEP',level:ref.p,index:i,referenceIndex:ref.i};
        if(!best||candidate.index>best.index)best=candidate;
      }
    }
  }
  return best;
}
function fairValueGaps(c,bias){
  const out=[];for(let i=2;i<c.length;i++){const a=c[i-2],d=c[i];if(bias==='LONG'&&d.low>a.high)out.push({low:a.high,high:d.low,mid:(a.high+d.low)/2,index:i,type:'BULLISH FVG'});if(bias==='SHORT'&&d.high<a.low)out.push({low:d.high,high:a.low,mid:(d.high+a.low)/2,index:i,type:'BEARISH FVG'});}return out.filter(x=>x.index>=Math.max(2,c.length-80));
}
function orderBlockCandidates(c,bias){
  const out=[];for(let i=Math.max(2,c.length-60);i<c.length-1;i++){const x=c[i],n=c[i+1],body=Math.abs(x.close-x.open),nbody=Math.abs(n.close-n.open);
    if(bias==='LONG'&&x.close<x.open&&n.close>x.high&&nbody>=body*.9)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,type:'BULLISH ORDER BLOCK'});
    if(bias==='SHORT'&&x.close>x.open&&n.close<x.low&&nbody>=body*.9)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,type:'BEARISH ORDER BLOCK'});
  }return out;
}
function zoneIsUnmitigated(c,z,bias){
  const from=z.type?.includes('ORDER BLOCK')?z.index+2:z.index+1;
  for(let i=from;i<c.length;i++){
    if(bias==='LONG'&&c[i].low<=z.high)return false;
    if(bias==='SHORT'&&c[i].high>=z.low)return false;
  }
  return true;
}
function zoneTouchesCandle(c,z,candle=c.at(-1)){
  if(!z||!candle)return false;
  return Number.isFinite(candle.high)&&Number.isFinite(candle.low)&&candle.high>=z.low&&candle.low<=z.high;
}
function zoneFreshBeforeCurrent(c,z,bias){
  const from=z.type?.includes('ORDER BLOCK')?z.index+2:z.index+1;
  const end=Math.max(from,c.length-1);
  for(let i=from;i<end;i++){
    if(zoneTouchesCandle(c,z,c[i]))return false;
  }
  return true;
}
function entryZones(c,bias,current,a,maxAge=24){
  const zones=[...fairValueGaps(c,bias),...orderBlockCandidates(c,bias)].filter(z=>z.index<c.length-1);
  const maxDistance=Math.min(a*2.5,current*.015);
  return zones.filter(z=>{
    const ahead=bias==='LONG'?z.mid<current:z.mid>current;
    const age=c.length-1-z.index;
    const distance=Math.abs(current-z.mid);
    return ahead&&age<=maxAge&&distance<=maxDistance&&zoneFreshBeforeCurrent(c,z,bias);
  }).sort((x,y)=>Math.abs(current-x.mid)-Math.abs(current-y.mid));
}
function structuralEntryZones(c,bias,current,a,maxAge=40){
  const st=marketStructure(c),swings=bias==='LONG'?st.lows:st.highs,limit=Math.min(a*3.0,current*.02),out=[];
  for(const s of swings.slice().reverse()){
    const i=Number(s.i);
    if(!Number.isFinite(i)||i>=c.length-2||c.length-1-i>maxAge)continue;
    const candle=c[i];
    if(!candle)continue;
    const mid=(Number(candle.high)+Number(candle.low))/2;
    const ahead=bias==='LONG'?mid<current:mid>current;
    const distance=Math.abs(current-mid);
    if(!ahead||distance>limit)continue;
    const zone={low:Number(candle.low),high:Number(candle.high),mid,index:i,type:bias==='LONG'?'STRUCTURAL DEMAND':'STRUCTURAL SUPPLY'};
    if(!Number.isFinite(zone.low)||!Number.isFinite(zone.high)||zone.low>=zone.high)continue;
    if(!zoneFreshBeforeCurrent(c,zone,bias))continue;
    out.push(zone);
  }
  return out.sort((x,y)=>Math.abs(current-x.mid)-Math.abs(current-y.mid));
}
function liquidityCandidates(c,bias,entry,a){
  const st=marketStructure(c),source=bias==='LONG'?st.highs:st.lows;
  const tolerance=Math.max(a*.18,entry*.0006),groups=[];
  for(const swing of source.filter(x=>x.i>=Math.max(0,c.length-120))){
    if(!Number.isFinite(swing.p))continue;
    const valid=bias==='LONG'?swing.p>entry:swing.p<entry;
    if(!valid)continue;
    let group=groups.find(g=>Math.abs(g.level-swing.p)<=tolerance);
    if(!group){group={level:swing.p,touches:0,lastIndex:swing.i};groups.push(group);}
    group.touches+=1;group.lastIndex=Math.max(group.lastIndex,swing.i);
  }
  const recentExtreme=bias==='LONG'
    ?Math.max(...c.slice(-80).map(x=>x.high))
    :Math.min(...c.slice(-80).map(x=>x.low));
  if(Number.isFinite(recentExtreme)&&(bias==='LONG'?recentExtreme>entry:recentExtreme<entry)){
    const group=groups.find(g=>Math.abs(g.level-recentExtreme)<=tolerance);
    if(group)group.touches+=1;
    else groups.push({level:recentExtreme,touches:1,lastIndex:c.length-1});
  }
  return groups.map(g=>({...g,distance:Math.abs(g.level-entry),type:g.touches>=2
    ?(bias==='LONG'?'EQUAL HIGHS / BUY-SIDE LIQUIDITY':'EQUAL LOWS / SELL-SIDE LIQUIDITY')
    :(bias==='LONG'?'SWING HIGH / BUY-SIDE LIQUIDITY':'SWING LOW / SELL-SIDE LIQUIDITY')
  })).sort((x,y)=>x.distance-y.distance);
}
function protectiveStop(c,bias,entry,a){
  const st=marketStructure(c),sweep=liquiditySweep(c,bias,20,12),buffer=Math.max(a*.16,entry*.00025);
  const swings=bias==='LONG'?st.lows:st.highs;
  const recent=swings.filter(x=>x.i>=Math.max(0,c.length-50)&& (bias==='LONG'?x.p<entry:x.p>entry));
  let invalidation=bias==='LONG'
    ?(recent.at(-1)?.p??st.protectedLow??Math.min(...c.slice(-20).map(x=>x.low)))
    :(recent.at(-1)?.p??st.protectedHigh??Math.max(...c.slice(-20).map(x=>x.high)));
  if(sweep)invalidation=bias==='LONG'?Math.min(invalidation,sweep.level):Math.max(invalidation,sweep.level);
  let stop=bias==='LONG'?invalidation-buffer:invalidation+buffer;
  const maxRisk=Math.min(a*2.2,entry*.02);
  // Never pull a structural stop inward just to satisfy the risk cap.
  // If the real invalidation is too far away, reject the trade instead.
  if(bias==='LONG'&&stop<entry-maxRisk)return null;
  if(bias==='SHORT'&&stop>entry+maxRisk)return null;
  return stop;
}
function stopForEntry(c,bias,entry,a){return protectiveStop(c,bias,entry,a);}
function targetPool(c,bias,entry,a){
  const structural=liquidityCandidates(c,bias,entry,a).map(x=>x.level).filter(Number.isFinite);
  const window=c.slice(-80);
  const previous=c.slice(-160,-80);
  const extremes=bias==='LONG'
    ?[Math.max(...window.map(x=>x.high)),...(previous.length?[Math.max(...previous.map(x=>x.high))]:[])]
    : [Math.min(...window.map(x=>x.low)),...(previous.length?[Math.min(...previous.map(x=>x.low))]:[])];
  const maxDistance=Math.min(a*6.0,entry*.06);
  return [...new Set([...structural,...extremes])]
    .filter(level=>Number.isFinite(level))
    .filter(level=>bias==='LONG'?level>entry&&level-entry<=maxDistance:level<entry&&entry-level<=maxDistance)
    .sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function liquidityTargetBuffer(c,bias,level,entry,a){
  // Liquidity is a zone rather than an exact wick price. Derive a small
  // front-run buffer from the actual candles that form the level instead of
  // using a fixed percentage or inventing a new price.
  const tolerance=Math.max(a*.18,entry*.0006);
  const touches=(c||[]).slice(-120).filter(x=>{
    if(!Number.isFinite(x?.high)||!Number.isFinite(x?.low))return false;
    return Math.abs((bias==='LONG'?x.high:x.low)-level)<=tolerance;
  });
  const localRanges=touches.map(x=>x.high-x.low).filter(x=>Number.isFinite(x)&&x>0);
  const localRange=localRanges.length?sma(localRanges,Math.min(5,localRanges.length)):null;
  const atrBuffer=Number.isFinite(a)?a*.12:0;
  const rangeBuffer=Number.isFinite(localRange)?localRange*.15:0;
  const floor=entry>0?entry*.0002:0;
  const buffer=Math.max(atrBuffer,rangeBuffer,floor);
  const maxBuffer=Math.max(a*.35,entry*.0025);
  return Math.min(buffer,maxBuffer);
}
function targetBeforeLiquidity(c,bias,level,entry,a){
  const buffer=liquidityTargetBuffer(c,bias,level,entry,a);
  return bias==='LONG'?level-buffer:level+buffer;
}
function evaluateTrade(c,bias,entry,a,minRR=SETUP_MIN_RR){
  if(!Number.isFinite(entry)||entry<=0||!['LONG','SHORT'].includes(bias)||!Number.isFinite(a)||a<=0)return null;
  const stop=stopForEntry(c,bias,entry,a);
  if(!Number.isFinite(stop))return null;
  if((bias==='LONG'&&stop>=entry)||(bias==='SHORT'&&stop<=entry))return null;
  const risk=Math.abs(entry-stop);
  const minimumRisk=Math.max(a*.65,entry*.001);
  if(!Number.isFinite(risk)||risk<minimumRisk)return null;
  const pools=targetPool(c,bias,entry,a);
  const minimumReward=Math.max(a*.75,entry*.0015,risk*minRR);
  const maxTargetDistance=Math.min(a*6.0,entry*.06);
  const candidates=pools.map(level=>{
    const target=targetBeforeLiquidity(c,bias,level,entry,a);
    const reward=Math.abs(target-entry);
    return {level,target,reward,rr:reward/risk};
  }).filter(x=>Number.isFinite(x.target)&&x.reward>=minimumReward&&x.rr>=minRR&&x.reward<=maxTargetDistance);
  if(!candidates.length)return null;
  const chosen=candidates[0];
  return {entry,stop,risk,target:chosen.target,targetLiquidity:chosen.level,rr:chosen.rr};
}
function marketStructure(c){
  const {highs,lows}=confirmedSwings(c),h=highs.slice(-8),l=lows.slice(-8);
  const recentH=h.slice(-4),recentL=l.slice(-4),lastH=h.at(-1)?.p??null,lastL=l.at(-1)?.p??null;
  const prevH=h.at(-2)?.p??null,prevL=l.at(-2)?.p??null;
  const higherHigh=prevH!=null&&lastH>prevH,lowerHigh=prevH!=null&&lastH<prevH;
  const higherLow=prevL!=null&&lastL>prevL,lowerLow=prevL!=null&&lastL<prevL;
  const risingHighs=recentH.length>=3&&recentH.slice(1).every((x,i)=>x.p>recentH[i].p);
  const fallingHighs=recentH.length>=3&&recentH.slice(1).every((x,i)=>x.p<recentH[i].p);
  const risingLows=recentL.length>=3&&recentL.slice(1).every((x,i)=>x.p>recentL[i].p);
  const fallingLows=recentL.length>=3&&recentL.slice(1).every((x,i)=>x.p<recentL[i].p);
  const close=c.at(-1)?.close??null;
  const bullishBreak=lastH!=null&&close>lastH;
  const bearishBreak=lastL!=null&&close<lastL;
  let trend='RANGE';
  // A single close through a swing is a structure event, not by itself a trend.
  // Directional bias requires actual swing sequencing: HH+HL or LH+LL.
  if((risingHighs&&risingLows)||higherHigh&&higherLow)trend='LONG';
  else if((fallingHighs&&fallingLows)||lowerHigh&&lowerLow)trend='SHORT';
  return {
    trend,higherHigh,higherLow,lowerHigh,lowerLow,risingHighs,risingLows,fallingHighs,fallingLows,
    bullishBreak,bearishBreak,lastHigh:lastH,lastLow:lastL,
    protectedHigh:trend==='SHORT'?(prevH??lastH):lastH,
    protectedLow:trend==='LONG'?(prevL??lastL):lastL,
    highs,lows
  };
}
function structureBias(st){return st.trend==='LONG'||st.trend==='SHORT'?st.trend:'WAIT'}
const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',short:'HTF structure first',description:'Starts with higher-timeframe structure, then requires the middle and execution layers to provide a tradable confirmation.',objective:'Trade only when the higher-timeframe storyline and a current execution condition agree.',rules:['Higher timeframe establishes direction.','Middle timeframe confirms or exposes a hard conflict.','Execution timeframe supplies a current market or fresh limit entry.','No synthetic levels when the required evidence is missing.']},
  PULLBACK:{name:'Pullback',short:'Impulse → retracement → continuation',description:'Waits for a real directional impulse, then looks for a fresh FVG or order block retracement that remains valid inside the higher-timeframe direction.',objective:'Enter continuation after price retraces into a qualified, still-live execution zone.',rules:['HTF direction must be established.','A recent directional impulse must exist.','Price must be retracing into a fresh FVG or order block.','The zone must be unmitigated, close enough to execute and offer a realistic reward relative to risk.','A broken or stale zone is rejected.']},
  BREAKOUT:{name:'Breakout',short:'Close → displacement → continuation',description:'Requires a structural level to break with a decisive candle close and displacement. Wick-only breaks are rejected.',objective:'Participate only after price proves acceptance beyond a meaningful structure level.',rules:['HTF direction must support the break.','A recent BOS must be present.','The break must have decisive displacement, not a wick-only breach.','The current price must remain close enough to the confirmed break leg for execution.','Insufficient RR or stale breaks are rejected.']},
  SMC:{name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a Smart Money Concepts sequence: liquidity sweep, displacement, break of structure and a fresh FVG/order-block point of interest.',objective:'Trade the post-liquidity repricing leg rather than guessing direction before the displacement.',rules:['HTF direction is the directional filter.','A meaningful opposing liquidity pool must be swept and reclaimed.','Displacement must follow the sweep.','BOS/structure confirmation must be present.','Entry must use a fresh FVG or order block when price is away from the immediate execution point.']},
  MSNR:{name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Malaysian Support and Resistance framework: higher-timeframe storyline, fresh key levels, V/A formations, SBR/RBS flips and kissing-candle base zones, followed by lower-timeframe confirmation.',objective:'Wait for price to return to a fresh MSNR level and prove the reaction before execution.',rules:['Daily/4H storyline establishes the directional context.','Fresh, unmitigated support/resistance must be identified.','SBR/RBS flips and V/A turning structures are treated as level evidence.','Kissing-candle overlap can define the reaction base.','A tap alone is not an entry; lower-timeframe BOS or engulfing confirmation is required.','If the level is stale, already mitigated or lacks confirmation, no setup is issued.']},
  PRICE_ACTION:{name:'Price Action',short:'Structure + candle confirmation',description:'Focuses on market structure, rejection and engulfing behaviour without requiring an SMC-specific liquidity sequence.',objective:'Use clean structural price action to confirm continuation or reversal at a meaningful level.',rules:['HTF structure provides the directional context.','Price must interact with a meaningful recent swing or zone.','A clear rejection or engulfing confirmation is required.','The invalidation must sit beyond the structure being traded.','Target must be a real structural/liquidity level within the execution timeframe\'s realistic range.']},
  LIQUIDITY_REVERSAL:{name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Targets reversals only after price takes a recent swing/liquidity level and closes back through it with displacement.',objective:'Avoid catching falling knives by waiting for the sweep and reclaim to become observable evidence.',rules:['A recent swing high/low must be swept.','Price must reclaim the swept level.','Displacement must confirm the reversal leg.','The stop belongs beyond the swept structure.','No reversal setup is issued without a genuine sweep.']},
  CRT:{name:'CRT',short:'Candle range → sweep → reclaim',description:'Candle Range Theory setup model: use a completed candle range, wait for one side to be taken, then require a reclaim back through the range before targeting the opposite side.',objective:'Trade a confirmed range expansion and return rather than entering on an unconfirmed wick.',rules:['Use a completed reference candle on the selected timeframe.','One side of that range must be swept.','Price must reclaim back through the range midpoint.','The sweep extreme defines invalidation.','The opposite side of the range must support the risk model and remain within a realistic execution range.']}
};
const STRATEGY_KEYS=new Set(Object.keys(STRATEGIES));
function normalizeStrategy(v){const key=String(v||'TOP_DOWN').toUpperCase();return STRATEGY_KEYS.has(key)?key:'TOP_DOWN'}
const CANDLE_INTERVAL_MS={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000,'1wk':604800000,'1w':604800000,'1H':3600000,'4H':14400000,'1D':86400000,'1W':604800000};
function closedCandles(c,timeframe,market=''){
  if(!Array.isArray(c)||c.length<2)return [];
  // TradFi candles are supplied by the market provider and are retained here;
  // crypto candles are trimmed when the newest bar is still forming.
  if(['forex','commodities','indices'].includes(market))return c;
  const sourceTimeframe=TIMEFRAME_MAP[timeframe]?.crypto||timeframe;
  const last=c.at(-1),interval=CANDLE_INTERVAL_MS[sourceTimeframe];
  if(!last||!Number.isFinite(Number(last.time))||!interval)return c;
  const now=Date.now(),age=now-Number(last.time);
  const isOpen=age>=0&&age<interval;
  return isOpen?c.slice(0,-1):c;
}
function marketDataFresh(c,timeframe,market=''){
  if(!Array.isArray(c)||!c.length)return false;
  if(['forex','commodities','indices'].includes(market)){
    // Yahoo has already returned a valid candle set. Do not reject normal
    // exchange/session/provider timestamp differences as "stale"; an actual
    // provider failure is surfaced by yahooCandles() itself.
    return true;
  }
  const sourceTimeframe=TIMEFRAME_MAP[timeframe]?.crypto||timeframe;
  const lastOpen=Number(c.at(-1)?.time),interval=CANDLE_INTERVAL_MS[sourceTimeframe];
  if(!Number.isFinite(lastOpen)||!interval)return false;
  const age=Date.now()-lastOpen;
  if(age<0)return true;
  const maxAge=['1W','1wk','1w'].includes(sourceTimeframe)?21*86400000:['1D','1d'].includes(sourceTimeframe)?7*86400000:interval*4;
  return age<=maxAge;
}
function candleEngulfing(c,bias){
  if(c.length<2)return false;
  const p=c.at(-2),x=c.at(-1);
  if(bias==='LONG')return p.close<p.open&&x.close>x.open&&x.open<=p.close&&x.close>=p.open;
  if(bias==='SHORT')return p.close>p.open&&x.close<x.open&&x.open>=p.close&&x.close<=p.open;
  return false;
}
function rejectionCandle(c,bias){
  if(!c.length)return false;
  const x=c.at(-1),range=x.high-x.low;if(!range)return false;
  const upper=x.high-Math.max(x.open,x.close),lower=Math.min(x.open,x.close)-x.low;
  return bias==='LONG'?(lower/range>=.45&&x.close>x.low+range*.55):(upper/range>=.45&&x.close<x.high-range*.55);
}
function msnrLevels(c,bias){
  const st=marketStructure(c),levels=[],last=c.at(-1)?.close;
  const source=bias==='LONG'?st.lows:st.highs;
  for(const x of source.slice(-10)){
    if(!((bias==='LONG'&&x.p<last)||(bias==='SHORT'&&x.p>last)))continue;
    const prior=c.slice(x.i+1,-1);
    const touched=prior.some(k=>bias==='LONG'?k.low<=x.p:k.high>=x.p);
    if(!touched)levels.push({level:x.p,index:x.i,type:bias==='LONG'?'SUPPORT':'RESISTANCE'});
  }
  const oppositeSource=bias==='LONG'?st.highs:st.lows;
  for(const x of oppositeSource.slice(-10)){
    const later=c.slice(x.i+1),flipIndex=later.findIndex(k=>bias==='LONG'?k.close>x.p:k.close<x.p);
    if(flipIndex<0)continue;
    const absoluteFlip=x.i+1+flipIndex;
    if(!((bias==='LONG'&&last>x.p)||(bias==='SHORT'&&last<x.p)))continue;
    const retest=c.slice(absoluteFlip+1,-1).some(k=>bias==='LONG'?k.low<=x.p:k.high>=x.p);
    if(!retest)levels.push({level:x.p,index:absoluteFlip,type:bias==='LONG'?'RBS':'SBR'});
  }
  for(let i=Math.max(1,c.length-30);i<c.length-1;i++){
    const a=c[i],b=c[i+1],overlapLow=Math.max(a.low,b.low),overlapHigh=Math.min(a.high,b.high);
    if(overlapLow<overlapHigh){
      const level=(overlapLow+overlapHigh)/2,prior=c.slice(i+2,-1);
      const tested=prior.some(k=>bias==='LONG'?k.low<=overlapHigh:k.high>=overlapLow);
      if(!tested)levels.push({level,index:i,type:'KISSING CANDLE BASE'});
    }
  }
  return levels.filter(x=>Number.isFinite(x.level)&&c.length-1-x.index<=80).sort((a,b)=>Math.abs(last-a.level)-Math.abs(last-b.level));
}
function msnrFormation(c,bias){
  if(c.length<6)return null;
  const x=c.at(-1),range=Math.max(x.high-x.low,1e-12);
  const v=bias==='LONG'&&x.close>x.open&&x.low<=Math.min(...c.slice(-6,-1).map(k=>k.low))&&x.close>x.low+range*.55;
  const a=bias==='SHORT'&&x.close<x.open&&x.high>=Math.max(...c.slice(-6,-1).map(k=>k.high))&&x.close<x.high-range*.55;
  return v?'V FORMATION':a?'A FORMATION':null;
}
function quoteFresh(liveQuote,marketContext){
  const t=Date.parse(String(liveQuote?.time||''));
  if(!Number.isFinite(t))return false;
  const age=Date.now()-t;
  const maxAge=['forex','commodities','indices'].includes(marketContext)?10*60*1000:2*60*1000;
  return age>=-30000&&age<=maxAge;
}
function quoteConsistentWithCandle(livePrice,candle,a,marketContext){
  if(!Number.isFinite(livePrice)||!candle)return false;
  const range=Math.max(0,Number(candle.high)-Number(candle.low));
  const tolerance=Math.max(a*3,livePrice*(['forex','commodities','indices'].includes(marketContext)?0.01:0.03),range*1.5);
  return livePrice>=Number(candle.low)-tolerance&&livePrice<=Number(candle.high)+tolerance;
}
function liveQuoteUsable(quote){return Boolean(quote?.tradeable);}
function strategyPlan(candlesByTf,strategy,instrumentSymbol,executionTimeframe,marketContext='',liveQuote=null){
  const key=normalizeStrategy(strategy),info=STRATEGIES[key],tf=strategyTimeframes(executionTimeframe,key);
  if((key==='TOP_DOWN'||key==='MSNR')&&(tf.bias===executionTimeframe))throw Object.assign(new Error('This strategy requires a higher-timeframe directional context. Select a lower execution timeframe.'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});
  const rawCurrent=candlesByTf[tf.entry],rawStructure=candlesByTf[tf.structure]||rawCurrent,rawBiasCandles=candlesByTf[tf.bias]||rawStructure;
  if(!rawCurrent?.length)throw new Error('Selected timeframe market data is unavailable');
  if(!marketDataFresh(rawCurrent,tf.entry,marketContext)||!marketDataFresh(rawStructure,tf.structure,marketContext)||!marketDataFresh(rawBiasCandles,tf.bias,marketContext))throw new Error('Market data is stale for the selected timeframe. No setup was issued.');
  const current=closedCandles(rawCurrent,tf.entry,marketContext),structure=closedCandles(rawStructure,tf.structure,marketContext),biasCandles=closedCandles(rawBiasCandles,tf.bias,marketContext);
  if(!current?.length||!structure?.length||!biasCandles?.length)throw new Error('No completed candle is available for the selected timeframe');
  const liveMid=Number(liveQuote?.mid??rawCurrent.at(-1)?.close);
  if(!Number.isFinite(liveMid))throw new Error('Live market price is unavailable');
  const quoteIsUsable=Boolean(liveQuote?.tradeable)&&liveQuoteUsable(liveQuote);
  const consistencyAtr=atr(current,14);
  if(quoteIsUsable&&!quoteConsistentWithCandle(liveMid,current.at(-1),consistencyAtr,marketContext)){
    throw Object.assign(new Error('Live market price is inconsistent with the latest candle data. No setup was issued.'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  }
  const last=current.at(-1),closes=current.map(x=>x.close).filter(Number.isFinite),a=atr(current,14);
  if(!last||closes.length<2||!Number.isFinite(a)){throw Object.assign(new Error('Market data does not contain enough valid OHLC candles for the selected timeframe.'),{code:'MARKET_DATA_INSUFFICIENT_CANDLES'})}
  const higherStructure=marketStructure(biasCandles),selectedStructure=marketStructure(structure),entryStructure=marketStructure(current);
  const higherBias=structureBias(higherStructure),selectedBias=structureBias(selectedStructure);
  // Direction is strategy-specific. Higher-timeframe structure is a filter for
  // continuation models, not a universal signal generator.
  let bias=(key==='LIQUIDITY_REVERSAL'||key==='CRT')?'WAIT':higherBias;
  // HTF direction remains the preferred filter, but a neutral HTF must not make
  // lower-timeframe strategies permanently dead. Fall back to confirmed local structure.
  if(bias==='WAIT'&&!['TOP_DOWN'].includes(key)){
    bias=selectedBias!=='WAIT'?selectedBias:entryStructure.trend;
  }
  const livePrice=quoteIsUsable?(bias==='LONG'?Number(liveQuote.ask):bias==='SHORT'?Number(liveQuote.bid):liveMid):liveMid;
  if(!Number.isFinite(livePrice))throw new Error('Executable market price is unavailable');
  const evidence=[],failures=[]; let trade=null,orderType='NO_SETUP',entry=null,reason='';
  const validTrade=(t,tradeBias=bias,marketPrice=livePrice,tradeOrderType='')=>{
    if(!t||!Number.isFinite(t.entry)||t.entry<=0||!Number.isFinite(t.stop)||!Number.isFinite(t.target)||!Number.isFinite(t.rr)||t.rr<SETUP_MIN_RR)return false;
    if((tradeBias==='LONG'&&(t.stop>=t.entry||t.target<=t.entry))||(tradeBias==='SHORT'&&(t.stop<=t.entry||t.target>=t.entry)))return false;
    if(tradeOrderType==='LIMIT'&&Number.isFinite(marketPrice)){
      const maxPendingDistance=Math.min(a*2.5,marketPrice*.015);
      if((tradeBias==='LONG'&&t.entry>=marketPrice)||(tradeBias==='SHORT'&&t.entry<=marketPrice))return false;
      if(Math.abs(t.entry-marketPrice)>maxPendingDistance)return false;
      if((tradeBias==='LONG'&&t.target<=marketPrice)||(tradeBias==='SHORT'&&t.target>=marketPrice))return false;
    }
    if(tradeOrderType==='MARKET'&&!quoteIsUsable)return false;
    if(tradeOrderType==='MARKET'&&Number.isFinite(marketPrice)&&((tradeBias==='LONG'&&t.target<=marketPrice)||(tradeBias==='SHORT'&&t.target>=marketPrice)))return false;
    return true;
  };
  // A pending entry that is effectively at the live market is not a meaningful
  // LIMIT order. Promote it to MARKET when the live quote can pass the same
  // structural risk/target checks. This keeps LIMIT orders genuinely pending.
  const pendingTooClose=(candidateEntry,marketPrice)=>{
    if(!Number.isFinite(candidateEntry)||!Number.isFinite(marketPrice)||marketPrice<=0)return false;
    return Math.abs(candidateEntry-marketPrice)<=Math.max(a*.20,marketPrice*.0015);
  };
  const chooseExecution=(tradeBias,candidateEntry,zone,marketPrice=livePrice)=>{
    const t=evaluateTrade(current,tradeBias,candidateEntry,a,SETUP_MIN_RR);
    if(!t)return null;
    if(pendingTooClose(candidateEntry,marketPrice)){
      const mt=evaluateTrade(current,tradeBias,marketPrice,a,SETUP_MIN_RR);
      if(mt&&validTrade(mt,tradeBias,marketPrice,'MARKET'))return {trade:mt,entry:marketPrice,zone,orderType:'MARKET'};
    }
    if(validTrade(t,tradeBias,marketPrice,'LIMIT'))return {trade:t,entry:candidateEntry,zone,orderType:'LIMIT'};
    return null;
  };
  const chooseLimit=items=>{for(const x of items||[]){const candidate=chooseExecution(bias,x.entry,x.zone||null,livePrice);if(candidate)return candidate;}return null;};
  const chooseLimitForBias=(items,tradeBias,marketPrice)=>{for(const x of items||[]){const candidate=chooseExecution(tradeBias,x.mid,x,marketPrice);if(candidate)return candidate;}return null;};
  const chooseMarketFromZones=(items,tradeBias=bias)=>{for(const z of items||[]){if(!zoneTouchesCandle(current,z)||!zoneFreshBeforeCurrent(current,z,tradeBias))continue;const t=evaluateTrade(current,tradeBias,livePrice,a,SETUP_MIN_RR);if(validTrade(t,tradeBias,livePrice,'MARKET'))return {trade:t,entry:livePrice,zone:z,orderType:'MARKET'};}return null;};
  if(bias==='WAIT'&&key!=='LIQUIDITY_REVERSAL'&&key!=='CRT'){
    reason='No decisive higher-timeframe direction is present for this strategy.';
    evidence.push('Higher-timeframe structure is neutral.');
  } else if(key==='TOP_DOWN'){
    const middleBias=structureBias(selectedStructure),entryBias=structureBias(entryStructure);
    const alignedMiddle=middleBias===bias,alignedEntry=entryBias===bias||entryBias==='WAIT';
    const conflict=middleBias!=='WAIT'&&middleBias!==bias;
    const impulse=displacement(current,bias);
    const zones=entryZones(current,bias,livePrice,a,24);
    const z=chooseLimit(zones.map(x=>({entry:x.mid,zone:x})));
    const m=chooseMarketFromZones(zones,bias);
    // If price has already reached a still-fresh execution POI, execute at the
    // live quote; otherwise stage a limit at the untouched POI.
    if(!conflict&&alignedMiddle&&alignedEntry&&(m||z)){
      const chosen=m||z;trade=chosen.trade;entry=chosen.entry;orderType=chosen.orderType||'LIMIT';
    }
    reason=trade?'Higher-timeframe direction, structure and execution evidence are aligned.':'Waiting for aligned HTF structure plus a concrete execution condition.';
    evidence.push('Bias '+tf.bias+': '+higherBias+'.','Structure '+tf.structure+': '+middleBias+'.','Execution '+executionTimeframe+': '+entryBias+'.',impulse?'Execution displacement present.':'No execution displacement.');
  } else if(key==='PULLBACK'){
    const impulse=structureBreak(structure,bias,60,30);
    const zones=entryZones(current,bias,livePrice,a,36);
    // Pullback entries must be on the retracement side of current price.
    const z=chooseLimit(zones.map(x=>({entry:x.mid,zone:x})));
    const m=chooseMarketFromZones(zones,bias);
    const continuation=displacement(current,bias);
    // A pullback can be a pending limit while price is approaching the POI, or
    // a market execution when the current candle has reached a still-fresh POI
    // and the continuation evidence is present.
    if(impulse&&(z||m)){
      const chosen=m&&continuation?m:z;
      trade=chosen.trade;entry=chosen.entry;orderType=chosen.orderType||'LIMIT';
    }
    reason=trade?'A confirmed impulse is being followed by a valid retracement/continuation entry.':'Waiting for a confirmed impulse and a fresh, unmitigated pullback zone.';
    evidence.push(impulse?'Directional impulse confirmed.':'No qualifying directional impulse.',zones[0]?zones[0].type:'No fresh FVG/order block.',continuation?'Continuation displacement present.':'No continuation displacement.');
  } else if(key==='BREAKOUT'){
    const bos=structureBreak(current,bias,48,12);
    const fresh=Boolean(bos&&bos.breakIndex>=current.length-12);
    const breakCandle=fresh?current[bos.breakIndex]:null;
    const breakBody=breakCandle?Math.abs(breakCandle.close-breakCandle.open):0;
    const breakRange=breakCandle?breakCandle.high-breakCandle.low:0;
    const priorRanges=breakCandle?current.slice(Math.max(0,bos.breakIndex-6),bos.breakIndex).map(x=>x.high-x.low).filter(Number.isFinite):[];
    const avgPrior=priorRanges.length?sma(priorRanges,priorRanges.length):0;
    const closeThrough=Boolean(breakCandle&&((bias==='LONG'&&breakCandle.close>bos.level)||(bias==='SHORT'&&breakCandle.close<bos.level)));
    const decisive=Boolean(breakCandle&&breakRange>0&&breakBody>=breakRange*.55&&(!avgPrior||breakRange>=avgPrior*1.15));
    const stillAccepted=Boolean(breakCandle&&((bias==='LONG'&&last.close>bos.level)||(bias==='SHORT'&&last.close<bos.level)));
    // Breakout entries are tied to the broken structure level. Require a retest
    // after the break and enter at that validated level rather than at an arbitrary
    // distance from current price.
    const retested=Boolean(bos&&fresh&&current.slice(bos.breakIndex+1).some(x=>bias==='LONG'?x.low<=bos.level:x.high>=bos.level));
    const breakoutEntry=bos&&Number.isFinite(bos.level)?bos.level:null;
    const breakoutTrade=retested&&breakoutEntry!=null?evaluateTrade(current,bias,breakoutEntry,a,SETUP_MIN_RR):null;
    if(bos&&fresh&&closeThrough&&decisive&&stillAccepted&&breakoutTrade){
      if(validTrade(breakoutTrade,bias,livePrice,'MARKET')){
        const marketTrade={...breakoutTrade,entry:livePrice};
        const revalued=evaluateTrade(current,bias,livePrice,a,SETUP_MIN_RR);
        if(validTrade(revalued,bias,livePrice,'MARKET')){trade=revalued;entry=livePrice;orderType='MARKET';}
      }
      if(!trade&&validTrade(breakoutTrade,bias,livePrice,'LIMIT')){
        trade=breakoutTrade;entry=breakoutEntry;orderType='LIMIT';
      }
    }
    reason=trade?'A confirmed close through structure, displacement and continued acceptance are present.':'Waiting for a confirmed structural break with displacement and acceptance beyond the level.';
    evidence.push(bos?'BOS level '+roundPrice(bos.level)+'.':'No qualifying BOS.',closeThrough?'Break candle closed through the level.':'No confirmed close through structure.',decisive?'Break displacement confirmed.':'Break candle lacks decisive displacement.',stillAccepted?'Price remains accepted beyond the broken level.':'Price has returned through the broken level.');
  } else if(key==='SMC'){
    const sweepCandidates=[
      liquiditySweep(current,'LONG',24,12)?{bias:'LONG',sweep:liquiditySweep(current,'LONG',24,12)}:null,
      liquiditySweep(current,'SHORT',24,12)?{bias:'SHORT',sweep:liquiditySweep(current,'SHORT',24,12)}:null
    ].filter(Boolean);
    const selected=sweepCandidates.sort((x,y)=>y.sweep.index-x.sweep.index)[0];
    const smcBias=selected?.bias||bias;
    const sweep=selected?.sweep||null;
    const structureAligned=Boolean(higherBias!=='WAIT'&&smcBias===higherBias);
    const reclaim=Boolean(sweep&&((smcBias==='LONG'&&last.close>sweep.level)||(smcBias==='SHORT'&&last.close<sweep.level)));
    const bos=sweep?structureBreak(current,smcBias,60,12):null;
    const bosAfterSweep=Boolean(sweep&&bos&&bos.breakIndex>sweep.index);
    const disp=displacement(current,smcBias);
    const zones=entryZones(current,smcBias,livePrice,a,48);
    const z=chooseLimitForBias(zones,smcBias,livePrice);
    const m=chooseMarketFromZones(zones,smcBias);
    if(structureAligned&&sweep&&reclaim&&bosAfterSweep&&disp&&(m||z)){
      const chosen=m||z;trade=chosen.trade;entry=chosen.entry;orderType=chosen.orderType||'LIMIT';bias=smcBias;
    }
    reason=trade?'Liquidity sweep, reclaim, post-sweep displacement and BOS are confirmed with a fresh POI.':!structureAligned?'The SMC reversal leg conflicts with the higher-timeframe market structure. No counter-structure trade is issued.':'Waiting for the full SMC sequence: liquidity sweep → reclaim → displacement → BOS → fresh POI.';
    evidence.push(sweep?sweep.type+' confirmed.':'No qualifying liquidity sweep.',reclaim?'Sweep reclaimed.':'No reclaim.',bosAfterSweep?'BOS occurred after the sweep.':'No post-sweep BOS.',disp?'Displacement confirmed.':'No displacement.',zones[0]?zones[0].type:'No fresh POI.');
  } else if(key==='MSNR'){
    const levels=msnrLevels(biasCandles,bias);
    const level=levels.find(x=>Math.abs(livePrice-x.level)<=Math.min(a*3.0,livePrice*.004));
    const pendingLevel=levels.find(x=>bias==='LONG'?x.level<livePrice:x.level>livePrice);
    const formation=msnrFormation(current,bias);
    const bos=structureBreak(current,bias,30,10);
    const engulf=candleEngulfing(current,bias),reject=rejectionCandle(current,bias);
    const touched=Boolean(level&&last.low<=level.level&&last.high>=level.level);
    const confirmed=Boolean(level&&touched&&(formation||bos||engulf||reject));
    const levelEntry=level?.level;
    if(confirmed&&Number.isFinite(levelEntry)){
      const candidate=chooseExecution(bias,levelEntry,level,livePrice);
      if(candidate){trade=candidate.trade;entry=candidate.entry;orderType=candidate.orderType;}
    }
    reason=trade?'A fresh MSNR level has been reached and price has confirmed the reaction.':'Waiting for a fresh support/resistance level, reaction and lower-timeframe confirmation.';
    evidence.push(level?level.type+' at '+roundPrice(level.level)+'.':'No fresh MSNR level.',formation||'No V/A formation.',touched?'Level touched.':'Level not yet reached.',confirmed?'Reaction confirmation present.':'No valid reaction confirmation.');
  } else if(key==='PRICE_ACTION'){
    const swings=marketStructure(current);
    const candidateLevels=[
      ...swings.lows.slice(-6).map(x=>({level:x.p,type:'SWING LOW',index:x.i})),
      ...swings.highs.slice(-6).map(x=>({level:x.p,type:'SWING HIGH',index:x.i}))
    ].filter(x=>bias==='LONG'?x.level<=last.close:x.level>=last.close);
    const level=candidateLevels.sort((x,y)=>Math.abs(last.close-x.level)-Math.abs(last.close-y.level))[0];
    const engulf=candleEngulfing(current,bias),reject=rejectionCandle(current,bias);
    const touched=Boolean(level&&last.low<=level.level&&last.high>=level.level);
    const response=Boolean(engulf||reject);
    if(level&&Number.isFinite(level.level)&&(touched&&response || (!touched&&Math.abs(last.close-level.level)<=Math.min(a*3.0,last.close*.004)))){
      const candidate=chooseExecution(bias,level.level,level,livePrice);
      if(candidate){trade=candidate.trade;entry=candidate.entry;orderType=candidate.orderType;}
    }
    reason=trade?'Price interacted with a structurally relevant swing and produced directional candle confirmation.':'Waiting for price to reach a relevant structural swing and print rejection/engulfing confirmation.';
    evidence.push(level?level.type+' at '+roundPrice(level.level)+'.':'No directional swing level.',touched?'Swing level interacted with current candle.':'No swing interaction.',engulf?'Engulfing confirmation.':reject?'Rejection confirmation.':'No candle confirmation.');
  } else if(key==='LIQUIDITY_REVERSAL'){
    const longSweep=liquiditySweep(current,'LONG',24,8),shortSweep=liquiditySweep(current,'SHORT',24,8);
    const candidates=[longSweep?{bias:'LONG',sweep:longSweep}:null,shortSweep?{bias:'SHORT',sweep:shortSweep}:null].filter(Boolean);
    const selected=candidates.sort((x,y)=>y.sweep.index-x.sweep.index)[0];
    const reversalBias=selected?.bias||'WAIT',reversalSweep=selected?.sweep||null;
    const structureAligned=Boolean(higherBias!=='WAIT'&&reversalBias===higherBias);
    const reclaim=Boolean(reversalSweep&&((reversalBias==='LONG'&&last.close>reversalSweep.level)||(reversalBias==='SHORT'&&last.close<reversalSweep.level)));
    const disp=reversalBias!=='WAIT'&&displacement(current,reversalBias);
    const reversalBOS=reversalBias!=='WAIT'&&structureBreak(current,reversalBias,30,8);
    const bosAfterSweep=Boolean(reversalSweep&&reversalBOS&&reversalBOS.breakIndex>reversalSweep.index);
    // Reversal entries are tied back to the swept structure. After reclaim and
    // displacement, wait for price to retest that level instead of chasing the quote.
    const retest=Boolean(reversalSweep&&current.slice(reversalSweep.index+1).some(x=>reversalBias==='LONG'?x.low<=reversalSweep.level:x.high>=reversalSweep.level));
    const reversalEntry=reversalSweep?.level;
    const reversalTrade=structureAligned&&reversalSweep&&reclaim&&disp&&bosAfterSweep&&retest&&Number.isFinite(reversalEntry)?evaluateTrade(current,reversalBias,reversalEntry,a,SETUP_MIN_RR):null;
    if(structureAligned&&reversalSweep&&reclaim&&disp&&bosAfterSweep&&retest&&reversalTrade){
      const mt=evaluateTrade(current,reversalBias,livePrice,a,SETUP_MIN_RR);
      if(mt&&validTrade(mt,reversalBias,livePrice,'MARKET')){trade=mt;entry=livePrice;orderType='MARKET';bias=reversalBias;}
      else if(validTrade(reversalTrade,reversalBias,livePrice,'LIMIT')){trade=reversalTrade;entry=reversalEntry;orderType='LIMIT';bias=reversalBias;}
    }
    reason=trade?'A liquidity sweep was rejected, reclaimed and followed by displacement plus reversal structure.':!structureAligned?'The reversal signal conflicts with the higher-timeframe market structure. No counter-structure trade is issued.':'Waiting for sweep → reclaim → displacement → reversal structure.';
    evidence.push(reversalSweep?reversalSweep.type+' confirmed.':'No genuine liquidity sweep.',reclaim?'Sweep level reclaimed.':'No reclaim.',bosAfterSweep?'Reversal BOS confirmed after sweep.':'No post-sweep reversal BOS.',disp?'Displacement confirmed.':'No displacement.');
  } else if(key==='CRT'){
    // CRT uses a completed higher-timeframe parent range, then a lower-timeframe
    // sweep/reclaim. A parent is eligible only while later closed HTF candles
    // have not already taken either side of its range.
    let parent=null,parentIndex=-1;
    for(let i=structure.length-1;i>=Math.max(0,structure.length-12);i--){
      const candidate=structure[i];
      if(!candidate||!Number.isFinite(candidate.high)||!Number.isFinite(candidate.low)||candidate.high<=candidate.low)continue;
      const later=structure.slice(i+1);
      const invalidated=later.some(x=>x.high>=candidate.high||x.low<=candidate.low);
      if(!invalidated){parent=candidate;parentIndex=i;break;}
    }

    const rangeHigh=parent?.high,rangeLow=parent?.low,mid=parent?((parent.high+parent.low)/2):null;
    let sweepIndex=-1,signal='WAIT',sweepExtreme=null,reclaimIndex=-1;

    if(parent&&Number.isFinite(rangeHigh)&&Number.isFinite(rangeLow)){
      const startTime=parent.time;
      for(let i=0;i<current.length;i++){
        if(current[i].time<=startTime)continue;
        const bullishSweep=current[i].low<rangeLow;
        const bearishSweep=current[i].high>rangeHigh;
        if(bullishSweep&&current[i].close>rangeLow){
          sweepIndex=i;reclaimIndex=i;signal='LONG';sweepExtreme=current[i].low;break;
        }
        if(bearishSweep&&current[i].close<rangeHigh){
          sweepIndex=i;reclaimIndex=i;signal='SHORT';sweepExtreme=current[i].high;break;
        }
        // Allow a one/two-candle reclaim after the sweep, but never accept a
        // candle that closes outside the parent range as a CRT confirmation.
        if(bullishSweep||bearishSweep){
          const side=bullishSweep?'LONG':'SHORT',extreme=side==='LONG'?current[i].low:current[i].high;
          for(let j=i+1;j<=Math.min(current.length-1,i+2);j++){
            if(side==='LONG'&&current[j].close>rangeLow&&current[j].close<rangeHigh){
              sweepIndex=i;reclaimIndex=j;signal='LONG';sweepExtreme=Math.min(extreme,...current.slice(i,j+1).map(x=>x.low));break;
            }
            if(side==='SHORT'&&current[j].close<rangeHigh&&current[j].close>rangeLow){
              sweepIndex=i;reclaimIndex=j;signal='SHORT';sweepExtreme=Math.max(extreme,...current.slice(i,j+1).map(x=>x.high));break;
            }
          }
          if(sweepIndex>=0)break;
        }
      }
    }

    const aligned=Boolean(signal!=='WAIT'&&(higherBias==='WAIT'||higherBias===signal));
    const reclaimCandle=reclaimIndex>=0?current[reclaimIndex]:null;
    const rangeWidth=Number.isFinite(rangeHigh)&&Number.isFinite(rangeLow)?rangeHigh-rangeLow:null;
    const beforeMid=Boolean(Number.isFinite(mid)&&Number.isFinite(livePrice)&&
      (signal==='LONG'?livePrice<mid:signal==='SHORT'?livePrice>mid:false));

    if(aligned&&reclaimCandle&&Number.isFinite(sweepExtreme)&&Number.isFinite(rangeWidth)&&rangeWidth>0&&beforeMid){
      const buffer=Math.max(a*.10,(signal==='LONG'?sweepExtreme:rangeHigh)*.0002);
      const crtStop=signal==='LONG'?sweepExtreme-buffer:sweepExtreme+buffer;
      const crtTarget=signal==='LONG'?rangeHigh:rangeLow;
      const crtEntry=signal==='LONG'?rangeLow:rangeHigh;
      const buildCrtTrade=(entryPrice)=>{
        const target=targetBeforeLiquidity(current,signal,crtTarget,entryPrice,a);
        const risk=Math.abs(entryPrice-crtStop);
        const rr=risk>0?Math.abs(target-entryPrice)/risk:0;
        if(!Number.isFinite(target)||!Number.isFinite(risk)||risk<=0||!Number.isFinite(rr))return null;
        return {entry:entryPrice,stop:crtStop,target,targetLiquidity:crtTarget,risk,rr};
      };
      const pending=buildCrtTrade(crtEntry);
      if(pending&&pendingTooClose(crtEntry,livePrice)){
        const mt=buildCrtTrade(livePrice);
        if(mt&&validTrade(mt,signal,livePrice,'MARKET')){
          trade=mt;entry=livePrice;orderType='MARKET';bias=signal;
        }
      } else if(pending&&validTrade(pending,signal,livePrice,'LIMIT')){
        trade=pending;entry=crtEntry;orderType='LIMIT';bias=signal;
      } else {
        const mt=buildCrtTrade(livePrice);
        if(mt&&validTrade(mt,signal,livePrice,'MARKET')){
          trade=mt;entry=livePrice;orderType='MARKET';bias=signal;
        }
      }
    }

    reason=trade
      ?'A completed CRT range was swept, reclaimed and remains in the entry half of the range.'
      :signal==='WAIT'
        ?'Waiting for a completed higher-timeframe range to be swept and reclaimed.'
        :!aligned
          ?'The CRT sweep conflicts with higher-timeframe market structure. No counter-structure trade is issued.'
          :!beforeMid
            ?'The CRT reclaim has already reached the range midpoint; the entry edge is gone.'
            :'Waiting for a valid CRT execution with sufficient structural room.';
    evidence.push(
      parent?'CRT range '+roundPrice(rangeLow)+' — '+roundPrice(rangeHigh)+'.':'No untouched higher-timeframe CRT range.',
      signal==='LONG'?'Sell-side range swept and reclaimed.':signal==='SHORT'?'Buy-side range swept and reclaimed.':'No qualifying CRT sweep/reclaim.',
      aligned?'CRT direction is compatible with higher-timeframe structure.':'CRT direction conflicts with higher-timeframe structure.',
      beforeMid?'Price remains in the entry half of the CRT range.':'Price has reached/passed the CRT midpoint.'
    );
  }
  // Strategy-preserving recovery: if the full pattern did not produce a trade,
  // give that same strategy one additional execution path using its own directional
  // evidence plus a real structural retracement zone. This does not manufacture a
  // signal, change the RR floor, or replace the strategy model.
  if(!trade){
    const fallbackBias=higherBias;
    const structuralZones=fallbackBias==='LONG'||fallbackBias==='SHORT'
      ?[...entryZones(current,fallbackBias,livePrice,a,72),...structuralEntryZones(current,fallbackBias,livePrice,a,48)]
      :[];
    let qualified=false;
    if(key==='TOP_DOWN')qualified=selectedBias===fallbackBias||selectedBias==='WAIT';
    else if(key==='PULLBACK')qualified=Boolean(structureBreak(structure,fallbackBias,80,45)||displacement(current,fallbackBias));
    else if(key==='BREAKOUT')qualified=Boolean(structureBreak(current,fallbackBias,60,24));
    else if(key==='SMC')qualified=Boolean(liquiditySweep(current,fallbackBias,30,18)||structureBreak(current,fallbackBias,60,24));
    else if(key==='MSNR')qualified=Boolean(msnrLevels(biasCandles,fallbackBias).length);
    else if(key==='PRICE_ACTION')qualified=Boolean(structureBreak(current,fallbackBias,40,20)||rejectionCandle(current,fallbackBias)||candleEngulfing(current,fallbackBias));
    else if(key==='LIQUIDITY_REVERSAL')qualified=Boolean(liquiditySweep(current,fallbackBias,30,12));
    else if(key==='CRT')qualified=false;
    if(qualified&&structuralZones.length){
      const limitCandidate=chooseLimitForBias(structuralZones,fallbackBias,livePrice);
      const marketCandidate=chooseMarketFromZones(structuralZones,fallbackBias);
      const chosen=marketCandidate||limitCandidate;
      if(chosen){
        trade=chosen.trade;entry=chosen.entry;orderType=chosen.orderType||'LIMIT';bias=fallbackBias;
        reason=info.name+' conditions support a structural execution zone with sufficient room for the risk model.';
        evidence.push('Structural execution recovery: '+chosen.zone?.type+'.');
      }
    }
  }
  const confidence=trade?Math.min(95,Math.max(38,Math.round(
    50+
    (key==='LIQUIDITY_REVERSAL'||key==='CRT'?0:(higherBias===bias?12:0))+
    (key==='TOP_DOWN'&&selectedBias===bias?8:0)+
    (['PULLBACK','BREAKOUT','SMC'].includes(key)&&displacement(current,bias)?8:0)+
    (['MSNR','PRICE_ACTION'].includes(key)&&(candleEngulfing(current,bias)||rejectionCandle(current,bias))?8:0)+
    (trade?.rr>=3?8:0)
  ))):0;
  if(!trade||!validTrade(trade,bias,livePrice,orderType)){for(const x of evidence)if(/No |Waiting|conflict/i.test(x))failures.push(x);return {strategy:key,strategyName:info.name,strategyShort:info.short,marketRegime:bias||'WAIT',strategyValid:false,strategyReady:false,strategyEvidence:evidence,strategyFailures:failures,strategyReason:reason||info.description,tradeReady:false,orderType:'NO_SETUP',entry:null,limitEntry:null,stopLoss:null,takeProfit1:null,takeProfit2:null,riskReward:'—',riskRewardValue:null,quality:'NO SETUP',setupStatus:'NO SETUP',setupReason:reason||'No strategy-valid setup is present.',bias,directionBias:bias,confidence,higherTimeframe:tf.bias,middleTimeframe:tf.structure,entryTimeframe:tf.entry};}
  const riskPct=entry>0?(trade.risk/entry)*100:null,stopDistance=Math.abs(entry-trade.stop),instrumentKey=String(instrumentSymbol||''),isForexInstrument=marketContext==='forex'||(marketContext===''&&(/^[A-Z]{6}$/.test(instrumentKey)||instrumentKey.includes('/')&&!instrumentKey.includes('USDT'))),priceUnitLabel=isForexInstrument?'pips':'price units',pipMultiplier=isForexInstrument?(instrumentKey.includes('JPY')?100:10000):1;
  return {strategy:key,strategyName:info.name,strategyShort:info.short,marketRegime:bias,strategyValid:true,strategyReady:true,strategyEvidence:evidence,strategyFailures:[],strategyReason:reason,entry:roundPrice(entry),limitEntry:orderType==='LIMIT'?roundPrice(entry):null,stopLoss:roundPrice(trade.stop),takeProfit1:roundPrice(trade.target),takeProfit2:null,riskReward:'1:'+Number(trade.rr).toFixed(2),riskRewardValue:Number(trade.rr.toFixed(2)),orderType,tradeReady:true,setupStatus:'TRADE READY',setupReason:reason,bias,directionBias:bias,confidence,riskPercent:riskPct!=null?Number(riskPct.toFixed(2)):null,stopDistance:roundPrice(stopDistance),stopDistancePct:entry?Number((stopDistance/entry*100).toFixed(3)):null,stopDistanceUnits:Number((stopDistance*pipMultiplier).toFixed(2)),priceUnitLabel,structuralInvalidation:roundPrice(trade.stop),marketEntry:roundPrice(livePrice),price:roundPrice(livePrice),liquidityTarget:roundPrice(trade.targetLiquidity),liquidityType:'STRUCTURAL LIQUIDITY',liquidityTouches:0,liquidityDistancePct:Number((Math.abs((trade.targetLiquidity??trade.target)-entry)*100/entry).toFixed(2)),liquidityReason:'Target is derived from a qualified structural/liquidity level.',confirmation:{
      bos:['BREAKOUT','SMC','TOP_DOWN','PULLBACK'].includes(key)?Boolean(structureBreak(current,bias,48,12)):false,
      sweep:['SMC','LIQUIDITY_REVERSAL'].includes(key)?Boolean(liquiditySweep(current,bias,20,12)):false,
      displacement:['BREAKOUT','SMC','LIQUIDITY_REVERSAL','PULLBACK'].includes(key)?Boolean(displacement(current,bias)):false,
      engulfing:['MSNR','PRICE_ACTION'].includes(key)?Boolean(candleEngulfing(current,bias)):false,
      rejection:['MSNR','PRICE_ACTION'].includes(key)?Boolean(rejectionCandle(current,bias)):false,
      strategy:key
    },higherTimeframe:tf.bias,middleTimeframe:tf.structure,entryTimeframe:tf.entry,timestamp:last.time};
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{if(String(req.query?.action||'')==='header'){const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear',{headers:{Accept:'application/json'}});if(!r.ok)return json(res,502,{error:'Bybit ticker provider unavailable'});const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list))return json(res,502,{error:body?.retMsg||'Bybit ticker provider unavailable'});const wanted=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT']);const result=body.result.list.filter(x=>wanted.has(x.symbol)).map(x=>({symbol:x.symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt}));return json(res,200,{ok:true,result});} const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');if(req.query?.action==='instruments'){
      if(market==='commodities'||market==='indices'||market==='forex'){
        const query=String(req.query?.q||'').trim().toUpperCase();
        const instruments=yahooInstruments(market).filter(x=>!query||`${x.symbol} ${x.name}`.toUpperCase().includes(query));
        return json(res,200,{ok:true,instruments});
      }
      if(market==='perpetual'||market==='crypto'){
        // Keep the full live Bybit perpetual catalogue in the picker, but cache the
        // paginated discovery so opening the Crypto tab does not repeatedly hit Bybit.
        const instruments=await getBybitPerpetualInstruments();
        return json(res,200,{ok:true,instruments});
      }
      return json(res,400,{error:'Instrument discovery is only available for Forex, Commodities, Indices, or Crypto'});
    }if(!['forex','crypto','perpetual','commodities','indices'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});if(market==='forex'&&!/^[A-Z]{3}\/?[A-Z]{3}$/.test(symbol))return json(res,400,{error:'Invalid Forex symbol'});
if((market==='crypto'||market==='perpetual')&&!/^[A-Z0-9]+(?:\/USDT)?$/.test(symbol))return json(res,400,{error:'Invalid crypto symbol'});
  const strategy=normalizeStrategy(req.query?.strategy);
  const context=strategyTimeframes(timeframe,strategy);
  const needed=[...new Set([context.entry,context.structure,context.bias])];
  const fetched=await Promise.all(needed.map(async tf=>[tf,await candlesFor(market,symbol,tf)]));
  const candlesByTf=Object.fromEntries(fetched);
  const liveQuote=(['forex','commodities','indices'].includes(market))?await yahooPrice(symbol,market):await bybitPrice(symbol.replace(/[^A-Z0-9]/gi,''));
  if(liveQuote?.marketState==='closed')throw Object.assign(new Error('Market is currently closed.'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  if(!quoteFresh(liveQuote,market))throw Object.assign(new Error('Live market quote is stale. No setup was issued.'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
  const setup=strategyPlan(candlesByTf,strategy,symbol,timeframe,market,liveQuote);
  const confidenceBase=Number(setup.confidence),finalConfidence=setup.tradeReady?Math.min(95,Math.max(35,Number.isFinite(confidenceBase)?Math.round(confidenceBase):35)):0;
  const confluenceCandles={
    bias:closedCandles(candlesByTf[context.bias]||candlesByTf[context.entry],context.bias,market),
    structure:closedCandles(candlesByTf[context.structure]||candlesByTf[context.entry],context.structure,market),
    entry:closedCandles(candlesByTf[context.entry],context.entry,market)
  };
  return json(res,200,{ok:true,market,symbol,timeframe,strategy,strategyInfo:STRATEGIES[strategy],setup:{...setup,confidence:finalConfidence},quote:liveQuote?{bid:liveQuote.bid,ask:liveQuote.ask,mid:liveQuote.mid,spread:liveQuote.spread,time:liveQuote.time,instrument:liveQuote.instrument?.name||null}:null,confluence:[
    {timeframe:context.bias,bias:structureBias(marketStructure(confluenceCandles.bias)),role:'CONTEXT',confidence:finalConfidence},
    {timeframe:context.structure,bias:structureBias(marketStructure(confluenceCandles.structure)),role:'STRUCTURE',confidence:finalConfidence},
    {timeframe:context.entry,bias:structureBias(marketStructure(confluenceCandles.entry)),role:'OPPORTUNITY',confidence:finalConfidence}
  ],aligned:setup.tradeReady?3:0,totalTimeframes:3,source:['forex','commodities','indices'].includes(market)?'Yahoo Finance':'Bybit linear perpetuals',generatedAt:new Date().toISOString()})
}catch(e){const code=e?.code||'',status=code==='AUTH_REQUIRED'||code==='AUTH_INVALID'?401:code==='ACCESS_EXPIRED'?403:['MARKET_DATA_INSTRUMENT_UNAVAILABLE','MARKET_DATA_PRICE_UNAVAILABLE','MARKET_DATA_INSUFFICIENT_CANDLES','MARKET_DATA_REQUEST_FAILED'].includes(code)?503:500;return json(res,status,{ok:false,error:e?.message||'Market analysis failed',code:code||'MARKET_ERROR'})}}