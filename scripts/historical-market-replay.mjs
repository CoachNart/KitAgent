import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {normalizeRows,closedCandles,EXECUTION_TIMEFRAMES} from '../server/market-engine/data.js';
import {parseBybitCsv} from './replay-bybit-csv.mjs';
import {analyzeOne} from '../server/market-engine/index.js';
import {STRATEGIES} from '../server/market-engine/strategies.js';
import {executionEntry,executionTrade,validTradeGeometry,rMultiple,replayExitOnCandle} from '../server/market-engine/replay-execution.js';

const DURATIONS={'1H':60*60_000,'2H':2*60*60_000,'4H':4*60*60_000,'1D':24*60*60_000};
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),'true']:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
const symbols=String(args.symbols||'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,BNBUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
const bars=Math.max(5,Math.min(1000,Number(args.bars)||20));
const barsByTimeframe=Object.fromEntries(String(args['bars-by-timeframe']||'').split(',').map(part=>part.trim()).filter(Boolean).map(part=>{const [tf,value]=part.split(':');return [tf.trim().toUpperCase(),Math.max(5,Math.min(1000,Number(value)||bars))];}));
const barsFor=tf=>barsByTimeframe[tf]??bars;
const evaluationLookback=Math.max(80,Math.min(1000,Number(args['evaluation-lookback'])||300));
const roundTripCostBps=Math.max(0,Math.min(100,Number(args['round-trip-cost-bps']??10)));
const requested=String(args.timeframes||EXECUTION_TIMEFRAMES.join(',')).split(',').map(x=>x.trim()).filter(x=>EXECUTION_TIMEFRAMES.includes(x));
const requestedStrategies=String(args.strategies||Object.keys(STRATEGIES).join(',')).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
const strategies=requestedStrategies.filter(x=>Object.hasOwn(STRATEGIES,x));
if(!strategies.length)throw new Error('No valid strategies selected. Available: '+Object.keys(STRATEGIES).join(', '));
const stats=new Map();
const failures=new Map();
const tradeAudit=[];
// Counterfactual target study: same entry and stop, different take-profit distance.
const targetRMultiples=[1,1.5,2,2.5,3];
const targetSensitivity=new Map();
function targetBucket(strategy,tf,orderType,direction,multiple){
 const key=[strategy,tf,orderType,direction,multiple].join('|');
 if(!targetSensitivity.has(key))targetSensitivity.set(key,{strategy,timeframe:tf,orderType,direction,targetR:multiple,resolved:0,wins:0,losses:0,ambiguous:0,missed:0,unresolved:0,netR:0});
 return targetSensitivity.get(key);
}
const replayNow=Date.now();
const decisionStart=args['decision-start']?Date.parse(String(args['decision-start'])):-Infinity;
const decisionEnd=args['decision-end']?Date.parse(String(args['decision-end'])):replayNow;
if(!Number.isFinite(decisionEnd)||decisionStart===Infinity||Number.isNaN(decisionStart)||decisionStart>=decisionEnd)throw new Error('Invalid decision window: use --decision-start=ISO and --decision-end=ISO with start before end.');
let loadedSymbols=0;
const keyOf=(strategy,tf)=>strategy+'|'+tf;
function bucket(strategy,tf){
  const key=keyOf(strategy,tf);
  if(!stats.has(key))stats.set(key,{strategy,timeframe:tf,evaluated:0,withTrade:0,noTrade:0,guardBlocked:0,guardAllowed:0,gradeA:0,gradeAplus:0,gradeB:0,gradeC:0,rejectedGrade:0,tradeCandidates:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,grossR:0,netR:0,returns:[]});
  return stats.get(key);
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
function simulate(trade,direction,orderType,future,tf){
  const entry=executionEntry(trade,orderType),stop=Number(trade.stop),target=Number(trade.target);
  if(![entry,stop,target].every(Number.isFinite))return{result:'unresolved'};
  if(!validTradeGeometry(entry,stop,target,direction))return{result:'missed',reason:'Market/planned entry no longer has valid stop/target geometry'};
  let active=String(orderType).toUpperCase()==='MARKET';
  for(const c of future){
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
    // Stop gaps fill at the next candle open; target gaps are conservatively
    // credited only at the target. Both-level intrabar touches remain ambiguous.
    const exit=replayExitOnCandle(direction,stop,target,c);
    if(exit)return {...exit,exitTime:c.time+DURATIONS[tf]};
  }
  return{result:active?'unresolved':'missed'};
}
function fingerprint(t,direction){
  return [direction,t.orderType,Number(t.entry).toPrecision(10),Number(t.stop).toPrecision(10),Number(t.target).toPrecision(10)].join('|');
}
function setupFingerprint(strategy,result,trade,direction){
  if(strategy==='MSNR'){
    // Use timestamps and price-level identity, not array indexes. The replay
    // slides its history window, so signalIndex/originIndex can change for the
    // same historical event as newer candles arrive.
    const event=result?.msnr?.confirmation;
    const level=result?.msnr?.level;
    const signalCandle=event?.signalCandle;
    const signalTime=signalCandle?.time??signalCandle?.timestamp??event?.signalTime;
    const originTime=level?.originTime;
    if(event&&level&&signalTime!=null&&originTime!=null){
      return [
        direction,'MSNR_EVENT',
        String(signalTime),
        String(originTime),
        event.type??'unknown',
        level.type??'unknown',
        level.side??'unknown',
        Number(level.price).toPrecision(10)
      ].join('|');
    }
  }
  return fingerprint(trade,direction);
}

async function fetchReplayCandles(symbol,tf){
  const requestedLimit=Math.max(100,Math.min(10000,Number(args['history-candles'])||3000));
  if(args['data-dir']){
    const file=join(resolve(String(args['data-dir'])),symbol+'_'+tf+'.csv');
    let source;
    try{source=await readFile(file,'utf8');}
    catch(error){throw new Error('Unable to read Bybit CSV '+file+': '+(error?.message||error));}
    return parseBybitCsv(source).slice(-requestedLimit);
  }
  const intervals={'1H':'60','2H':'120','4H':'240','1D':'D'};
  const interval=intervals[tf];
  if(!interval)throw new Error('Unsupported Bybit replay timeframe: '+tf);
  const rows=[];
  let end;
  while(rows.length<requestedLimit){
    const pageLimit=Math.min(1000,requestedLimit-rows.length);
    let payload=null,lastError='Bybit historical candles unavailable';
    // Both hosts are Bybit endpoints; do not substitute another exchange's data.
    for(const host of ['https://api.bybit.com','https://api.bytick.com']){
      try{
        const url=new URL('/v5/market/kline',host);
        url.searchParams.set('category','linear');
        url.searchParams.set('symbol',symbol);
        url.searchParams.set('interval',interval);
        url.searchParams.set('limit',String(pageLimit));
        if(end!=null)url.searchParams.set('end',String(end));
        const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
        if(!response.ok){lastError='Bybit historical candles HTTP '+response.status+' '+response.statusText+' ('+host+')';continue;}
        const candidate=await response.json();
        if(candidate.retCode!==0){lastError='Bybit historical candles retCode '+candidate.retCode+': '+(candidate.retMsg||'unknown provider error');continue;}
        if(!Array.isArray(candidate.result?.list)||!candidate.result.list.length){lastError='Bybit returned no historical candles ('+host+')';continue;}
        payload=candidate;
        break;
      }catch(error){lastError='Bybit historical candles request failed ('+host+'): '+(error?.message||error);}
    }
    if(!payload)throw new Error('Bybit historical pagination failed'+(rows.length?' after loading '+rows.length+' raw candles; refusing partial history. ':' ')+lastError);
    const page=payload.result.list;
    const pageTimes=page.map(x=>Number(x[0]));
    if(!pageTimes.length||pageTimes.some(x=>!Number.isFinite(x)||x<=0))throw new Error('Bybit returned invalid candle timestamps for '+symbol+' '+tf);
    rows.push(...page.map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]));
    const oldest=Math.min(...pageTimes);
    if(page.length<pageLimit)break;
    const nextEnd=oldest-1;
    if(end!=null&&nextEnd>=end)throw new Error('Bybit historical pagination stalled for '+symbol+' '+tf+'; refusing incomplete history');
    end=nextEnd;
  }
  const normalized=normalizeRows(rows).slice(-requestedLimit);
  if(normalized.length<80)throw new Error('Bybit returned only '+normalized.length+' normalized candles (minimum 80)');
  return normalized;
}

console.log('KITAGENT HISTORICAL MARKET REPLAY');
console.log(args['data-dir']?'Historical candle source: user-supplied Bybit CSV files only; no network exchange fallback.':'Historical candle source: Bybit v5 linear perpetual candles only. No other exchange is used as a fallback.');
if(args['data-dir'])console.log('CSV input directory:',resolve(String(args['data-dir'])),'| required files: SYMBOL_TIMEFRAME.csv (for example BTCUSDT_1H.csv).');
console.log('Decision window:',Number.isFinite(decisionStart)?new Date(decisionStart).toISOString():'history start','→',new Date(decisionEnd).toISOString());
console.log('Symbols:',symbols.join(', '),'| snapshots per timeframe:',JSON.stringify(Object.fromEntries(requested.map(tf=>[tf,barsFor(tf)]))),'| downloaded history candles/timeframe:',Math.max(100,Math.min(10000,Number(args['history-candles'])||3000)),'| strategy evaluation lookback:',evaluationLookback,'candles/timeframe (matches the live engine default of 300)','| round-trip cost assumption:',roundTripCostBps,'bps');
console.log('Method: each signal sees only candles closed at its decision timestamp; outcome uses only later candles. Intrabar TP/SL ambiguity is not guessed.');
for(const symbol of symbols){
  let history;
  try{
    const tfs=[...EXECUTION_TIMEFRAMES,'1D'];
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
    console.error('DATA ERROR',symbol,error?.message||error);
    continue;
  }
  for(const tf of requested){
    const exec=history[tf]||[];
    const windowEnd=closedPrefixEnd(exec,tf,decisionEnd);
    const start=Math.max(40,windowEnd-barsFor(tf));
    const snapshots=exec.slice(start,windowEnd).filter(x=>x.time+DURATIONS[tf]>decisionStart);
    const seen=new Map();
    let snapshotIndex=0;
    for(const candle of snapshots){
      snapshotIndex++;
      const cutoff=candle.time+DURATIONS[tf];
      const all={};
      for(const layerTf of [...EXECUTION_TIMEFRAMES,'1D']){
        const layerRows=history[layerTf]||[];
        const layerEnd=closedPrefixEnd(layerRows,layerTf,cutoff);
        // Keep the historical dataset long enough to cover the decision window,
        // but give the strategy the same rolling candle depth used by the live
        // engine (300 candles by default). Passing the entire archive changed
        // live-vs-replay behavior and made MSNR's per-level tracking quadratic
        // over thousands of candles for every decision.
        all[layerTf]=layerRows.slice(Math.max(0,layerEnd-evaluationLookback),layerEnd);
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
        try{result=await analyzeOne('perpetual',symbol,strategy,tf,all,candle.close,null,{allowPausedResearch:true});}
        catch(error){
          console.error('STRATEGY ERROR',symbol,tf,snapshotIndex,strategy,Date.now()-strategyStarted+'ms',error?.stack||error);
          rejection(strategy,tf,'EXCEPTION: '+(error?.message||error));
          continue;
        }
        console.log('STRATEGY DONE',symbol,tf,snapshotIndex+'/'+snapshots.length,strategy,Date.now()-strategyStarted+'ms');
        if(strategy==='TOP_DOWN'){
          const rejectionDiagnostics=(result?.evidence||[]).find(x=>x?.type==='TOP_DOWN_REJECTION_DIAGNOSTICS');
          if(rejectionDiagnostics)console.log('TOP_DOWN STAGE DIAGNOSTICS',symbol,tf,snapshotIndex+'/'+snapshots.length,JSON.stringify(rejectionDiagnostics));
        }
        const resultGrade=String(result.grade?.grade||'NO-TRADE');
        if(result.marketStructureGuard?.allowed===false)stat.guardBlocked++;
        else if(result.marketStructureGuard?.allowed===true)stat.guardAllowed++;
        if(result.trade)stat.withTrade++;
        else stat.noTrade++;
        if(resultGrade==='A')stat.gradeA++;
        if(resultGrade==='A+')stat.gradeAplus++;
        if(resultGrade==='B')stat.gradeB++;
        if(resultGrade==='C')stat.gradeC++;
        if(!result.trade||!['A','A+'].includes(resultGrade)){
          if(result.trade)stat.rejectedGrade++;
          if(!result.trade&&!result.failures?.length)rejection(strategy,tf,'NO_TRADE_WITHOUT_EXPLICIT_FAILURE');
          for(const reason of (result.failures||[]).slice(0,3))rejection(strategy,tf,reason);
          if(result.trade&&!['A','A+'].includes(resultGrade))rejection(strategy,tf,'GRADE_GATE|'+resultGrade);
          continue;
        }
        const trade=result.trade;
        const fp=setupFingerprint(strategy,result,trade,result.direction),previous=seen.get(strategy+'|'+fp);
        // A strategy can keep publishing the exact same entry/stop/target on
        // consecutive snapshots. Counting those as separate trades double-counts
        // one setup and understates portfolio concentration. Deduplicate identical
        // trade geometry for the full symbol/timeframe replay window. MSNR's
        // event-based fingerprint additionally catches a level event whose price
        // geometry shifts slightly as the history window advances.
        if(previous!=null)continue;
        seen.set(strategy+'|'+fp,cutoff);
        stat.tradeCandidates++;
        const future=exec.slice(exec.indexOf(candle)+1,windowEnd);
        if(future.some(x=>x.time<cutoff)){
          throw new Error('OUTCOME GUARD: pre-decision candle found in forward simulation at '+new Date(cutoff).toISOString());
        }
        const executableTrade=executionTrade(trade,trade.orderType,future[0]);
        // Hold entry, stop, order activation and future candles constant; vary target only.
        const sensitivityEntry=executionEntry(executableTrade,trade.orderType);
        const sensitivityStop=Number(executableTrade.stop);
        const sensitivityRisk=Math.abs(sensitivityEntry-sensitivityStop);
        if(Number.isFinite(sensitivityEntry)&&Number.isFinite(sensitivityStop)&&sensitivityRisk>0){
          for(const multiple of targetRMultiples){
            const fixedTarget=result.direction==='BULLISH'?sensitivityEntry+sensitivityRisk*multiple:sensitivityEntry-sensitivityRisk*multiple;
            const counterfactual={...executableTrade,target:fixedTarget};
            const alt=future.length?simulate(counterfactual,result.direction,trade.orderType,future,tf):{result:'unresolved'};
            const b=targetBucket(strategy,tf,trade.orderType,result.direction,multiple);
            if(alt.result==='win'||alt.result==='loss'){
              const gross=rMultiple(counterfactual,result.direction,alt.exit,trade.orderType);
              const riskPct=sensitivityRisk/Math.abs(sensitivityEntry);
              const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
              b.resolved++;b[alt.result==='win'?'wins':'losses']++;b.netR+=gross-costR;
            }else if(['ambiguous','missed','unresolved'].includes(alt.result))b[alt.result]++;
          }
        }
        const auditMeta={
          grade:result.grade?.grade||'NO-TRADE',
          gradeScore:Number.isFinite(result.grade?.score)?result.grade.score:null,
          structureBias:(result.layers||[]).map(layer=>`${layer.tf}:${layer.direction||'NEUTRAL'}`).join(' > '),
          guardDecision:result.marketStructureGuard?.allowed===true?'ALLOWED':result.marketStructureGuard?.reason||'NOT_VETOED',
          rr:Number.isFinite(trade.rr)?+Number(trade.rr).toFixed(3):null,
          stopDistancePct:Number.isFinite(Number(trade.entry))&&Number(trade.entry)>0?+(Math.abs(Number(trade.entry)-Number(trade.stop))/Math.abs(Number(trade.entry))*100).toFixed(4):null,
          targetSource:trade.targetSource||result.msnr?.target?.source||result.msnr?.target?.type||'',
          invalidationSource:trade.invalidationSource||'',
          msnrLevel:result.msnr?.level?.price??null,
          msnrLevelType:result.msnr?.level?.type||''
        };
        const outcome=future.length?simulate(executableTrade,result.direction,trade.orderType,future,tf):{result:'unresolved'};
        if(outcome.result==='ambiguous'){stat.ambiguous++;tradeAudit.push({...auditMeta,symbol,strategy,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),direction:result.direction,orderType:trade.orderType,entry:trade.entry,stop:trade.stop,target:trade.target,outcome:'ambiguous',exitTime:'',grossR:'',netR:'',reason:'Intrabar order ambiguous'});continue;}
        if(outcome.result==='missed'){stat.missed++;tradeAudit.push({...auditMeta,symbol,strategy,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),direction:result.direction,orderType:trade.orderType,entry:trade.entry,stop:trade.stop,target:trade.target,outcome:'missed',exitTime:'',grossR:'',netR:'',reason:outcome.reason||'Limit entry not activated'});continue;}
        if(outcome.result==='unresolved'){stat.unresolved++;tradeAudit.push({...auditMeta,symbol,strategy,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),direction:result.direction,orderType:trade.orderType,entry:trade.entry,stop:trade.stop,target:trade.target,outcome:'unresolved',exitTime:'',grossR:'',netR:'',reason:'No exit within available history'});continue;}
        const filledEntry=executionEntry(executableTrade,trade.orderType);
        const gross=rMultiple(executableTrade,result.direction,outcome.exit,trade.orderType);
        const riskPct=Math.abs(filledEntry-Number(executableTrade.stop))/Math.abs(filledEntry);
        const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
        const net=gross-costR;
        if(outcome.result==='win')stat.wins++;else stat.losses++;
        stat.grossR+=gross;stat.netR+=net;stat.returns.push({net,exitTime:outcome.exitTime??cutoff,symbol});
        tradeAudit.push({...auditMeta,symbol,strategy,timeframe:tf,decisionTime:new Date(cutoff).toISOString(),direction:result.direction,orderType:trade.orderType,entry:filledEntry,plannedEntry:trade.entry,signalClose:trade.marketEntry??'',marketEntry:filledEntry,stop:trade.stop,target:trade.target,outcome:outcome.result,exit:outcome.exit,exitTime:new Date(outcome.exitTime??cutoff).toISOString(),grossR:+gross.toFixed(3),costR:+costR.toFixed(3),riskPct:+(riskPct*100).toFixed(4),netR:+net.toFixed(3),reason:outcome.reason||(outcome.result==='loss'?'Stop reached':'Target reached')});
      }
    }
  }
}

const rows=[...stats.values()].map(s=>{
  const resolved=s.wins+s.losses;
  const mean=s.returns.length?s.netR/s.returns.length:0;
  let equity=0,peak=0,maxDrawdown=0;
  for(const r of [...s.returns].sort((a,b)=>a.exitTime-b.exitTime)){equity+=r.net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
  return{strategy:s.strategy,timeframe:s.timeframe,evaluated:s.evaluated,withTrade:s.withTrade,noTrade:s.noTrade,guardBlocked:s.guardBlocked,guardAllowed:s.guardAllowed,gradeA:s.gradeA,gradeAplus:s.gradeAplus,gradeB:s.gradeB,gradeC:s.gradeC,rejectedGrade:s.rejectedGrade,candidates:s.tradeCandidates,resolved,wins:s.wins,losses:s.losses,winRatePct:resolved?+(100*s.wins/resolved).toFixed(2):null,avgGrossR:resolved?+(s.grossR/resolved).toFixed(3):null,avgNetR:resolved?+mean.toFixed(3):null,ambiguous:s.ambiguous,missed:s.missed,unresolved:s.unresolved,maxDrawdownR:+maxDrawdown.toFixed(3)};
});
console.table(rows);
console.log('\nTRADE-LEVEL AUDIT (qualified candidates only)');
console.table(tradeAudit);
const symbolDirectionStats=new Map();
for(const t of tradeAudit){
  if(!['win','loss'].includes(t.outcome)||!Number.isFinite(Number(t.netR)))continue;
  const key=[t.symbol,t.strategy,t.timeframe,t.direction].join('|');
  if(!symbolDirectionStats.has(key))symbolDirectionStats.set(key,{symbol:t.symbol,strategy:t.strategy,timeframe:t.timeframe,direction:t.direction,resolved:0,wins:0,losses:0,netR:0});
  const x=symbolDirectionStats.get(key);x.resolved++;x[t.outcome==='win'?'wins':'losses']++;x.netR+=Number(t.netR);
}
console.log('\nSYMBOL + DIRECTION BREAKDOWN (resolved trades)');
console.table([...symbolDirectionStats.values()].map(x=>({...x,winRatePct:+(100*x.wins/x.resolved).toFixed(2),avgNetR:+(x.netR/x.resolved).toFixed(3),totalNetR:+x.netR.toFixed(3)})));

// Separate signal outcomes from order-type and transaction-cost effects.
const executionGroups=new Map();
const costSensitivity=[0,5,10,15,20];
for(const t of tradeAudit){
  if(!['win','loss'].includes(t.outcome)||!Number.isFinite(Number(t.grossR)))continue;
  const key=[t.strategy,t.timeframe,t.orderType,t.direction].join('|');
  if(!executionGroups.has(key))executionGroups.set(key,{strategy:t.strategy,timeframe:t.timeframe,orderType:t.orderType,direction:t.direction,resolved:0,wins:0,losses:0,grossR:0,observedCostR:0,stopGapLosses:0,sensitivity:Object.fromEntries(costSensitivity.map(bps=>[bps,0]))});
  const g=executionGroups.get(key);g.resolved++;g[t.outcome==='win'?'wins':'losses']++;g.grossR+=Number(t.grossR);g.observedCostR+=Number(t.costR)||0;
  if(t.outcome==='loss'&&String(t.reason||'').toLowerCase().includes('stop gapped'))g.stopGapLosses++;
  for(const bps of costSensitivity){const riskPct=Number(t.riskPct);const cost=(riskPct>0?(bps/10000)/(riskPct/100):0);g.sensitivity[bps]+=Number(t.grossR)-cost;}
}
console.log('\\nEXECUTION DIAGNOSTICS (resolved trades; descriptive, not optimized)');
console.table([...executionGroups.values()].map(g=>({strategy:g.strategy,timeframe:g.timeframe,orderType:g.orderType,direction:g.direction,resolved:g.resolved,winRatePct:+(100*g.wins/g.resolved).toFixed(2),avgGrossR:+(g.grossR/g.resolved).toFixed(3),avgObservedCostR:+(g.observedCostR/g.resolved).toFixed(3),avgNetRAtConfiguredCost:+((g.grossR-g.observedCostR)/g.resolved).toFixed(3),stopGapLosses:g.stopGapLosses,avgNetR_0bps:+(g.sensitivity[0]/g.resolved).toFixed(3),avgNetR_5bps:+(g.sensitivity[5]/g.resolved).toFixed(3),avgNetR_10bps:+(g.sensitivity[10]/g.resolved).toFixed(3),avgNetR_15bps:+(g.sensitivity[15]/g.resolved).toFixed(3),avgNetR_20bps:+(g.sensitivity[20]/g.resolved).toFixed(3)})));

console.log('\nCOUNTERFACTUAL FIXED-R TARGET STUDY (same candidates, entries and stops; diagnostic only)');
console.table([...targetSensitivity.values()].map(x=>({strategy:x.strategy,timeframe:x.timeframe,orderType:x.orderType,direction:x.direction,targetR:x.targetR,resolved:x.resolved,wins:x.wins,losses:x.losses,winRatePct:x.resolved?+(100*x.wins/x.resolved).toFixed(2):null,avgNetR:x.resolved?+(x.netR/x.resolved).toFixed(3):null,ambiguous:x.ambiguous,missed:x.missed,unresolved:x.unresolved})));
console.log('\nTOP REJECTIONS');
console.table([...failures.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([reason,count])=>({count,reason})));
const totalResolved=rows.reduce((n,x)=>n+x.resolved,0);
const totalWins=rows.reduce((n,x)=>n+x.wins,0);
const totalLosses=rows.reduce((n,x)=>n+x.losses,0);
const totalNetR=[...stats.values()].reduce((n,x)=>n+x.netR,0);
const averageNetR=totalResolved?totalNetR/totalResolved:null;
console.log('\nSUMMARY',JSON.stringify({
  symbols,requestedTimeframes:requested,barsPerTimeframe:bars,barsByTimeframe:Object.fromEntries(requested.map(tf=>[tf,barsFor(tf)])),roundTripCostBps,
  evaluated:rows.reduce((n,x)=>n+x.evaluated,0),
  candidates:rows.reduce((n,x)=>n+x.candidates,0),
  resolved:totalResolved,wins:totalWins,losses:totalLosses,
  winRatePct:totalResolved?+(100*totalWins/totalResolved).toFixed(2):null,
  averageNetR:averageNetR===null?null:+averageNetR.toFixed(3),
  note:'Exploratory Bybit historical replay, not a profitability guarantee. Excludes funding, partial fills, spread-specific bid/ask fills, and account-specific fee tiers. Drawdown is sorted by simulated exit time across symbols; overlapping positions are not portfolio-simulated.'
},null,2));
if(loadedSymbols===0){
  console.error('REPLAY FAILED: no historical candle data was loaded; refusing to report an empty replay as a successful test.');
  process.exitCode=1;
}else if(totalResolved<30){
  console.error('REPLAY NOT VALIDATED: fewer than 30 unambiguous resolved trades; insufficient evidence to call the engine ready.');
  process.exitCode=1;
}else if(averageNetR<=0){
  console.error('REPLAY FAILED: net expectancy after the configured round-trip cost is not positive; do not treat the current setup engine as ready.');
  process.exitCode=1;
}
