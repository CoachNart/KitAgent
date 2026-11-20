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

symbols=await resolveReplaySymbols();
console.log('KITAGENT HISTORICAL MARKET REPLAY');
console.log('Historical candle source:',exchange.toUpperCase(),'public perpetual candles (replay-only adapter; live execution remains Bybit).');
console.log('Universe:',requestedSymbols.length?'explicit symbol override':'top 60 '+exchange.toUpperCase()+' USDT linear perpetuals by 24h turnover');
console.log('Symbols:',symbols.join(', '),'| decision snapshots/timeframe:',bars,'| forward outcome horizon:',forwardBars,'bars | history candles/timeframe:',Math.max(100,Math.min(10000,Number(args['history-candles'])||3000)),'| round-trip cost assumption:',roundTripCostBps,'bps');
console.log('Method: signals use only closed 4H/1H candles; fills and TP/SL outcomes use later closed 30m candles, matching the live board. Pending LIMIT entries expire after 24 hours. Intrabar TP/SL ambiguity is not guessed.');
for(const symbol of symbols){
  let history;
  try{
    const tfs=[...new Set(['4H',...EXECUTION_TIMEFRAMES,'30m'])];
    const rows=await Promise.all(tfs.map(async tf=>{
      const candles=closedCandles(await fetchReplayCandles(symbol,tf),tf,replayNow).filter(x=>x.time+DURATIONS[tf]<=replayNow);
      if(candles.length<80)throw new Error(tf+' has only '+candles.length+' closed candles; minimum 80 required');
      const interval=DURATIONS[tf];
      for(let i=1;i<candles.length;i++){
        if(candles[i].time-candles[i-1].time!==interval){
          throw new Error(tf+' history has a missing/irregular candle between '+new Date(candles[i-1].time).toISOString()+' and '+new Date(candles[i].time).toISOString()+'; refusing an unreliable replay');
        }
      }
      return [tf,candles];
    }));
    history=Object.fromEntries(rows);
    loadedSymbols++;
    console.log('DATA OK',symbol,...tfs.map(tf=>tf+':'+history[tf].length+' candles ('+new Date(history[tf][0].time).toISOString()+' → '+new Date(history[tf].at(-1).time+DURATIONS[tf]).toISOString()+')'));
  }catch(error){
    if(/HTTP 403 Forbidden/i.test(String(error?.message||error)))providerBlockedSymbols++;
    console.error('DATA ERROR',symbol,error?.message||error);
    continue;
  }
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
        all[layerTf]=layerRows.slice(0,closedPrefixEnd(layerRows,layerTf,cutoff));
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
        console.log('STRATEGY START',symbol,tf,snapshotIndex+'/'+snapshots.length,strategy);
        let result;
        try{result=await analyzeOne('perpetual',symbol,strategy,tf,all,candle.close);}
        catch(error){
          console.error('STRATEGY ERROR',symbol,tf,snapshotIndex,strategy,Date.now()-strategyStarted+'ms',error?.stack||error);
          rejection(strategy,tf,'EXCEPTION: '+(error?.message||error));
          continue;
        }
        console.log('STRATEGY DONE',symbol,tf,snapshotIndex+'/'+snapshots.length,strategy,Date.now()-strategyStarted+'ms');
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
        const eventFingerprint=trade?fingerprint(trade,result.direction,result.smc,symbol):null;
        const eventKey=trade?strategy+'|'+eventFingerprint:null;
        if(trade&&seen.has(eventKey)){
          duplicateSetupsSuppressed++;
          continue;
        }
        if(trade)seen.set(eventKey,cutoff);

        // Separate unique structural events from publication eligibility.
        // All executable grades are outcome-simulated; only A/A+ remain publishable.
        if(trade){
          stat.executableSetups++;
          const grade=String(result.grade?.grade||'NO-GRADE');
          const score=Number.isFinite(Number(result.grade?.score))?Number(result.grade.score):null;
          if(grade==='A')stat.gradeA++;
          else if(grade==='A+')stat.gradeAplus++;
          else{
            stat.gradeRejected++;
            if(grade==='B')stat.gradeB++;
            else if(grade==='C')stat.gradeC++;
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
                htfBias:result.smc?.htfBias||null,sweepAge:result.smc?.sweep?.age??null,
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
          grade,gradeScore:result.grade?.score??null,...gradeParts,
          htfBias:result.smc?.htfBias||null,sweepAge:result.smc?.sweep?.age??null,
          displacementAtr:result.smc?.displacement?.atrMultiple??null,
          fvgSize:result.smc?.fvg?.size??null,
          targetSource:result.smc?.target?.source||trade.targetSource||null,
          targetQuality:result.smc?.target?.quality??trade.targetSelection?.quality??null,
          targetPool:result.smc?.target?.pool||trade.targetSelection?.pool||null};
        const outcome=simulate(trade,result.direction,trade.orderType,future,'30m',cutoff);
        if(outcome.result==='ambiguous'){
          gradeStat.ambiguous++;
          if(['A','A+'].includes(grade))stat.ambiguous++;
          tradeAudit.push({...auditBase,outcome:'ambiguous',exitTime:'',grossR:'',netR:'',reason:'Intrabar order ambiguous'});
        }else if(outcome.result==='missed'){
          gradeStat.missed++;
          if(['A','A+'].includes(grade))stat.missed++;
          tradeAudit.push({...auditBase,outcome:'missed',exitTime:'',grossR:'',netR:'',reason:outcome.reason||'Limit entry not activated'});
        }else if(outcome.result==='unresolved'){
          gradeStat.unresolved++;
          if(['A','A+'].includes(grade))stat.unresolved++;
          tradeAudit.push({...auditBase,outcome:'unresolved',exitTime:'',grossR:'',netR:'',reason:'No exit within available history'});
        }else{
          const gross=rMultiple(trade,result.direction,outcome.exit);
          const riskPct=Math.abs(Number(trade.entry)-Number(trade.stop))/Math.abs(Number(trade.entry));
          const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
          const net=gross-costR;
          gradeStat[outcome.result==='win'?'wins':'losses']++;
          gradeStat.grossR+=gross;gradeStat.netR+=net;
          gradeStat.returns.push({net,exitTime:outcome.exitTime??cutoff,symbol});
          if(['A','A+'].includes(grade)){
            if(outcome.result==='win')stat.wins++;else stat.losses++;
            stat.grossR+=gross;stat.netR+=net;stat.returns.push({net,exitTime:outcome.exitTime??cutoff,symbol});
          }
          tradeAudit.push({...auditBase,outcome:outcome.result,exit:outcome.exit,exitTime:new Date(outcome.exitTime??cutoff).toISOString(),grossR:+gross.toFixed(3),netR:+net.toFixed(3),reason:outcome.result==='loss'?'Stop reached':'Target reached'});
        }

        // The live publication contract remains unchanged: A/A+ only.
        if(!['A','A+'].includes(grade))continue;
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
console.log('\nTRADE-LEVEL AUDIT (unique MSS/FVG events; all executable grades)');
console.table(tradeAudit);
console.log('\nSMC STAGE FUNNEL (counts are per sweep path; a later stage increments only after prior conditions pass)');
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
  note:'Exploratory Bybit historical replay, not a profitability guarantee. Excludes funding, partial fills, spread-specific bid/ask fills, and account-specific fee tiers. Drawdown is sorted by simulated exit time across symbols; overlapping positions are not portfolio-simulated.'
},null,2));
if(loadedSymbols===0&&providerBlockedSymbols===symbols.length&&symbols.length>0){
  console.error('REPLAY SKIPPED: Bybit returned HTTP 403 for every requested symbol from this runner region; no performance conclusion is possible.');
  process.exitCode=2;
}else if(loadedSymbols===0){
  console.error('REPLAY FAILED: no historical candle data was loaded; refusing to report an empty replay as a successful test.');
  process.exitCode=1;
}else if(totalResolved<30){
  console.error('REPLAY NOT VALIDATED: fewer than 30 unambiguous resolved trades; insufficient evidence to call the engine ready.');
  process.exitCode=1;
}else if(averageNetR<=0){
  console.error('REPLAY FAILED: net expectancy after the configured round-trip cost is not positive; do not treat the current setup engine as ready.');
  process.exitCode=1;
}
