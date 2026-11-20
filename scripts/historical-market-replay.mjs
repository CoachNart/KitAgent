import {normalizeRows,closedCandles,EXECUTION_TIMEFRAMES} from '../server/market-engine/data.js';
import {analyzeOne} from '../server/market-engine/index.js';
import {isCandleWithinWindow} from '../server/market-engine/execution-window.js';

const DURATIONS={'30m':30*60_000,'1H':60*60_000,'4H':4*60*60_000};
const PENDING_ENTRY_WINDOW_MS=24*60*60_000;
const BYBIT_API_HOSTS=process.env.BYBIT_API_REGION==='eea'
  ?['https://api.bybit.eu','https://api.bybit.com','https://api.bytick.com']
  :['https://api.bybit.com','https://api.bytick.com'];
const OKX_API_HOST='https://www.okx.com';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),'true']:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
const exchange=String(args.exchange||process.env.REPLAY_EXCHANGE||'okx').toLowerCase();
if(!['okx','bybit'].includes(exchange))throw new Error('Unsupported replay exchange: '+exchange+' (use okx or bybit)');
const requestedSymbols=String(args.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
let symbols=requestedSymbols;
const bars=Math.max(5,Math.min(1000,Number(args.bars)||20));
const forwardBars=Math.max(1,Math.min(1000,Number(args['forward-bars'])||168));
const roundTripCostBps=Math.max(0,Math.min(100,Number(args['round-trip-cost-bps']??10)));
const requested=String(args.timeframes||EXECUTION_TIMEFRAMES.join(',')).split(',').map(x=>x.trim()).filter(x=>EXECUTION_TIMEFRAMES.includes(x));
const strategies=['SMC'];
const stats=new Map();
// Outcome-simulate every unique executable event, including rejected grades.
// This is diagnostic calibration data; only A/A+ remains eligible for publication.
const gradeStats=new Map();
const failures=new Map();
const tradeAudit=[];
const gradeRejectionAudit=[];
let duplicateSetupsSuppressed=0;
const stageKeys=['recentSweeps','mssWithinWindow','displacement','fvgCreatedByMss','freshFvgAndSize','premiumDiscount','premiumDiscountBullishPass','premiumDiscountBearishPass','premiumDiscountBullishReject','premiumDiscountBearishReject','premiumDiscountDeltaAtrSum','premiumDiscountDeltaSamples','structuralTarget','rrAtLeast3','executableEntry','targetNoQualifiedStructure','targetOutOfReach','nearestTargetBelow3R'];
const stageTotals=Object.fromEntries(stageKeys.map(key=>[key,0]));
const stageSamples=Object.fromEntries(stageKeys.map(key=>[key,0]));
const executionRejectionTotals=new Map();
const geometryFailureTotals=new Map();
const premiumDiscountAudit=[];
const pendingLimitAudit=[];
const pendingLimitAuditSeen=new Set();
const targetRejectionAudit=[];
const targetRejectionAuditSeen=new Set();
const premiumDiscountAuditCounts=new Map();
const premiumDiscountAuditSeen=new Set();
const replayNow=Date.now();
let loadedSymbols=0;
let providerBlockedSymbols=0;
const keyOf=(strategy,tf)=>strategy+'|'+tf;
function bucket(strategy,tf){
  const key=keyOf(strategy,tf);
  if(!stats.has(key))stats.set(key,{strategy,timeframe:tf,evaluated:0,executableSetups:0,gradeA:0,gradeAplus:0,gradeB:0,gradeC:0,gradeOther:0,gradeRejected:0,tradeCandidates:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,grossR:0,netR:0,returns:[]});
  return stats.get(key);
}
function gradeBucket(grade){
  const key=String(grade||'NO-GRADE');
  if(!gradeStats.has(key))gradeStats.set(key,{grade:key,events:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,grossR:0,netR:0,returns:[]});
  return gradeStats.get(key);
}
function rejection(strategy,tf,reason){
  const key=strategy+'|'+tf+'|'+String(reason||'No executable setup').slice(0,180);
  failures.set(key,(failures.get(key)||0)+1);
}
function hit(c,price){return c.low<=price&&c.high>=price;}
function closedPrefixEnd(rows,tf,cutoff){
  let lo=0,hi=rows.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(rows[mid].time+DURATIONS[tf]<=cutoff)lo=mid+1;
    else hi=mid;
  }
  return lo;
}
function firstCandleAtOrAfter(rows,time){
  let lo=0,hi=rows.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(rows[mid].time<time)lo=mid+1;
    else hi=mid;
  }
  return lo;
}
function simulate(trade,direction,orderType,future,tf,decisionTime){
  const entry=Number(trade.entry),stop=Number(trade.stop),target=Number(trade.target);
  if(![entry,stop,target].every(Number.isFinite))return{result:'unresolved'};
  let active=String(orderType).toUpperCase()==='MARKET';
  const sweepTime=Number(trade.sweepTime);
  const pendingExpiresAt=Number.isFinite(sweepTime)&&sweepTime>0?sweepTime+PENDING_ENTRY_WINDOW_MS:decisionTime+PENDING_ENTRY_WINDOW_MS;
  const pendingWindowMs=Math.max(0,pendingExpiresAt-decisionTime);
  for(const c of future){
    if(!active&&!isCandleWithinWindow(c.time,decisionTime,DURATIONS[tf],pendingWindowMs)){
      if(c.time>=pendingExpiresAt)return{result:'missed',reason:'Limit entry expired 24 hours after the original liquidity sweep'};
      continue;
    }
    if(!active){
      const entryTouched=hit(c,entry);
      const invalidated=direction==='BULLISH'?c.low<=stop:c.high>=stop;
      const targetTouched=direction==='BULLISH'?c.high>=target:c.low<=target;
      if(targetTouched&&!entryTouched)return{result:'missed',reason:'target reached before limit entry'};
      if(!entryTouched&&invalidated)return{result:'missed'};
      if(!entryTouched)continue;
      if(invalidated||targetTouched)return{result:'ambiguous'};
      active=true;
      continue; // A limit activation candle cannot also establish the exit order.
    }
    const stopHit=direction==='BULLISH'?c.low<=stop:c.high>=stop;
    const targetHit=direction==='BULLISH'?c.high>=target:c.low<=target;
    if(stopHit&&targetHit)return{result:'ambiguous'};
    if(stopHit)return{result:'loss',exit:stop,exitTime:c.time+DURATIONS[tf]};
    if(targetHit)return{result:'win',exit:target,exitTime:c.time+DURATIONS[tf]};
  }
  return{result:active?'unresolved':'missed'};
}
function rMultiple(trade,direction,exit){
  const risk=Math.abs(Number(trade.entry)-Number(trade.stop));
  if(!(risk>0))return 0;
  return (direction==='BULLISH'?exit-Number(trade.entry):Number(trade.entry)-exit)/risk;
}
function fingerprint(t,direction,smc=null,symbol=''){
  // A setup is one symbol-specific sweep -> MSS -> FVG event. Include the
  // sweep index so distinct liquidity raids sharing one later FVG stay distinct.
  const sweepIndex=Number(smc?.sweep?.index);
  const mssIndex=Number(smc?.mss?.index);
  const fvgIndex=Number(smc?.fvg?.index);
  if(Number.isInteger(sweepIndex)&&Number.isInteger(mssIndex)&&Number.isInteger(fvgIndex)){
    return ['SMC_EVENT',symbol,direction,sweepIndex,mssIndex,fvgIndex].join('|');
  }
  // Defensive fallback for non-SMC strategies or older result shapes.
  return [symbol,direction,t.orderType,Number(t.entry).toPrecision(10),Number(t.stop).toPrecision(10),Number(t.target).toPrecision(10)].join('|');
}

async function resolveReplaySymbols(){
  if(requestedSymbols.length)return exchange==='okx'?requestedSymbols.map(x=>x.includes('-')?x:x.endsWith('USDT')?x.slice(0,-4)+'-USDT-SWAP':x):requestedSymbols;
  if(exchange==='okx'){
    const [instrumentsResponse,tickersResponse]=await Promise.all([
      fetch(new URL('/api/v5/public/instruments?instType=SWAP',OKX_API_HOST),{signal:AbortSignal.timeout(30000)}),
      fetch(new URL('/api/v5/market/tickers?instType=SWAP',OKX_API_HOST),{signal:AbortSignal.timeout(30000)})
    ]);
    if(!instrumentsResponse.ok||!tickersResponse.ok)throw new Error('OKX swap universe HTTP '+instrumentsResponse.status+'/'+tickersResponse.status);
    const [instruments,tickers]=await Promise.all([instrumentsResponse.json(),tickersResponse.json()]);
    if(instruments.code!=='0'||tickers.code!=='0')throw new Error('OKX swap universe error: '+(instruments.msg||tickers.msg||'unknown'));
    const live=new Set((instruments.data||[]).filter(x=>x.state==='live'&&x.settleCcy==='USDT'&&x.ctType==='linear').map(x=>x.instId));
    return (tickers.data||[]).filter(x=>live.has(x.instId)&&Number(x.last)>0&&Number(x.volCcy24h)>0)
      .sort((a,b)=>(Number(b.volCcy24h)*Number(b.last))-(Number(a.volCcy24h)*Number(a.last)))
      .slice(0,60).map(x=>x.instId);
  }
  let payload=null,lastError='Bybit ticker universe unavailable';
  for(const host of BYBIT_API_HOSTS){
    try{
      const url=new URL('/v5/market/tickers',host);url.searchParams.set('category','linear');
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok){lastError='Bybit ticker universe HTTP '+response.status+' ('+host+')';continue;}
      const candidate=await response.json();
      if(candidate.retCode!==0){lastError='Bybit ticker universe retCode '+candidate.retCode+': '+(candidate.retMsg||'unknown error');continue;}
      payload=candidate;break;
    }catch(error){lastError='Bybit ticker universe request failed ('+host+'): '+(error?.message||error);}
  }
  if(!payload)throw new Error(lastError);
  const universe=(payload.result?.list||[]).filter(x=>/USDT$/.test(x.symbol)&&Number(x.lastPrice)>0&&Number(x.turnover24h)>0)
    .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h)).slice(0,60).map(x=>x.symbol);
  if(!universe.length)throw new Error('Bybit returned no eligible USDT perpetual symbols for replay');
  return universe;
}async function fetchReplayCandles(symbol,tf){
  const intervals={'30m':'30m','1H':'1H','4H':'4H'};
  const interval=intervals[tf];
  if(!interval)throw new Error('Unsupported replay timeframe: '+tf);
  const historyRequest=Math.max(100,Math.min(10000,Number(args['history-candles'])||3000));
  const requestedLimit=Math.min(10000,tf==='30m'?historyRequest*2:historyRequest);
  const rows=[];
  if(exchange==='okx'){
    let after;
    while(rows.length<requestedLimit){
      const pageLimit=Math.min(100,requestedLimit-rows.length);
      const url=new URL('/api/v5/market/history-candles',OKX_API_HOST);
      url.searchParams.set('instId',symbol);url.searchParams.set('bar',interval);url.searchParams.set('limit',String(pageLimit));
      if(after!=null)url.searchParams.set('after',String(after));
      let payload=null,lastError='OKX historical candles unavailable';
      for(let attempt=1;attempt<=3;attempt++){
        try{
          const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
          if(!response.ok){lastError='OKX historical candles HTTP '+response.status+' '+response.statusText;
            if((response.status===429||response.status>=500)&&attempt<3){await new Promise(r=>setTimeout(r,750*attempt));continue;}
            break;}
          const candidate=await response.json();
          if(candidate.code!=='0'){lastError='OKX historical candles code '+candidate.code+': '+(candidate.msg||'unknown');
            if(attempt<3){await new Promise(r=>setTimeout(r,750*attempt));continue;}break;}
          if(!Array.isArray(candidate.data)||!candidate.data.length){lastError='OKX returned no historical candles';break;}
          payload=candidate;break;
        }catch(error){lastError='OKX historical candles request failed: '+(error?.message||error);
          if(attempt<3)await new Promise(r=>setTimeout(r,750*attempt));}
      }
      if(!payload)throw new Error('OKX historical pagination failed'+(rows.length?' after loading '+rows.length+' candles; refusing partial history. ':' ')+lastError);
      const page=payload.data;
      const pageTimes=page.map(x=>Number(x[0]));
      if(pageTimes.some(x=>!Number.isFinite(x)||x<=0))throw new Error('OKX returned invalid candle timestamps for '+symbol+' '+tf);
      rows.push(...page.map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]));
      const oldest=Math.min(...pageTimes);
      if(page.length<pageLimit)break;
      const nextAfter=oldest;
      if(after!=null&&nextAfter>=Number(after))throw new Error('OKX historical pagination stalled for '+symbol+' '+tf);
      after=String(nextAfter);
    }
  }else{
    const bybitIntervals={'30m':'30','1H':'60','4H':'240'};
    const intervalCode=bybitIntervals[tf];
    const requestedBybit=Math.min(10000,tf==='30m'?historyRequest*2:historyRequest);
    let end;
    while(rows.length<requestedBybit){
      const pageLimit=Math.min(1000,requestedBybit-rows.length);
      let payload=null,lastError='Bybit historical candles unavailable';
      for(const host of BYBIT_API_HOSTS){
        const url=new URL('/v5/market/kline',host);
        url.searchParams.set('category','linear');url.searchParams.set('symbol',symbol);
        url.searchParams.set('interval',intervalCode);url.searchParams.set('limit',String(pageLimit));
        if(end!=null)url.searchParams.set('end',String(end));
        for(let attempt=1;attempt<=3;attempt++){
          try{
            const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
            if(!response.ok){lastError='Bybit historical candles HTTP '+response.status+' '+response.statusText+' ('+host+')';
              if((response.status===429||response.status>=500)&&attempt<3){await new Promise(r=>setTimeout(r,750*attempt));continue;}break;}
            const candidate=await response.json();
            if(candidate.retCode!==0){lastError='Bybit historical candles retCode '+candidate.retCode+': '+(candidate.retMsg||'unknown error');
              if(candidate.retCode===10006&&attempt<3){await new Promise(r=>setTimeout(r,1000*attempt));continue;}break;}
            if(!Array.isArray(candidate.result?.list)||!candidate.result.list.length){lastError='Bybit returned no historical candles ('+host+')';break;}
            payload=candidate;break;
          }catch(error){lastError='Bybit historical candles request failed ('+host+'): '+(error?.message||error);
            if(attempt<3)await new Promise(r=>setTimeout(r,750*attempt));}
        }
        if(payload)break;
      }
      if(!payload)throw new Error('Bybit historical pagination failed'+(rows.length?' after loading '+rows.length+' candles; refusing partial history. ':' ')+lastError);
      const page=payload.result.list,pageTimes=page.map(x=>Number(x[0]));
      if(!pageTimes.length||pageTimes.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Bybit returned invalid candle timestamps for '+symbol+' '+tf);
      rows.push(...page.map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]));
      const oldest=Math.min(...pageTimes);
      if(page.length<pageLimit)break;
      const nextEnd=oldest-1;
      if(end!=null&&nextEnd>=end)throw new Error('Bybit historical pagination stalled for '+symbol+' '+tf);
      end=nextEnd;
    }
  }
  const normalized=normalizeRows(rows).slice(-requestedLimit);
  if(normalized.length<80)throw new Error('Insufficient '+exchange.toUpperCase()+' history for '+symbol+' '+tf+': received '+normalized.length+' normalized candles (minimum 80)');
  return normalized;
}
