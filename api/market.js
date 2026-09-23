import { authenticate, requireActiveAccess } from '../server/access.js';
import { twelveCandles, twelvePrice, twelveInstrumentSnapshot, resolveTwelveSymbol } from './twelvedata.js';
import { yahooCandles, yahooPrice, yahooInstruments } from '../server/yahooMarket.js';
const TIMEFRAME_MAP={'1m':{forex:'1m',twelvedata:'1m',crypto:'1m'},'5m':{forex:'5m',twelvedata:'5m',crypto:'5m'},'15m':{forex:'15m',twelvedata:'15m',crypto:'15m'},'30m':{forex:'30m',twelvedata:'30m',crypto:'30m'},'1H':{forex:'1h',twelvedata:'1h',crypto:'1h'},'4H':{forex:'4h',twelvedata:'4h',crypto:'4h'},'1D':{forex:'1d',twelvedata:'1d',crypto:'1d'},'1W':{forex:'1wk',twelvedata:'1wk',crypto:'1w'}};
const TIMEFRAME_ORDER=['1m','5m','15m','30m','1H','4H','1D','1W'];
function adjacentTimeframe(tf,steps=1){const i=Math.max(0,TIMEFRAME_ORDER.indexOf(tf));return TIMEFRAME_ORDER[Math.min(TIMEFRAME_ORDER.length-1,i+steps)]||'1H';}
function strategyTimeframes(tf,strategy){
  const higher=adjacentTimeframe(tf,1),higher2=adjacentTimeframe(tf,2);
  switch(normalizeStrategy(strategy)){
    case 'TOP_DOWN': return {entry:tf,structure:higher,bias:higher2};
    case 'PULLBACK': return {entry:tf,structure:tf,bias:higher};
    case 'BREAKOUT': return {entry:tf,structure:tf,bias:higher};
    case 'SMC': return {entry:tf,structure:tf,bias:higher};
    case 'MSNR': return {entry:tf,structure:higher,bias:higher2};
    case 'PRICE_ACTION': return {entry:tf,structure:tf,bias:higher};
    case 'LIQUIDITY_REVERSAL': return {entry:tf,structure:tf,bias:higher};
    case 'CRT': return {entry:tf,structure:tf,bias:higher};
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
async function fetchBybit(symbol,timeframe){const r=await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${BYBIT_INTERVAL[timeframe]}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Bybit returned ${r.status}`);const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)throw new Error(body?.retMsg||'Bybit returned no perpetual candles');return normalize(body.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function candlesFor(market,symbol,timeframe){const sourceKey=['commodities','indices'].includes(market)?'twelvedata':market==='forex'?'forex':'crypto';const mapped=TIMEFRAME_MAP[timeframe]?.[sourceKey];if(!mapped)throw new Error('Unsupported timeframe');if(['forex','commodities','indices'].includes(market)){const result=await yahooCandles(symbol,timeframe,market);return normalize(result.rows)}const clean=symbol.replace(/[^A-Z0-9]/gi,'');if(market==='perpetual'||market==='crypto')return fetchBybit(clean,timeframe);throw new Error('Unsupported market data source')}
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
  if(bias==='LONG'){const ref=st.lows.filter(x=>x.i>=start&&x.i<c.length-2).at(-1);if(ref){for(let i=ref.i+1;i<c.length;i++){if(i<recentStart)continue;if(c[i].low<ref.p&&c[i].close>ref.p)return {type:'SELL-SIDE SWEEP',level:ref.p,index:i};}}}
  if(bias==='SHORT'){const ref=st.highs.filter(x=>x.i>=start&&x.i<c.length-2).at(-1);if(ref){for(let i=ref.i+1;i<c.length;i++){if(i<recentStart)continue;if(c[i].high>ref.p&&c[i].close<ref.p)return {type:'BUY-SIDE SWEEP',level:ref.p,index:i};}}}
  return null;
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
function entryZones(c,bias,current,a,maxAge=24){
  const zones=[...fairValueGaps(c,bias),...orderBlockCandidates(c,bias)].filter(z=>z.index<c.length-2);
  const maxDistance=Math.max(a*2.25,current*.0125);
  return zones.filter(z=>{
    const ahead=bias==='LONG'?z.mid<current:z.mid>current;
    const age=c.length-1-z.index;
    const distance=Math.abs(current-z.mid);
    return ahead&&age<=maxAge&&distance<=maxDistance&&zoneIsUnmitigated(c,z,bias);
  }).sort((x,y)=>Math.abs(current-x.mid)-Math.abs(current-y.mid));
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
  const maxRisk=Math.max(a*2.2,entry*.025);
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
  const maxDistance=Math.max(a*8,entry*.04);
  return [...new Set([...structural,...extremes])]
    .filter(level=>Number.isFinite(level))
    .filter(level=>bias==='LONG'?level>entry&&level-entry<=maxDistance:level<entry&&entry-level<=maxDistance)
    .sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function evaluateTrade(c,bias,entry,a,minRR=2.25){
  const stop=stopForEntry(c,bias,entry,a),risk=Math.abs(entry-stop),minimumRisk=Math.max(a*.65,entry*.001);
  if(!Number.isFinite(entry)||entry<=0||!Number.isFinite(stop))return null;
  if((bias==='LONG'&&stop>=entry)||(bias==='SHORT'&&stop<=entry))return null;
  if(!risk||risk<minimumRisk)return null;
  const pools=targetPool(c,bias,entry,a);
  const buffer=Math.max(a*.08,entry*.00015);
  const candidates=pools.map(level=>{
    const target=bias==='LONG'?level-buffer:level+buffer;
    const reward=Math.abs(target-entry);
    return {level,target,reward,rr:reward/risk};
  }).filter(x=>Number.isFinite(x.target)&&x.rr>=minRR);
  if(!candidates.length)return null;
  const chosen=candidates[0];
  const target2Candidate=pools.slice(1).map(level=>{
    const target=bias==='LONG'?level-buffer:level+buffer;
    return {level,target,rr:Math.abs(target-entry)/risk};
  }).filter(x=>bias==='LONG'?x.target>entry:x.target<entry).find(x=>x.rr>chosen.rr&&Math.abs(x.target-chosen.target)>a*.3);
  return {
    entry,
    stop,
    risk,
    target:chosen.target,
    targetLiquidity:chosen.level,
    target2:target2Candidate?.target??null,
    target2Liquidity:target2Candidate?.level??null,
    rr:chosen.rr
  };
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
  if((risingHighs&&risingLows)||bullishBreak)trend='LONG';
  else if((fallingHighs&&fallingLows)||bearishBreak)trend='SHORT';
  else if(higherHigh&&higherLow)trend='LONG';
  else if(lowerHigh&&lowerLow)trend='SHORT';
  return {
    trend,higherHigh,higherLow,lowerHigh,lowerLow,risingHighs,risingLows,fallingHighs,fallingLows,
    bullishBreak,bearishBreak,lastHigh:lastH,lastLow:lastL,
    protectedHigh:trend==='SHORT'?(prevH??lastH):lastH,
    protectedLow:trend==='LONG'?(prevL??lastL):lastL,
    highs,lows
  };
}
function structureBias(st){return st.trend==='LONG'||st.trend==='SHORT'?st.trend:'WAIT'}
function opposite(a,b){return (a==='LONG'&&b==='SHORT')||(a==='SHORT'&&b==='LONG')}
const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',short:'HTF structure first',description:'Starts with higher-timeframe structure, then requires the middle and execution layers to provide a tradable confirmation.',objective:'Trade only when the higher-timeframe storyline and a current execution condition agree.',rules:['Higher timeframe establishes direction.','Middle timeframe confirms or exposes a hard conflict.','Execution timeframe supplies a current market or fresh limit entry.','No synthetic levels when the required evidence is missing.']},
  PULLBACK:{name:'Pullback',short:'Impulse → retracement → continuation',description:'Waits for a real directional impulse, then looks for a fresh FVG or order block retracement that remains valid inside the higher-timeframe direction.',objective:'Enter continuation after price retraces into a qualified, still-live execution zone.',rules:['HTF direction must be established.','A recent directional impulse must exist.','Price must be retracing into a fresh FVG or order block.','The zone must be unmitigated, close enough to execute and offer at least 2.25R.','A broken or stale zone is rejected.']},
  BREAKOUT:{name:'Breakout',short:'Close → displacement → continuation',description:'Requires a structural level to break with a decisive candle close and displacement. Wick-only breaks are rejected.',objective:'Participate only after price proves acceptance beyond a meaningful structure level.',rules:['HTF direction must support the break.','A recent BOS must be present.','The break must have decisive displacement, not a wick-only breach.','The current price must remain close enough to the confirmed break leg for execution.','Insufficient RR or stale breaks are rejected.']},
  SMC:{name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a Smart Money Concepts sequence: liquidity sweep, displacement, break of structure and a fresh FVG/order-block point of interest.',objective:'Trade the post-liquidity repricing leg rather than guessing direction before the displacement.',rules:['HTF direction is the directional filter.','A meaningful opposing liquidity pool must be swept and reclaimed.','Displacement must follow the sweep.','BOS/structure confirmation must be present.','Entry must use a fresh FVG or order block when price is away from the immediate execution point.']},
  MSNR:{name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Malaysian Support and Resistance framework: higher-timeframe storyline, fresh key levels, V/A formations, SBR/RBS flips and kissing-candle base zones, followed by lower-timeframe confirmation.',objective:'Wait for price to return to a fresh MSNR level and prove the reaction before execution.',rules:['Daily/4H storyline establishes the directional context.','Fresh, unmitigated support/resistance must be identified.','SBR/RBS flips and V/A turning structures are treated as level evidence.','Kissing-candle overlap can define the reaction base.','A tap alone is not an entry; lower-timeframe BOS or engulfing confirmation is required.','If the level is stale, already mitigated or lacks confirmation, no setup is issued.']},
  PRICE_ACTION:{name:'Price Action',short:'Structure + candle confirmation',description:'Focuses on market structure, rejection and engulfing behaviour without requiring an SMC-specific liquidity sequence.',objective:'Use clean structural price action to confirm continuation or reversal at a meaningful level.',rules:['HTF structure provides the directional context.','Price must interact with a meaningful recent swing or zone.','A clear rejection or engulfing confirmation is required.','The invalidation must sit beyond the structure being traded.','Target must be a real structural/liquidity level with at least 2.25R.']},
  LIQUIDITY_REVERSAL:{name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Targets reversals only after price takes a recent swing/liquidity level and closes back through it with displacement.',objective:'Avoid catching falling knives by waiting for the sweep and reclaim to become observable evidence.',rules:['A recent swing high/low must be swept.','Price must reclaim the swept level.','Displacement must confirm the reversal leg.','The stop belongs beyond the swept structure.','No reversal setup is issued without a genuine sweep.']},
  CRT:{name:'CRT',short:'Candle range → sweep → reclaim',description:'Candle Range Theory setup model: use a completed candle range, wait for one side to be taken, then require a reclaim back through the range before targeting the opposite side.',objective:'Trade a confirmed range expansion and return rather than entering on an unconfirmed wick.',rules:['Use a completed reference candle on the selected timeframe.','One side of that range must be swept.','Price must reclaim back through the range midpoint.','The sweep extreme defines invalidation.','The opposite side of the range must support the risk model and minimum 2.25R.']}
};
const STRATEGY_KEYS=new Set(Object.keys(STRATEGIES));
function normalizeStrategy(v){const key=String(v||'TOP_DOWN').toUpperCase();return STRATEGY_KEYS.has(key)?key:'TOP_DOWN'}
const CANDLE_INTERVAL_MS={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000,'1wk':604800000,'1w':604800000,'1H':3600000,'4H':14400000,'1D':86400000,'1W':604800000};
function closedCandles(c,timeframe,market=''){
  if(!Array.isArray(c)||c.length<2)return [];
  // Twelve Data's OHLC normalizer already removes bars marked isOpen:true.
  // Twelve Data returns completed OHLC bars; do not infer candle state from timestamps for these markets.
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
function strategyPlan(candlesByTf,strategy,instrumentSymbol,executionTimeframe,marketContext='',liveQuote=null){
  const key=normalizeStrategy(strategy),info=STRATEGIES[key],tf=strategyTimeframes(executionTimeframe,key);
  if((key==='TOP_DOWN'||key==='MSNR')&&(tf.structure===executionTimeframe||tf.bias===executionTimeframe))throw new Error('This strategy requires distinct higher-timeframe structure; the selected timeframe is too high.');
  const rawCurrent=candlesByTf[tf.entry],rawStructure=candlesByTf[tf.structure]||rawCurrent,rawBiasCandles=candlesByTf[tf.bias]||rawStructure;
  if(!rawCurrent?.length)throw new Error('Selected timeframe market data is unavailable');
  if(!marketDataFresh(rawCurrent,tf.entry,marketContext)||!marketDataFresh(rawStructure,tf.structure,marketContext)||!marketDataFresh(rawBiasCandles,tf.bias,marketContext))throw new Error('Market data is stale for the selected timeframe. No setup was issued.');
  const current=closedCandles(rawCurrent,tf.entry,marketContext),structure=closedCandles(rawStructure,tf.structure,marketContext),biasCandles=closedCandles(rawBiasCandles,tf.bias,marketContext);
  if(!current?.length||!structure?.length||!biasCandles?.length)throw new Error('No completed candle is available for the selected timeframe');
  const liveMid=Number(liveQuote?.mid??rawCurrent.at(-1)?.close);
  if(!Number.isFinite(liveMid))throw new Error('Live market price is unavailable');
  const last=current.at(-1),closes=current.map(x=>x.close).filter(Number.isFinite),a=atr(current,14);
  if(!last||closes.length<2||!Number.isFinite(a)){throw Object.assign(new Error('Market data does not contain enough valid OHLC candles for the selected timeframe.'),{code:'MARKET_DATA_INSUFFICIENT_CANDLES'})}
  const higherStructure=marketStructure(biasCandles),selectedStructure=marketStructure(structure),entryStructure=marketStructure(current);
  const higherBias=structureBias(higherStructure),selectedBias=structureBias(selectedStructure);
  // Direction is strategy-specific. Higher-timeframe structure is a filter for
  // continuation models, not a universal signal generator.
  let bias=(key==='LIQUIDITY_REVERSAL'||key==='CRT')?'WAIT':higherBias;
  const liveQuoteUsable=Boolean(liveQuote?.tradeable);
  const livePrice=liveQuoteUsable?(bias==='LONG'?Number(liveQuote.ask):bias==='SHORT'?Number(liveQuote.bid):liveMid):liveMid;
  if(!Number.isFinite(livePrice))throw new Error('Executable market price is unavailable');
  const evidence=[],failures=[]; let trade=null,orderType='NO_SETUP',entry=null,reason='';
  const validTrade=(t,tradeBias=bias,marketPrice=livePrice,tradeOrderType='')=>{
    if(!t||!Number.isFinite(t.entry)||t.entry<=0||!Number.isFinite(t.stop)||!Number.isFinite(t.target)||!Number.isFinite(t.rr)||t.rr<2.25)return false;
    if((tradeBias==='LONG'&&(t.stop>=t.entry||t.target<=t.entry))||(tradeBias==='SHORT'&&(t.stop<=t.entry||t.target>=t.entry)))return false;
    if(tradeOrderType==='LIMIT'&&Number.isFinite(marketPrice)&&((tradeBias==='LONG'&&t.entry>=marketPrice)||(tradeBias==='SHORT'&&t.entry<=marketPrice)))return false;
    if(tradeOrderType==='MARKET'&&!liveQuoteUsable)return false;
    if(tradeOrderType==='MARKET'&&Number.isFinite(marketPrice)&&((tradeBias==='LONG'&&t.target<=marketPrice)||(tradeBias==='SHORT'&&t.target>=marketPrice)))return false;
    return true;
  };
  const chooseLimit=items=>{for(const x of items||[]){const t=evaluateTrade(current,bias,x.entry,a,2.25);if(validTrade(t,bias,livePrice,'LIMIT'))return {trade:t,entry:x.entry};}return null;};
  if(bias==='WAIT'&&key!=='LIQUIDITY_REVERSAL'&&key!=='CRT'){reason='No decisive directional structure is present for the selected strategy and timeframe.';evidence.push('No clear directional structure.');}
  else if(key==='TOP_DOWN'){
    const middleBias=structureBias(selectedStructure),entryBias=structureBias(entryStructure),conflict=middleBias!=='WAIT'&&opposite(bias,middleBias),confirmed=entryBias===bias||entryBias==='WAIT';
    const marketTrade=evaluateTrade(current,bias,livePrice,a,2.25);
    if(!conflict&&confirmed){if(marketTrade&&displacement(current,bias)){trade=marketTrade;entry=livePrice;orderType='MARKET';}else{const z=chooseLimit(entryZones(current,bias,livePrice,a,36).map(x=>({entry:x.mid,zone:x})));if(z){trade=z.trade;entry=z.entry;orderType='LIMIT';}}}
    reason=trade?'Top-Down context agrees with the selected timeframe and a valid execution plan is available.':'Waiting for higher-timeframe direction, aligned structure and a real execution level.';
    evidence.push('Bias timeframe '+tf.bias+': '+higherBias+'.','Structure timeframe '+tf.structure+': '+middleBias+'.','Selected '+executionTimeframe+' execution: '+entryBias+'.',conflict?'Structure conflicts with higher-timeframe direction.':'Structure does not conflict.');
  } else if(key==='PULLBACK'){
    const impulse=structureBreak(structure,bias,48,24),zones=entryZones(current,bias,livePrice,a,40),z=chooseLimit(zones.map(x=>({entry:x.mid,zone:x}))),marketTrade=evaluateTrade(current,bias,livePrice,a,2.25);
    if(impulse&&z){trade=z.trade;entry=z.entry;orderType='LIMIT';}else if(impulse&&marketTrade&&displacement(current,bias)){trade=marketTrade;entry=livePrice;orderType='MARKET';}
    reason=trade?'A directional impulse and executable retracement are present on the selected timeframe.':'Waiting for a real impulse followed by a fresh executable pullback.';evidence.push(impulse?'Directional impulse confirmed.':'No qualifying impulse.',zones[0]?.type||'No fresh FVG/order block.');
  } else if(key==='BREAKOUT'){
    const bos=structureBreak(current,bias,48,12),disp=displacement(current,bias),fresh=Boolean(bos&&bos.breakIndex>=current.length-12),marketTrade=evaluateTrade(current,bias,livePrice,a,2.25);
    if(bos&&fresh&&disp&&marketTrade){trade=marketTrade;entry=livePrice;orderType='MARKET';}else if(bos&&fresh){const t=evaluateTrade(current,bias,bos.level,a,2.25);if(validTrade(t,bias,livePrice,'LIMIT')){trade=t;entry=bos.level;orderType='LIMIT';}}
    reason=trade?'The selected timeframe has a confirmed structural breakout with displacement and a valid risk model.':'Waiting for a decisive close through structure with displacement; wick-only breaks are rejected.';evidence.push(bos?'BOS detected.':'No recent BOS.',disp?'Displacement confirmed.':'No displacement.',fresh?'Break is fresh.':'Break is stale.');
  } else if(key==='SMC'){
    const sweep=liquiditySweep(current,bias,20,12),disp=displacement(current,bias),bos=structureBreak(current,bias,60,12),zones=entryZones(current,bias,livePrice,a,60),z=chooseLimit(zones.map(x=>({entry:x.mid,zone:x}))),marketTrade=evaluateTrade(current,bias,livePrice,a,2.25),reclaim=Boolean(sweep&&((bias==='LONG'&&last.close>sweep.level)||(bias==='SHORT'&&last.close<sweep.level)));
    if(sweep&&reclaim&&disp&&bos&&z){trade=z.trade;entry=z.entry;orderType='LIMIT';}else if(sweep&&reclaim&&disp&&bos&&marketTrade){trade=marketTrade;entry=livePrice;orderType='MARKET';}
    reason=trade?'The selected timeframe completed the SMC sequence and has a valid point of interest.':'Waiting for liquidity sweep → displacement → BOS → fresh POI.';evidence.push(sweep?sweep.type+' confirmed.':'No qualifying liquidity sweep.',disp?'Displacement confirmed.':'No displacement.',bos?'BOS confirmed.':'No BOS.',zones[0]?.type||'No fresh POI.');
  } else if(key==='MSNR'){
    const levels=msnrLevels(biasCandles,bias),actionableLevels=levels.filter(x=>bias==='LONG'?x.level<livePrice:x.level>livePrice),level=actionableLevels.find(x=>Math.abs(livePrice-x.level)<=Math.max(a*2,livePrice*.0025)),formation=msnrFormation(current,bias),bos=structureBreak(current,bias,30,8),engulf=candleEngulfing(current,bias),reject=rejectionCandle(current,bias),levelProximity=Boolean(level&&Math.abs(last.close-level.level)<=Math.max(a*1.5,last.close*.002)),confirm=Boolean(levelProximity&&(bos||engulf||reject));
    // A limit entry must be on the executable side of the market: below current price for LONG, above current price for SHORT. A level on the wrong side is a target/resistance reference, not a pending limit entry.
    if(level&&confirm){const t=evaluateTrade(current,bias,level.level,a,2.25),nextOrderType=Math.abs(level.level-livePrice)<=a*.08?'MARKET':'LIMIT';if(validTrade(t,bias,livePrice,nextOrderType)){trade=t;entry=level.level;orderType=nextOrderType;}}
    reason=trade?'A strategy-valid MSNR level has been confirmed on the selected timeframe.':'Waiting for a fresh MSNR level and lower-timeframe confirmation.';evidence.push(level?level.type+' identified.':'No nearby qualified MSNR level.',formation||'No V/A formation.',confirm?'Confirmation present.':'No BOS, engulfing or rejection confirmation.');
  } else if(key==='PRICE_ACTION'){
    const swings=marketStructure(current),levels=[
      ...swings.highs.slice(-4).map(x=>({level:x.p,type:'SWING HIGH'})),
      ...swings.lows.slice(-4).map(x=>({level:x.p,type:'SWING LOW'}))
    ].filter(x=>Number.isFinite(x.level));
    const level=levels.sort((x,y)=>Math.abs(last.close-x.level)-Math.abs(last.close-y.level))[0];
    const engulf=candleEngulfing(current,bias),reject=rejectionCandle(current,bias);
    const levelProximity=Boolean(level&&Math.abs(last.close-level.level)<=Math.max(a*1.5,last.close*.002));
    const levelTouched=Boolean(level&&last.low<=level.level&&last.high>=level.level);
    if(level&&levelProximity&&levelTouched&&(engulf||reject)){
      const t=evaluateTrade(current,bias,livePrice,a,2.25);
      if(validTrade(t)){trade=t;entry=livePrice;orderType='MARKET';}
      else{const z=chooseLimit([{entry:level.level,zone:level}]);if(z){trade=z.trade;entry=z.entry;orderType='LIMIT';}}
    }
    reason=trade?'A structural swing and price-action confirmation are present on the selected timeframe.':'Waiting for a meaningful swing plus rejection or engulfing confirmation.';
    evidence.push(level?level.type+' identified.':'No meaningful swing level.',engulf?'Engulfing confirmation.':reject?'Rejection confirmation.':'No candle confirmation.');
  } else if(key==='LIQUIDITY_REVERSAL'){
    const longSweep=liquiditySweep(current,'LONG',20,8);
    const shortSweep=liquiditySweep(current,'SHORT',20,8);
    const candidates=[
      longSweep?{bias:'LONG',sweep:longSweep}:null,
      shortSweep?{bias:'SHORT',sweep:shortSweep}:null
    ].filter(Boolean);
    const selected=candidates.sort((x,y)=>y.sweep.index-x.sweep.index)[0];
    const reversalBias=selected?.bias||'WAIT';
    const reversalSweep=selected?.sweep||null;
    const reclaim=Boolean(reversalSweep&&((reversalBias==='LONG'&&last.close>reversalSweep.level)||(reversalBias==='SHORT'&&last.close<reversalSweep.level)));
    const disp=reversalBias!=='WAIT'&&displacement(current,reversalBias);
    const marketTrade=reversalBias!=='WAIT'?evaluateTrade(current,reversalBias,livePrice,a,2.25):null;
    if(reversalSweep&&reclaim&&disp&&marketTrade&&validTrade(marketTrade,reversalBias,livePrice,'MARKET')){
      trade=marketTrade;entry=livePrice;orderType='MARKET';bias=reversalBias;
    }
    reason=trade?'Liquidity was swept and reclaimed with displacement on the selected timeframe.':'Waiting for a genuine liquidity sweep, reclaim and displacement.';
    evidence.push(reversalSweep?reversalSweep.type+' confirmed.':'No genuine liquidity sweep.',reclaim?'Sweep level reclaimed.':'No reclaim.',disp?'Displacement confirmed.':'No displacement.');
  } else if(key==='CRT'){
    const ref=current.at(-2),x=last;
    const rangeHigh=ref?.high,rangeLow=ref?.low,mid=ref?((ref.high+ref.low)/2):null;
    const bullish=Boolean(ref&&x.low<rangeLow&&x.close>mid&&x.close>rangeLow);
    const bearish=Boolean(ref&&x.high>rangeHigh&&x.close<mid&&x.close<rangeHigh);
    const signal=bullish&&!bearish?'LONG':bearish&&!bullish?'SHORT':null;
    const crtTrade=signal?evaluateTrade(current,signal,livePrice,a,2.25):null;
    if(crtTrade&&validTrade(crtTrade,signal,livePrice,'MARKET')){trade=crtTrade;entry=livePrice;orderType='MARKET';bias=signal;}
    reason=trade?'CRT range sweep and reclaim are confirmed on the selected timeframe with a valid risk model.':'Waiting for a completed candle range to be swept and reclaimed with enough room for a valid target.';
    evidence.push(ref?'Reference range '+roundPrice(rangeLow)+' — '+roundPrice(rangeHigh)+'.':'No completed reference range.',bullish?'Sell-side range sweep reclaimed.':bearish?'Buy-side range sweep reclaimed.':'No qualifying range sweep.',mid!=null?'Midpoint '+roundPrice(mid)+'.':'No range midpoint.');
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
  return {strategy:key,strategyName:info.name,strategyShort:info.short,marketRegime:bias,strategyValid:true,strategyReady:true,strategyEvidence:evidence,strategyFailures:[],strategyReason:reason,entry:roundPrice(entry),limitEntry:orderType==='LIMIT'?roundPrice(entry):null,stopLoss:roundPrice(trade.stop),takeProfit1:roundPrice(trade.target),takeProfit2:roundPrice(trade.target2),riskReward:'1:'+Number(trade.rr).toFixed(2),riskRewardValue:Number(trade.rr.toFixed(2)),orderType,tradeReady:true,setupStatus:'TRADE READY',setupReason:reason,bias,directionBias:bias,confidence,riskPercent:riskPct!=null?Number(riskPct.toFixed(2)):null,stopDistance:roundPrice(stopDistance),stopDistancePct:entry?Number((stopDistance/entry*100).toFixed(3)):null,stopDistanceUnits:Number((stopDistance*pipMultiplier).toFixed(2)),priceUnitLabel,structuralInvalidation:roundPrice(trade.stop),marketEntry:roundPrice(livePrice),price:roundPrice(livePrice),liquidityTarget:roundPrice(trade.targetLiquidity),liquidityType:'STRUCTURAL LIQUIDITY',liquidityTouches:0,liquidityDistancePct:Number((Math.abs((trade.targetLiquidity??trade.target)-entry)*100/entry).toFixed(2)),liquidityReason:'Target is derived from a qualified structural/liquidity level.',confirmation:{
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
        const all=[];let cursor='';
        for(let page=0;page<100;page++){
          const url=new URL('https://api.bybit.com/v5/market/instruments-info');
          url.searchParams.set('category','linear');
          url.searchParams.set('status','Trading');
          url.searchParams.set('limit','1000');
          if(cursor)url.searchParams.set('cursor',cursor);
          const r=await fetch(url.toString(),{headers:{Accept:'application/json'}});
          if(!r.ok)return json(res,502,{error:'Bybit perpetual instrument provider unavailable'});
          const body=await r.json();
          if(body?.retCode!==0)return json(res,502,{error:body?.retMsg||'Bybit perpetual instrument provider unavailable'});
          all.push(...(body?.result?.list||[]));
          cursor=body?.result?.nextPageCursor||'';
          if(!cursor)break;
        }
        const instruments=normalizeInstrumentList(all
          .filter(x=>x.status==='Trading'&&x.contractType==='LinearPerpetual'&&x.baseCoin&&x.quoteCoin)
          .map(x=>({symbol:x.baseCoin+'/'+x.quoteCoin,providerSymbol:x.symbol,name:x.baseCoin+' / '+x.quoteCoin,type:'PERPETUAL'})));
        if(!instruments.length)return json(res,502,{error:'Bybit returned no trading perpetual instruments'});
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
  const liveQuote=(['forex','commodities','indices'].includes(market))?await yahooPrice(symbol,market):null;
  if(liveQuote?.marketState==='closed')throw Object.assign(new Error('Market is currently closed.'),{code:'MARKET_DATA_PRICE_UNAVAILABLE'});
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