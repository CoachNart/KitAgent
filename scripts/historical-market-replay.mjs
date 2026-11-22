import {normalizeRows,closedCandles,EXECUTION_TIMEFRAMES,atr,analysisWindow,MARKET_ANALYSIS_CANDLE_LIMIT,replayHistoryRequirements} from '../server/market-engine/data.js';
import {analyzeOne} from '../server/market-engine/index.js';
import {isCandleWithinWindow,pendingEntryDeadline} from '../server/market-engine/execution-window.js';
import {isSupportedCryptoBase} from '../server/market-engine/crypto-universe.js';

const DURATIONS={'30m':30*60_000,'1H':60*60_000,'4H':4*60*60_000};
const PENDING_ENTRY_WINDOW_MS=24*60*60_000;
const BYBIT_API_HOSTS=process.env.BYBIT_API_REGION==='eea'
  ?['https://api.bybit.eu','https://api.bybit.com','https://api.bytick.com','https://api.bybit.nl']
  :['https://api.bybit.com','https://api.bytick.com','https://api.bybit.nl'];
const OKX_API_HOST='https://www.okx.com';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),'true']:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
let exchange=String(args.exchange||process.env.REPLAY_EXCHANGE||'bybit').toLowerCase();
if(!['okx','bybit'].includes(exchange))throw new Error('Unsupported replay exchange: '+exchange+' (use okx or bybit)');
const requestedSymbols=String(args.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
const universeLimit=Math.max(1,Math.min(60,Number(args['universe-limit'])||60));
let symbols=requestedSymbols;
// The wider replay workflow requests 9,000 consecutive 1H decisions.
// Keep the CLI cap aligned with the workflow so the historical sample is not silently truncated.
const bars=Math.max(5,Math.min(9000,Number(args.bars)||20));
const forwardBars=Math.max(1,Math.min(1000,Number(args['forward-bars'])||168));
const historyCeiling=Math.max(100,Math.min(20000,Number(args['history-candles'])||20000));
const historyLimits=replayHistoryRequirements(bars,forwardBars,MARKET_ANALYSIS_CANDLE_LIMIT);
for(const tf of Object.keys(historyLimits)){
  if(historyLimits[tf]>historyCeiling)throw new Error('history-candles cap '+historyCeiling+' is below the '+tf+' replay requirement '+historyLimits[tf]+'; increase --history-candles to preserve full coverage');
}
const roundTripCostBps=Math.max(0,Math.min(100,Number(args['round-trip-cost-bps']??10)));
const requested=String(args.timeframes||EXECUTION_TIMEFRAMES.join(',')).split(',').map(x=>x.trim()).filter(x=>EXECUTION_TIMEFRAMES.includes(x));
const strategies=['SMC'];
const stats=new Map();
// Outcome-simulate every unique executable event, including rejected grades.
// This is diagnostic calibration data; only A/A+ remains eligible for publication.
const gradeStats=new Map();
// Compare pending-order expiry windows without changing live execution rules.
const pendingWindowStats=new Map();
// Compare alternative limit locations inside the same confirmed FVG without changing live execution.
const entryPlacementStats=new Map([.25,.5,.75].map(fraction=>[fraction,{fraction,events:0,eligible:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,netR:0}]));
// Paired sensitivity uses only the same base events for which all three placements pass identical execution checks.
const pairedEntryPlacementStats=new Map([.25,.5,.75].map(fraction=>[fraction,{fraction,events:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,netR:0}]));
const failures=new Map();
const tradeAudit=[];
const gradeRejectionAudit=[];
let duplicateSetupsSuppressed=0;
const stageKeys=['recentSweeps','mssWithinWindow','displacement','fvgCreatedByMss','freshFvgAndSize','premiumDiscount','premiumDiscountBullishPass','premiumDiscountBearishPass','premiumDiscountBullishOutOfZone','premiumDiscountBearishOutOfZone','premiumDiscountDeltaAtrSum','premiumDiscountDeltaSamples','structuralTarget','rrAtLeast3','executableEntry','targetNoQualifiedStructure','targetOutOfReach','nearestTargetBelow3R'];
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
// OKX public history endpoints are rate-limited across the runner's public
// IP, not independently per instrument. A per-symbol queue allowed the eight
// preload workers to burst dozens of requests together and trigger HTTP 429s.
// Use one global queue, a conservative request interval, and a shared cooldown
// so a 429 slows every worker instead of creating a retry storm.
let okxRequestQueue=Promise.resolve();
let lastOkxRequestAt=0;
let okxCooldownUntil=0;
let bybitRequestQueue=Promise.resolve();
let lastBybitRequestAt=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function okxFetch(url){
  const request=okxRequestQueue.then(async()=>{
    const wait=Math.max(0,200-(Date.now()-lastOkxRequestAt),okxCooldownUntil-Date.now());
    if(wait)await sleep(wait);
    lastOkxRequestAt=Date.now();
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(response.status===429){
      const raw=response.headers?.get?.('retry-after');
      const seconds=Number(raw);
      const dateDelay=raw&&!Number.isFinite(seconds)?Date.parse(raw)-Date.now():0;
      const explicit=Number.isFinite(seconds)&&seconds>0?seconds*1000:dateDelay>0?dateDelay:0;
      // If the server omits Retry-After, apply a shared three-second pause.
      okxCooldownUntil=Math.max(okxCooldownUntil,Date.now()+Math.max(3000,explicit));
    }
    return response;
  });
  okxRequestQueue=request.then(()=>undefined,()=>undefined);
  return request;
}
async function bybitFetch(url){
  const request=bybitRequestQueue.then(async()=>{
    const wait=Math.max(0,125-(Date.now()-lastBybitRequestAt));
    if(wait)await sleep(wait);
    lastBybitRequestAt=Date.now();
    return fetch(url,{signal:AbortSignal.timeout(30000)});
  });
  bybitRequestQueue=request.then(()=>undefined,()=>undefined);
  return request;
}
function retryDelay(response,attempt){
  const raw=response?.headers?.get?.('retry-after');
  const seconds=Number(raw);
  const dateDelay=raw&&!Number.isFinite(seconds)?Date.parse(raw)-Date.now():0;
  const explicit=Number.isFinite(seconds)&&seconds>0?seconds*1000:dateDelay>0?dateDelay:0;
  if(explicit>0)return Math.max(750,explicit);
  return Math.min(15000,Math.max(750,750*2**(attempt-1)));
}
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
function simulate(trade,direction,orderType,future,tf,decisionTime,pendingWindowMs=PENDING_ENTRY_WINDOW_MS){
  const entry=Number(trade.entry),stop=Number(trade.stop),target=Number(trade.target);
  if(![entry,stop,target].every(Number.isFinite))return{result:'unresolved'};
  let active=String(orderType).toUpperCase()==='MARKET';
  const pendingExpiresAt=pendingEntryDeadline(decisionTime,pendingWindowMs);
  const effectiveWindowMs=Math.max(0,pendingExpiresAt-decisionTime);
  for(const c of future){
    if(!active&&!isCandleWithinWindow(c.time,decisionTime,DURATIONS[tf],effectiveWindowMs)){
      if(c.time>=pendingExpiresAt)return{result:'missed',reason:'Limit entry expired after configured pending window'};
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
function fingerprint(t,direction,smc=null,symbol='',indexOffset=0){
  // A setup is one symbol-specific sweep -> MSS -> FVG event. Include the
  // sweep index so distinct liquidity raids sharing one later FVG stay distinct.
  const sweepIndex=Number(smc?.sweep?.index);
  const mssIndex=Number(smc?.mss?.index);
  const fvgIndex=Number(smc?.fvg?.index);
  if(Number.isInteger(sweepIndex)&&Number.isInteger(mssIndex)&&Number.isInteger(fvgIndex)){
    return ['SMC_EVENT',symbol,direction,sweepIndex+indexOffset,mssIndex+indexOffset,fvgIndex+indexOffset].join('|');
  }
  // Defensive fallback for non-SMC strategies or older result shapes.
  return [symbol,direction,t.orderType,Number(t.entry).toPrecision(10),Number(t.stop).toPrecision(10),Number(t.target).toPrecision(10)].join('|');
}

async function resolveReplaySymbols(){
  if(requestedSymbols.length)return exchange==='okx'?requestedSymbols.map(x=>x.includes('-')?x:x.endsWith('USDT')?x.slice(0,-4)+'-USDT-SWAP':x):requestedSymbols;
  if(exchange==='okx'){
    const [instrumentsResponse,tickersResponse]=await Promise.all([
      okxFetch(new URL('/api/v5/public/instruments?instType=SWAP',OKX_API_HOST)),
      okxFetch(new URL('/api/v5/market/tickers?instType=SWAP',OKX_API_HOST))
    ]);
    if(!instrumentsResponse.ok||!tickersResponse.ok)throw new Error('OKX swap universe HTTP '+instrumentsResponse.status+'/'+tickersResponse.status);
    const [instruments,tickers]=await Promise.all([instrumentsResponse.json(),tickersResponse.json()]);
    if(instruments.code!=='0'||tickers.code!=='0')throw new Error('OKX swap universe error: '+(instruments.msg||tickers.msg||'unknown'));
    const live=new Set((instruments.data||[]).filter(x=>x.state==='live'&&x.settleCcy==='USDT'&&x.ctType==='linear'&&isSupportedCryptoBase(String(x.instId||'').split('-')[0])).map(x=>x.instId));
    return (tickers.data||[]).filter(x=>live.has(x.instId)&&Number(x.last)>0&&Number(x.volCcy24h)>0)
      .sort((a,b)=>(Number(b.volCcy24h)*Number(b.last))-(Number(a.volCcy24h)*Number(a.last)))
      .slice(0,universeLimit).map(x=>x.instId);
  }
  let payload=null,lastError='Bybit ticker universe unavailable';
  for(const host of BYBIT_API_HOSTS){
    try{
      const url=new URL('/v5/market/tickers',host);url.searchParams.set('category','linear');
      const response=await bybitFetch(url);
      if(!response.ok){lastError='Bybit ticker universe HTTP '+response.status+' ('+host+')';continue;}
      const candidate=await response.json();
      if(candidate.retCode!==0){lastError='Bybit ticker universe retCode '+candidate.retCode+': '+(candidate.retMsg||'unknown error');continue;}
      payload=candidate;break;
    }catch(error){lastError='Bybit ticker universe request failed ('+host+'): '+(error?.message||error);}
  }
  if(!payload)throw new Error(lastError);
  const universe=(payload.result?.list||[]).filter(x=>isSupportedCryptoBase(String(x.symbol||'').replace(/USDT$/,''))&&Number(x.lastPrice)>0&&Number(x.turnover24h)>0)
    .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h)).slice(0,universeLimit).map(x=>x.symbol);
  if(!universe.length)throw new Error('Bybit returned no eligible USDT perpetual symbols for replay');
  return universe;
}async function fetchReplayCandles(symbol,tf){
  const intervals={'30m':'30m','1H':'1H','4H':'4H'};
  const interval=intervals[tf];
  if(!interval)throw new Error('Unsupported replay timeframe: '+tf);
  // Fetch a safety buffer: historical providers can return fewer rows than requested
  // at pagination boundaries, and closedCandles removes the in-progress bar.
  // Three extra rows ensure the replay still has its exact required closed history.
  const requestedLimit=historyLimits[tf]+3;
  if(!Number.isFinite(requestedLimit)||requestedLimit<80)throw new Error('Invalid replay history requirement for '+tf);
  const rows=[];
  if(exchange==='okx'){
    let after;
    while(rows.length<requestedLimit){
      const pageLimit=Math.min(100,requestedLimit-rows.length);
      const url=new URL('/api/v5/market/history-candles',OKX_API_HOST);
      url.searchParams.set('instId',symbol);url.searchParams.set('bar',interval);url.searchParams.set('limit',String(pageLimit));
      if(after!=null)url.searchParams.set('after',String(after));
      let payload=null,lastError='OKX historical candles unavailable';
      for(let attempt=1;attempt<=5;attempt++){
        try{
          const response=await okxFetch(url);
          if(!response.ok){lastError='OKX historical candles HTTP '+response.status+' '+response.statusText;
            if((response.status===429||response.status>=500)&&attempt<5){await sleep(retryDelay(response,attempt));continue;}
            break;}
          const candidate=await response.json();
          if(candidate.code!=='0'){lastError='OKX historical candles code '+candidate.code+': '+(candidate.msg||'unknown');
            if(attempt<5){await sleep(retryDelay(response,attempt));continue;}break;}
          if(!Array.isArray(candidate.data)||!candidate.data.length){lastError='OKX returned no historical candles';break;}
          payload=candidate;break;
        }catch(error){lastError='OKX historical candles request failed: '+(error?.message||error);
          if(attempt<5)await sleep(retryDelay(null,attempt));}
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
    const requestedBybit=requestedLimit;
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
            const response=await bybitFetch(url);
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

async function loadReplayHistory(symbol){
  const tfs=[...new Set(['4H',...EXECUTION_TIMEFRAMES,'30m'])];
  const rows=await Promise.all(tfs.map(async tf=>{
    const candles=closedCandles(await fetchReplayCandles(symbol,tf),tf,replayNow).filter(x=>x.time+DURATIONS[tf]<=replayNow);
    if(candles.length<historyLimits[tf]){
      throw new Error(tf+' has '+candles.length+' closed candles; full replay requires '+historyLimits[tf]+' to cover warm-up, all decisions, and forward outcomes');
    }
    const interval=DURATIONS[tf];
    for(let i=1;i<candles.length;i++){
      if(candles[i].time-candles[i-1].time!==interval){
        throw new Error(tf+' history has a missing/irregular candle between '+new Date(candles[i-1].time).toISOString()+' and '+new Date(candles[i].time).toISOString()+'; refusing an unreliable replay');
      }
    }
    return [tf,candles];
  }));
  return Object.fromEntries(rows);
}
const historyBySymbol=new Map();
async function preloadReplayHistory(){
  let cursor=0;
  const workerCount=Math.min(8,symbols.length);
  await Promise.all(Array.from({length:workerCount},async()=>{
    while(true){
      const index=cursor++;
      if(index>=symbols.length)return;
      const symbol=symbols[index];
      try{
        const history=await loadReplayHistory(symbol);
        historyBySymbol.set(symbol,history);
        loadedSymbols++;
        console.log('DATA OK',symbol,...Object.keys(history).map(tf=>tf+':'+history[tf].length+' candles ('+new Date(history[tf][0].time).toISOString()+' → '+new Date(history[tf].at(-1).time+DURATIONS[tf]).toISOString()+')'));
      }catch(error){
        if(/HTTP 403 Forbidden|HTTP 451/i.test(String(error?.message||error)))providerBlockedSymbols++;
        console.error('DATA ERROR',symbol,error?.message||error);
      }
    }
  }));
}
function isRegionBlocked(error){
  return /HTTP 403|HTTP 451|geo.?block|region.?restrict|access denied/i.test(String(error?.message||error));
}
try{
  symbols=await resolveReplaySymbols();
}catch(error){
  if(exchange!=='bybit'||!isRegionBlocked(error))throw error;
  console.warn('BYBIT REPLAY BLOCKED AT UNIVERSE LOOKUP; falling back to OKX historical data for this runner region:',error?.message||error);
  exchange='okx';
  symbols=await resolveReplaySymbols();
}
await preloadReplayHistory();
if(exchange==='bybit'&&loadedSymbols===0&&providerBlockedSymbols===symbols.length&&symbols.length>0){
  console.warn('BYBIT HISTORICAL CANDLES BLOCKED FOR EVERY SYMBOL; restarting the entire replay on OKX rather than mixing exchanges.');
  exchange='okx';
  symbols=await resolveReplaySymbols();
  loadedSymbols=0;providerBlockedSymbols=0;historyBySymbol.clear();
  await preloadReplayHistory();
}

console.log('KITAGENT HISTORICAL MARKET REPLAY');
console.log('Historical candle source:',exchange.toUpperCase(),'public perpetual candles (Bybit preferred; OKX used only when Bybit is region-blocked; live execution remains Bybit).');
console.log('Universe:',requestedSymbols.length?'explicit symbol override':'top '+universeLimit+' '+exchange.toUpperCase()+' USDT linear perpetuals by 24h turnover');
console.log('Symbols:',symbols.join(', '),'| decision snapshots/timeframe:',bars,'| forward outcome horizon:',forwardBars,'bars | required history:',JSON.stringify(historyLimits),'| round-trip cost assumption:',roundTripCostBps,'bps');
console.log('Method: signals use only closed 4H/1H candles; fills and TP/SL outcomes use later closed 30m candles, matching the live board. Pending LIMIT entries expire after 24 hours. Intrabar TP/SL ambiguity is not guessed.');
for(const symbol of symbols){
  const history=historyBySymbol.get(symbol);
  if(!history)continue;
  for(const tf of requested){
    const exec=history[tf]||[];
    // Evaluate a continuous recent window of hourly decisions. Each decision
    // is paired with subsequent 30m monitor candles for fill and outcome replay.
    const lastIndex=exec.length-forwardBars-1;
    if(lastIndex<80)continue;
    // Evaluate consecutive 1H decision candles. Spreading a fixed number of
    // snapshots across the entire history silently skipped several hourly
    // decisions between samples, understating both setup frequency and fills.
    // Keep the requested sample count, but make it a continuous recent window.
    const sampleCount=Math.min(bars,lastIndex-80+1);
    const firstIndex=lastIndex-sampleCount+1;
    const snapshotIndices=Array.from({length:sampleCount},(_,i)=>firstIndex+i);
    const snapshots=snapshotIndices.map(index=>({index,candle:exec[index]}));
    const seen=new Map();
    let snapshotIndex=0;
    for(const snapshot of snapshots){
      snapshotIndex++;
      const {index:candleIndex,candle}=snapshot;
      const cutoff=candle.time+DURATIONS[tf];
      const all={};
      for(const layerTf of [...new Set(['4H',...EXECUTION_TIMEFRAMES])]){
        const layerRows=history[layerTf]||[];
        const prefixEnd=closedPrefixEnd(layerRows,layerTf,cutoff);
        all[layerTf]=analysisWindow(layerRows,prefixEnd,MARKET_ANALYSIS_CANDLE_LIMIT);
        if(all[layerTf].some(x=>x.time+DURATIONS[layerTf]>cutoff)){
          throw new Error('LOOKAHEAD GUARD: future candle leaked into '+layerTf+' snapshot at '+new Date(cutoff).toISOString());
        }
      }
      if(!all[tf]||all[tf].length<40)continue;
      if(all[tf].at(-1)?.time!==candle.time){
        throw new Error('HISTORICAL SNAPSHOT GUARD: latest '+tf+' candle does not match the decision candle at '+new Date(cutoff).toISOString());
      }
      if(snapshotIndex===1||snapshotIndex===snapshots.length||snapshotIndex%25===0){
        console.log('REPLAY PROGRESS',symbol,tf,snapshotIndex+'/'+snapshots.length,new Date(cutoff).toISOString());
      }
      for(const strategy of strategies){
        const stat=bucket(strategy,tf);stat.evaluated++;
        const strategyStarted=Date.now();
        let result;
        try{result=await analyzeOne('perpetual',symbol,strategy,tf,all,candle.close);}
        catch(error){
          console.error('STRATEGY ERROR',symbol,tf,snapshotIndex,strategy,Date.now()-strategyStarted+'ms',error?.stack||error);
          rejection(strategy,tf,'EXCEPTION: '+(error?.message||error));
          continue;
        }
        const stageDiagnostic=(result?.evidence||[]).find(x=>x?.type==='SMC_STAGE_DIAGNOSTICS');
        if(stageDiagnostic){
          for(const key of stageKeys){
            const value=Number(stageDiagnostic[key]);
            if(Number.isFinite(value)){stageTotals[key]+=value;stageSamples[key]++;}
          }
          for(const [reason,count] of Object.entries(stageDiagnostic.executionRejections||{})){
            if(Number.isFinite(Number(count)))executionRejectionTotals.set(reason,(executionRejectionTotals.get(reason)||0)+Number(count));
          }
          for(const [reason,count] of Object.entries(stageDiagnostic.geometryFailureReasons||{})){
            if(Number.isFinite(Number(count)))geometryFailureTotals.set(reason,(geometryFailureTotals.get(reason)||0)+Number(count));
          }
          for(const sample of stageDiagnostic.targetRejectionAudit||[]){
            const uniqueKey=[symbol,tf,sample.direction,sample.sweepIndex,sample.mssIndex,sample.fvgIndex].join('|');
            if(targetRejectionAudit.length<120&&!targetRejectionAuditSeen.has(uniqueKey)){
              targetRejectionAuditSeen.add(uniqueKey);
              targetRejectionAudit.push({symbol,timeframe:tf,...sample});
            }
          }
          for(const sample of stageDiagnostic.pendingLimitAudit||[]){
            const uniqueKey=[symbol,tf,sample.direction,sample.decisionTime,sample.fvgIndex].join('|');
            if(pendingLimitAudit.length<80&&!pendingLimitAuditSeen.has(uniqueKey)){
              pendingLimitAuditSeen.add(uniqueKey);
              pendingLimitAudit.push({symbol,timeframe:tf,...sample});
            }
          }
          for(const sample of stageDiagnostic.premiumDiscountAudit||[]){
            const sampleKey=symbol+'|'+sample.direction;
            const uniqueKey=[symbol,sample.direction,sample.sweepIndex,sample.mssIndex,sample.fvgIndex].join('|');
            const count=premiumDiscountAuditCounts.get(sampleKey)||0;
            if(count<12&&!premiumDiscountAuditSeen.has(uniqueKey)){
              premiumDiscountAuditSeen.add(uniqueKey);
              premiumDiscountAuditCounts.set(sampleKey,count+1);
              premiumDiscountAudit.push({symbol,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),...sample});
            }
          }
        }
        if(strategy==='TOP_DOWN'){
          const rejectionDiagnostics=(result?.evidence||[]).find(x=>x?.type==='TOP_DOWN_REJECTION_DIAGNOSTICS');
          if(rejectionDiagnostics)console.log('TOP_DOWN STAGE DIAGNOSTICS',symbol,tf,snapshotIndex+'/'+snapshots.length,JSON.stringify(rejectionDiagnostics));
        }
        // Count each sweep -> MSS -> FVG event once, before grade accounting.
        // Hourly snapshots can observe the same still-fresh event repeatedly;
        // counting those observations as separate setups inflated executable
        // and grade totals. The first eligible observation is the freshest.
        const trade=result.trade;
        const eventFingerprint=trade?fingerprint(trade,result.direction,result.smc,symbol,Math.max(0,(closedPrefixEnd(history[tf]||[],tf,cutoff)-all[tf].length))):null;
        const eventKey=trade?strategy+'|'+eventFingerprint:null;
        if(trade&&seen.has(eventKey)){
          duplicateSetupsSuppressed++;
          continue;
        }
        if(trade)seen.set(eventKey,cutoff);

        // Separate unique structural events from publication eligibility.
        // All executable grades are outcome-simulated; A/A+ and the separate B tier are publication-eligible.
        if(trade){
          stat.executableSetups++;
          const grade=String(result.grade?.grade||'NO-GRADE');
          const score=Number.isFinite(Number(result.grade?.score))?Number(result.grade.score):null;
          if(grade==='A')stat.gradeA++;
          else if(grade==='A+')stat.gradeAplus++;
          else if(grade==='B')stat.gradeB++;
          else{
            stat.gradeRejected++;
            if(grade==='C')stat.gradeC++;
            else stat.gradeOther++;
            rejection(strategy,tf,'EXECUTABLE SETUP BELOW PUBLICATION GRADE: '+grade+(score===null?'':' ('+score+'/100)'));
            if(gradeRejectionAudit.length<120){
              const parts=Object.fromEntries((result.grade?.confidenceEvidence||[])
                .filter(x=>String(x.type||'').startsWith('CONFIDENCE_')&&x.type!=='CONFIDENCE_MODEL')
                .map(x=>[x.type.replace('CONFIDENCE_','').toLowerCase(),{score:x.score,max:x.max}]));
              gradeRejectionAudit.push({
                symbol,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),
                direction:result.direction,grade,score,gradeParts:parts,
                orderType:result.trade.orderType,entry:result.trade.entry,
                stop:result.trade.stop,target:result.trade.target,rr:result.trade.rr,
                htfBias:result.smc?.htfBias||null,sweepAge:result.smc?.sweep?.age??null,setupAge:result.trade.setupAgeBars??null,
                displacementAtr:result.smc?.displacement?.atrMultiple??null,
                fvgSize:result.smc?.fvg?.size??null,
                targetSource:result.smc?.target?.source||result.trade.targetSource||null,
                targetQuality:result.smc?.target?.quality??result.trade.targetSelection?.quality??null
              });
            }
          }
        }
        if(!result.trade){
          for(const reason of (result.failures||[]).slice(0,2))rejection(strategy,tf,reason);
          continue;
        }

        // Simulate every unique executable setup, not only A/A+ publications.
        // Otherwise the grading model cannot be calibrated against actual outcomes.
        const monitor=history['30m']||[];
        const monitorStart=firstCandleAtOrAfter(monitor,cutoff);
        const future=monitor.slice(monitorStart,monitorStart+forwardBars*2);
        if(future.some(x=>x.time<cutoff)){
          throw new Error('OUTCOME GUARD: pre-decision candle found in forward simulation at '+new Date(cutoff).toISOString());
        }
        const grade=String(result.grade?.grade||'NO-GRADE');
        const gradeStat=gradeBucket(grade);
        gradeStat.events++;
        const gradeParts=Object.fromEntries((result.grade?.confidenceEvidence||[])
          .filter(x=>String(x.type||'').startsWith('CONFIDENCE_')&&x.type!=='CONFIDENCE_MODEL')
          .map(x=>[x.type.replace('CONFIDENCE_','').toLowerCase()+'Score',x.score]));
        const auditBase={symbol,strategy,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),
          direction:result.direction,orderType:trade.orderType,entry:trade.entry,stop:trade.stop,target:trade.target,
          entryDistanceAtr:(()=>{const value=atr(all[tf],14);return value>0?+(Math.abs(Number(trade.marketEntry??candle.close)-Number(trade.entry))/value).toFixed(4):null;})(),
          grade,gradeScore:result.grade?.score??null,...gradeParts,
          htfBias:result.smc?.htfBias||null,sweepAge:result.smc?.sweep?.age??null,setupAge:trade.setupAgeBars??null,
          displacementAtr:result.smc?.displacement?.atrMultiple??null,
          fvgSize:result.smc?.fvg?.size??null,
          targetSource:result.smc?.target?.source||trade.targetSource||null,
          targetQuality:result.smc?.target?.quality??trade.targetSelection?.quality??null,
          targetPool:result.smc?.target?.pool||trade.targetSelection?.pool||null,
          entryInPreferredZone:(result.evidence||[]).find(x=>x?.type==='PREMIUM_DISCOUNT')?.entryInPreferredZone??null,
          sweepPenetrationAtr:result.smc?.sweep?.quality?.penetrationATR??null,
          sweepReclaimAtr:result.smc?.sweep?.quality?.reclaimDepthATR??null,
          riskAtr:(()=>{const value=atr(all[tf],14);return value>0?+(Math.abs(Number(trade.entry)-Number(trade.stop))/value).toFixed(4):null;})(),
          plannedRR:Number.isFinite(Number(trade.rr))?Number(trade.rr):null};
        // Diagnostic only: compare 25%, 50% (current midpoint), and 75% FVG limit prices.
        // Each alternative must independently preserve direction, executable-side, <=1.5 ATR distance,
        // target runway, and the hard 3R floor; no live trade levels are modified.
        const fvgZone=result.smc?.fvg;
        if(String(trade.orderType).toUpperCase()==='LIMIT'&&Number.isFinite(Number(fvgZone?.low))&&Number.isFinite(Number(fvgZone?.high))&&Number(fvgZone.high)>Number(fvgZone.low)){
          const liveQuote=Number(trade.marketEntry??candle.close);
          const entryAtr=atr(all[tf],14)||0;
          const pairedVariants=[];
          for(const fraction of [.25,.5,.75]){
            const placement=entryPlacementStats.get(fraction);
            placement.events++;
            // Measure penetration from the FVG edge first reached by a retracement:
            // bullish gaps are approached from above; bearish gaps from below.
            const zoneLow=Number(fvgZone.low),zoneHigh=Number(fvgZone.high),zoneRange=zoneHigh-zoneLow;
            const variantEntry=result.direction==='BULLISH'
              ?zoneHigh-zoneRange*fraction
              :zoneLow+zoneRange*fraction;
            const risk=Math.abs(variantEntry-Number(trade.stop));
            const reward=Math.abs(Number(trade.target)-variantEntry);
            const rr=risk>0?reward/risk:0;
            const correctSide=result.direction==='BULLISH'?liveQuote>variantEntry:liveQuote<variantEntry;
            const pullback=Math.abs(liveQuote-variantEntry);
            const runway=result.direction==='BULLISH'?Number(trade.target)-liveQuote:liveQuote-Number(trade.target);
            const variantValid=correctSide&&risk>0&&reward>0&&rr>=3&&rr<=10&&
              (entryAtr<=0||pullback<=Math.max(entryAtr*1.5,Math.abs(variantEntry)*.003))&&runway>=pullback;
            if(!variantValid)continue;
            placement.eligible++;
            const variantTrade={...trade,entry:variantEntry,rr,orderType:'LIMIT'};
            const variantOutcome=simulate(variantTrade,result.direction,'LIMIT',future,'30m',cutoff);
            pairedVariants.push({fraction,variantTrade,variantOutcome,risk,variantEntry});
            if(variantOutcome.result==='win'||variantOutcome.result==='loss'){
              placement[variantOutcome.result==='win'?'wins':'losses']++;
              const gross=rMultiple(variantTrade,result.direction,variantOutcome.exit);
              const riskPct=risk/Math.abs(variantEntry);
              const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
              placement.netR+=gross-costR;
            }else if(variantOutcome.result==='missed')placement.missed++;
            else if(variantOutcome.result==='ambiguous')placement.ambiguous++;
            else placement.unresolved++;
          }
          // Report a genuinely paired cohort separately so differing eligibility
          // cannot masquerade as an entry-price improvement.
          if(pairedVariants.length===3){
            for(const item of pairedVariants){
              const paired=pairedEntryPlacementStats.get(item.fraction);
              paired.events++;
              const {variantTrade,variantOutcome,risk,variantEntry}=item;
              if(variantOutcome.result==='win'||variantOutcome.result==='loss'){
                paired[variantOutcome.result==='win'?'wins':'losses']++;
                const gross=rMultiple(variantTrade,result.direction,variantOutcome.exit);
                const riskPct=risk/Math.abs(variantEntry);
                const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
                paired.netR+=gross-costR;
              }else if(variantOutcome.result==='missed')paired.missed++;
              else if(variantOutcome.result==='ambiguous')paired.ambiguous++;
              else paired.unresolved++;
            }
          }
        }

        // Compare 24h, 48h and 72h pending windows side-by-side. Only the 24h
        // result feeds official stats; longer windows remain diagnostic until
        // they improve both fill rate and net outcomes.
        for(const hours of [24,48,72]){
          const key=hours+'|'+grade;
          if(!pendingWindowStats.has(key))pendingWindowStats.set(key,{
            hours,grade,events:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,netR:0,durationsHours:[]
          });
          const windowStat=pendingWindowStats.get(key);
          windowStat.events++;
          const windowOutcome=simulate(trade,result.direction,trade.orderType,future,'30m',cutoff,hours*60*60_000);
          if(windowOutcome.result==='win'||windowOutcome.result==='loss'){
            windowStat[windowOutcome.result==='win'?'wins':'losses']++;
            const gross=rMultiple(trade,result.direction,windowOutcome.exit);
            const riskPct=Math.abs(Number(trade.entry)-Number(trade.stop))/Math.abs(Number(trade.entry));
            const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
            windowStat.netR+=gross-costR;
            windowStat.durationsHours.push(Math.max(0,(windowOutcome.exitTime-cutoff)/3600000));
          }else if(windowOutcome.result==='missed')windowStat.missed++;
          else if(windowOutcome.result==='ambiguous')windowStat.ambiguous++;
          else windowStat.unresolved++;
        }
        const outcome=simulate(trade,result.direction,trade.orderType,future,'30m',cutoff);
        if(outcome.result==='ambiguous'){
          gradeStat.ambiguous++;
          if(['A','A+','B'].includes(grade))stat.ambiguous++;
          tradeAudit.push({...auditBase,outcome:'ambiguous',exitTime:'',grossR:'',netR:'',reason:'Intrabar order ambiguous'});
        }else if(outcome.result==='missed'){
          gradeStat.missed++;
          if(['A','A+','B'].includes(grade))stat.missed++;
          tradeAudit.push({...auditBase,outcome:'missed',exitTime:'',grossR:'',netR:'',reason:outcome.reason||'Limit entry not activated'});
        }else if(outcome.result==='unresolved'){
          gradeStat.unresolved++;
          if(['A','A+','B'].includes(grade))stat.unresolved++;
          tradeAudit.push({...auditBase,outcome:'unresolved',exitTime:'',grossR:'',netR:'',reason:'No exit within available history'});
        }else{
          const gross=rMultiple(trade,result.direction,outcome.exit);
          const riskPct=Math.abs(Number(trade.entry)-Number(trade.stop))/Math.abs(Number(trade.entry));
          const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
          const net=gross-costR;
          gradeStat[outcome.result==='win'?'wins':'losses']++;
          gradeStat.grossR+=gross;gradeStat.netR+=net;
          gradeStat.returns.push({net,exitTime:outcome.exitTime??cutoff,symbol});
          if(['A','A+','B'].includes(grade)){
            if(outcome.result==='win')stat.wins++;else stat.losses++;
            stat.grossR+=gross;stat.netR+=net;stat.returns.push({net,exitTime:outcome.exitTime??cutoff,symbol});
          }
          tradeAudit.push({...auditBase,outcome:outcome.result,exit:outcome.exit,exitTime:new Date(outcome.exitTime??cutoff).toISOString(),grossR:+gross.toFixed(3),netR:+net.toFixed(3),reason:outcome.result==='loss'?'Stop reached':'Target reached'});
        }

        // B is now a separately labelled publication tier; C/NO-TRADE remain diagnostic only.
        if(!['A','A+','B'].includes(grade))continue;
        stat.tradeCandidates++;
      }
    }
  }
}

const rows=[...stats.values()].map(s=>{
  const resolved=s.wins+s.losses;
  const mean=s.returns.length?s.netR/s.returns.length:0;
  let equity=0,peak=0,maxDrawdown=0;
  for(const r of [...s.returns].sort((a,b)=>a.exitTime-b.exitTime)){equity+=r.net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
  return{strategy:s.strategy,timeframe:s.timeframe,evaluated:s.evaluated,executableSetups:s.executableSetups,gradeA:s.gradeA,gradeAplus:s.gradeAplus,gradeB:s.gradeB,gradeC:s.gradeC,gradeRejected:s.gradeRejected,candidates:s.tradeCandidates,resolved,wins:s.wins,losses:s.losses,winRatePct:resolved?+(100*s.wins/resolved).toFixed(2):null,avgGrossR:resolved?+(s.grossR/resolved).toFixed(3):null,avgNetR:resolved?+mean.toFixed(3):null,ambiguous:s.ambiguous,missed:s.missed,unresolved:s.unresolved,maxDrawdownR:+maxDrawdown.toFixed(3)};
});
console.table(rows);
console.log('\nREPEATED SMC SETUPS SUPPRESSED',duplicateSetupsSuppressed);
console.log('\nEXECUTABLE SETUPS REJECTED BY PUBLICATION GRADE (sampled; all are now outcome-simulated)');
console.table(gradeRejectionAudit);
console.log('\nOUTCOME BY STRUCTURAL GRADE (all unique executable events; diagnostic calibration only)');
console.table([...gradeStats.values()].map(s=>{
  const resolved=s.wins+s.losses;
  return{grade:s.grade,events:s.events,resolved,wins:s.wins,losses:s.losses,winRatePct:resolved?+(100*s.wins/resolved).toFixed(2):null,avgGrossR:resolved?+(s.grossR/resolved).toFixed(3):null,avgNetR:resolved?+(s.netR/resolved).toFixed(3):null,missed:s.missed,ambiguous:s.ambiguous,unresolved:s.unresolved};
}));
console.log('\\nFVG ENTRY PLACEMENT SENSITIVITY (diagnostic only; live midpoint unchanged)');
console.table([...entryPlacementStats.values()].map(x=>{
  const resolved=x.wins+x.losses;
  return{entryPercentOfFvg:x.fraction*100,events:x.events,eligible:x.eligible,resolved,wins:x.wins,losses:x.losses,
    winRatePct:resolved?+(100*x.wins/resolved).toFixed(2):null,
    avgNetR:resolved?+(x.netR/resolved).toFixed(3):null,
    missed:x.missed,ambiguous:x.ambiguous,unresolved:x.unresolved};
}));
console.log('\\nFVG ENTRY PLACEMENT SENSITIVITY (PAIRED COHORT; same base events eligible at all three levels)');
console.table([...pairedEntryPlacementStats.values()].map(x=>{
  const resolved=x.wins+x.losses;
  return{entryPercentOfFvg:x.fraction*100,pairedEvents:x.events,resolved,wins:x.wins,losses:x.losses,
    winRatePct:resolved?+(100*x.wins/resolved).toFixed(2):null,
    avgNetR:resolved?+(x.netR/resolved).toFixed(3):null,
    missed:x.missed,ambiguous:x.ambiguous,unresolved:x.unresolved};
}));
console.log('\\nPENDING ENTRY WINDOW SENSITIVITY (diagnostic only; live rule remains 24h)');
console.table([...pendingWindowStats.values()].filter(x=>['A+','A','B'].includes(x.grade)).map(x=>{
  const resolved=x.wins+x.losses;
  const durations=x.durationsHours.slice().sort((a,b)=>a-b);
  return{hours:x.hours,grade:x.grade,events:x.events,resolved,wins:x.wins,losses:x.losses,
    winRatePct:resolved?+(100*x.wins/resolved).toFixed(2):null,
    avgNetR:resolved?+(x.netR/resolved).toFixed(3):null,
    medianExitHours:durations.length?+durations[Math.floor(durations.length/2)].toFixed(1):null,
    missed:x.missed,ambiguous:x.ambiguous,unresolved:x.unresolved};
}));
console.log('\\nA/A+/B LIMIT DISTANCE SENSITIVITY (historical diagnostic; 1.5 ATR cap now enforced in SMC)');
console.table([0.5,0.75,1,1.25,1.5,2,3,Infinity].map(maxDistanceAtr=>{
  const selected=tradeAudit.filter(x=>['A','A+','B'].includes(x.grade)&&Number.isFinite(x.entryDistanceAtr)&&x.entryDistanceAtr<=maxDistanceAtr);
  const wins=selected.filter(x=>x.outcome==='win').length;
  const losses=selected.filter(x=>x.outcome==='loss').length;
  const resolved=wins+losses;
  return{maxEntryDistanceAtr:Number.isFinite(maxDistanceAtr)?maxDistanceAtr:'ALL',candidates:selected.length,resolved,wins,losses,winRatePct:resolved?+(100*wins/resolved).toFixed(2):null,missed:selected.filter(x=>x.outcome==='missed').length,ambiguous:selected.filter(x=>x.outcome==='ambiguous').length,unresolved:selected.filter(x=>x.outcome==='unresolved').length};
}));
console.log('\nSWEEP AGE SENSITIVITY (A/A+/B only; historical diagnostic)');
console.table([2,4,6,8,10,12,16].map(maxSweepAge=>{
  const selected=tradeAudit.filter(x=>['A','A+','B'].includes(x.grade)&&Number.isFinite(x.sweepAge)&&x.sweepAge<=maxSweepAge);
  const wins=selected.filter(x=>x.outcome==='win');
  const losses=selected.filter(x=>x.outcome==='loss');
  const resolved=wins.length+losses.length;
  const netR=[...wins,...losses].reduce((sum,x)=>sum+(Number(x.netR)||0),0);
  return{maxSweepAgeBars:maxSweepAge,candidates:selected.length,resolved,wins:wins.length,losses:losses.length,
    winRatePct:resolved?+(100*wins.length/resolved).toFixed(2):null,
    avgNetR:resolved?+(netR/resolved).toFixed(3):null,
    missed:selected.filter(x=>x.outcome==='missed').length,
    ambiguous:selected.filter(x=>x.outcome==='ambiguous').length,
    unresolved:selected.filter(x=>x.outcome==='unresolved').length};
}));
// Chronological split exposes whether the publication grades behave similarly
// in the earlier and later halves of the replay window. This is diagnostic,
// not a true untouched holdout because strategy thresholds were inspected.
const eligibleAudit=tradeAudit.filter(x=>['A+','A','B'].includes(x.grade)&&x.decisionTime);
const orderedDecisionTimes=[...new Set(eligibleAudit.map(x=>x.decisionTime))].sort();
const splitTime=orderedDecisionTimes.length?orderedDecisionTimes[Math.floor(orderedDecisionTimes.length/2)]:null;
const chronologicalPeriods=[
  {period:'EARLIER_HALF',test:x=>splitTime!==null&&x.decisionTime<splitTime},
  {period:'LATER_HALF',test:x=>splitTime!==null&&x.decisionTime>=splitTime}
];
console.log('\\nCHRONOLOGICAL PERFORMANCE BY PUBLICATION GRADE (diagnostic split; not an untouched holdout)');
console.table(chronologicalPeriods.flatMap(period=>['A+','A','B'].map(grade=>{
  const selected=eligibleAudit.filter(x=>x.grade===grade&&period.test(x));
  const resolved=selected.filter(x=>x.outcome==='win'||x.outcome==='loss');
  const wins=resolved.filter(x=>x.outcome==='win').length;
  const net=resolved.reduce((sum,x)=>sum+(Number(x.netR)||0),0);
  return{period:period.period,grade,events:selected.length,resolved:resolved.length,wins,losses:resolved.length-wins,
    winRatePct:resolved.length?+(100*wins/resolved.length).toFixed(2):null,
    avgNetR:resolved.length?+(net/resolved.length).toFixed(3):null};
})));
console.log('\nTRADE-LEVEL AUDIT (unique MSS/FVG events; all executable grades)');
console.table(tradeAudit);

// Test whether the preferred SMC dealing-range location actually separates
// outcomes. This is diagnostic only: no live publication rule is changed.
console.log('\nPREFERRED PREMIUM/DISCOUNT ZONE OUTCOME AUDIT (A/A+/B only; diagnostic, not a live filter)');
const zoneGroups=new Map();
for(const item of tradeAudit.filter(x=>['A+','A','B'].includes(x.grade))){
  const zone=item.entryInPreferredZone===true?'PREFERRED_ZONE':item.entryInPreferredZone===false?'WRONG_SIDE':'UNKNOWN';
  const key=item.grade+'|'+zone;
  if(!zoneGroups.has(key))zoneGroups.set(key,{grade:item.grade,zone,events:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,netR:0});
  const group=zoneGroups.get(key);group.events++;
  if(item.outcome==='win'||item.outcome==='loss'){
    group[item.outcome==='win'?'wins':'losses']++;
    group.netR+=Number(item.netR)||0;
  }else if(item.outcome==='missed')group.missed++;
  else if(item.outcome==='ambiguous')group.ambiguous++;
  else group.unresolved++;
}
console.table([...zoneGroups.values()].map(x=>{
  const resolved=x.wins+x.losses;
  return{...x,resolved,winRatePct:resolved?+(100*x.wins/resolved).toFixed(2):null,avgNetR:resolved?+(x.netR/resolved).toFixed(3):null,netR:+x.netR.toFixed(3)};
}));
console.log('\nSMC STAGE FUNNEL (counts are per sweep path; premium/discount is recorded as confluence, not a hard gate)');
console.table(stageKeys.map(stage=>({stage,passed:stageTotals[stage],diagnosticSamples:stageSamples[stage]})));
console.log('\nEXECUTION REJECTION DIAGNOSTICS (per sweep path)');
console.table([...executionRejectionTotals.entries()].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})));
console.log('\nSTRUCTURAL TARGET REJECTION AUDIT (nearest opposing structure; no RR relaxation)');
console.table(targetRejectionAudit);
console.log('\nPENDING LIMIT DISTANCE AUDIT (sampled rejected paths)');
console.table(pendingLimitAudit.map(x=>({symbol:x.symbol,direction:x.direction,decisionTime:x.decisionTime,price:+x.price.toPrecision(8),fvgMidpoint:+x.entryMidpoint.toPrecision(8),distance:+x.distance.toPrecision(8),distanceAtr:x.distanceAtr==null?null:+x.distanceAtr.toFixed(3),allowedDistance:+x.allowedDistance.toPrecision(8),allowedDistanceAtr:x.allowedDistanceAtr==null?null:+x.allowedDistanceAtr.toFixed(3),fvgAgeBars:x.fvgAgeBars,fvgIndex:x.fvgIndex,atr:+x.atr.toPrecision(8)})));
console.log('\nTRADE GEOMETRY FAILURE DETAILS');
console.table([...geometryFailureTotals.entries()].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count})));
console.log('\nSTRUCTURAL PREMIUM/DISCOUNT AUDIT (pre-sweep confirmed swing range)');
console.table(premiumDiscountAudit.map(x=>({
  symbol:x.symbol,direction:x.direction,decisionTime:x.decisionTime,
  sweepIndex:x.sweepIndex,mssIndex:x.mssIndex,fvgIndex:x.fvgIndex,
  fvgLow:+x.fvgLow.toFixed(6),fvgMidpoint:+x.fvgMidpoint.toFixed(6),fvgHigh:+x.fvgHigh.toFixed(6),
  premiumDiscountReference:x.premiumDiscountReference,
  sweepExtreme:+x.sweepExtreme.toFixed(6),
  structuralEquilibrium:+x.structuralEquilibrium.toFixed(6),
  sweepDeltaAtr:x.sweepDeltaAtr==null?null:+x.sweepDeltaAtr.toFixed(3),
  structuralRangeHighIndex:x.anchoredHighIndex,
  structuralRangeLowIndex:x.anchoredLowIndex
})));
for(const direction of ['BULLISH','BEARISH']){
  const subset=premiumDiscountAudit.filter(x=>x.direction===direction);
  const deltas=subset.map(x=>x.sweepDeltaAtr).filter(Number.isFinite).sort((a,b)=>a-b);
  const median=a=>a.length?a[Math.floor(a.length/2)]:null;
  console.log('STRUCTURAL PREMIUM/DISCOUNT SUMMARY',direction,JSON.stringify({
    samples:subset.length,
    sweepDeltaAtrMedian:median(deltas),
    confirmedStructuralRangeSamples:deltas.length
  }));
}
console.log('\nTOP REJECTIONS');
console.table([...failures.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([reason,count])=>({count,reason})));
const totalResolved=rows.reduce((n,x)=>n+x.resolved,0);
const totalWins=rows.reduce((n,x)=>n+x.wins,0);
const totalLosses=rows.reduce((n,x)=>n+x.losses,0);
const totalNetR=[...stats.values()].reduce((n,x)=>n+x.netR,0);
const averageNetR=totalResolved?totalNetR/totalResolved:null;
console.log('\nSUMMARY',JSON.stringify({
  symbols,requestedTimeframes:requested,decisionSnapshotsPerTimeframe:bars,forwardBars,roundTripCostBps,
  evaluated:rows.reduce((n,x)=>n+x.evaluated,0),
  executableSetups:rows.reduce((n,x)=>n+x.executableSetups,0),
  gradeRejected:rows.reduce((n,x)=>n+x.gradeRejected,0),
  candidates:rows.reduce((n,x)=>n+x.candidates,0),
  resolved:totalResolved,wins:totalWins,losses:totalLosses,
  winRatePct:totalResolved?+(100*totalWins/totalResolved).toFixed(2):null,
  averageNetR:averageNetR===null?null:+averageNetR.toFixed(3),
  providerBlockedSymbols,
  note:`Exploratory ${exchange.toUpperCase()} historical replay, not a profitability guarantee; live execution remains Bybit. Excludes funding, partial fills, spread-specific bid/ask fills, and account-specific fee tiers. Drawdown is sorted by simulated exit time across symbols; overlapping positions are not portfolio-simulated.`
},null,2));
if(loadedSymbols===0&&providerBlockedSymbols===symbols.length&&symbols.length>0){
  console.error('REPLAY SKIPPED: Bybit returned HTTP 403 for every requested symbol from this runner region; no performance conclusion is possible.');
  process.exitCode=2;
}else if(loadedSymbols===0){
  console.error('REPLAY FAILED: no historical candle data was loaded; refusing to report an empty replay as a successful test.');
  process.exitCode=1;
}else if(totalResolved===0){
  console.error('REPLAY FAILED: no unambiguous publication-eligible trades resolved; profitability cannot be established.');
  process.exitCode=1;
}else if(totalWins/totalResolved<=0.5){
  console.error('REPLAY FAILED: publication-eligible win rate is not above 50%; do not treat the current setup engine as ready.');
  process.exitCode=1;
}else if(averageNetR<=0){
  console.error('REPLAY FAILED: net expectancy after the configured round-trip cost is not positive; do not treat the current setup engine as ready.');
  process.exitCode=1;
}
