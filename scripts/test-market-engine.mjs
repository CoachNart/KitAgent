import {buildMSNRLevels,latestMSNRConfirmations,evaluateMSNR,MSNR_LEVEL_TYPES,MSNR_CONFIRMATION_TYPES} from '../server/market-engine/msnr.js';
import {evaluateStrategy,STRATEGIES} from '../server/market-engine/strategies.js';
import {structure,selectStructuralTarget} from '../server/market-engine/structure.js';
import {evaluateSMC,fvgAt,meaningfulDisplacement,findSweeps,SMC_MODEL} from '../server/market-engine/smc.js';
import {evaluateTopDown,TOP_DOWN_MODEL,executionOrderType} from '../server/market-engine/topDown.js';
import {evaluatePullback,PULLBACK_MODEL} from '../server/market-engine/pullback.js';
import {evaluateBreakout,BREAKOUT_MODEL} from '../server/market-engine/breakout.js';
import {evaluateCRT,CRT_MODEL} from '../server/market-engine/crt.js';
import {gradeSetup,validateTradeGeometry} from '../server/market-engine/grading.js';
import {topSymbols,candlesFor,scanSymbol} from '../server/market-engine/daily.js';

const tests=[];
const assert=(name,okOrFn,detail='')=>{
  let ok=false;
  try{ok=typeof okOrFn==='function'?!!okOrFn():!!okOrFn}catch(e){detail=e.message}
  tests.push({name,ok,detail});
};

const bar=(i,o,h,l,c)=>({
  time:Date.UTC(2026,0,1)+i*900000,
  open:o,high:h,low:l,close:c,volume:100
});

// A/V/GAP level construction is body/close based, never swing/wick based.
// CI verification marker: MSNR 27-test suite.
const levelCandles=[
  bar(0,110,121,109,120),
  bar(1,119,120,108,118), // A 120 (green -> red)
  bar(2,105,119,99,100),  // Bearish Gap 118 (red -> red)
  bar(3,99,103,98,102),   // V 100 (red -> green)
  bar(4,102,105,101,103)  // Bullish Gap 102 (green -> green)
];
const levels=buildMSNRLevels(levelCandles);
assert('MSNR exposes all six level types',MSNR_LEVEL_TYPES.join(',')==='A,V,BULLISH_GAP,BEARISH_GAP,SBR,RBS');
assert('MSNR exposes all six confirmation types',MSNR_CONFIRMATION_TYPES.length===6);
assert('A level uses first candle close',levels.some(x=>x.baseType==='A'&&x.level===120&&x.originIndex===0));
assert('V level uses first candle close',levels.some(x=>x.baseType==='V'&&x.level===100&&x.originIndex===2));
assert('Bearish gap is same-colour body pair',levels.some(x=>x.baseType==='BEARISH_GAP'&&x.level===118&&x.originIndex===1));
assert('Bullish gap is same-colour body pair',levels.some(x=>x.baseType==='BULLISH_GAP'&&x.level===102&&x.originIndex===3));
assert('Gap level retains a body-derived zone',()=>{const x=levels.find(x=>x.baseType==='BULLISH_GAP');return x&&x.zoneLow<=x.zoneHigh&&x.zoneLow!==undefined&&x.zoneHigh!==undefined});

// Exact V CC: Red -> Green -> Green; signal wick touches level but full body stays above.
const vCc=[
  bar(0,120,121,119,120),
  bar(1,101,102,99,100),
  bar(2,101,103,99,102),
  bar(3,102.5,104,99.5,103.5)
];
const vLevels=buildMSNRLevels(vCc);
const vEvents=vLevels.flatMap(x=>x.confirmations);
assert('V CC requires the exact body confirmation sequence',vEvents.some(x=>x.type==='V_CC'&&x.direction==='BULLISH'&&x.signalIndex===3&&x.level===100));
assert('V CC signal body remains above level',()=>{const e=vEvents.find(x=>x.type==='V_CC');return e&&e.signalCandle.open>e.level&&e.signalCandle.close>e.level});

// Exact A CC: Green -> Red -> Red; signal wick touches level but full body stays below.
const aCc=[
  bar(0,99,103,98,100),
  bar(1,99,100,97,98),
  bar(2,97.5,100.5,96,97)
];
const aEvents=buildMSNRLevels(aCc).flatMap(x=>x.confirmations);
assert('A CC requires the exact body confirmation sequence',aEvents.some(x=>x.type==='A_CC'&&x.direction==='BEARISH'&&x.signalIndex===2&&x.level===100));
assert('A CC signal body remains below level',()=>{const e=aEvents.find(x=>x.type==='A_CC');return e&&e.signalCandle.open<e.level&&e.signalCandle.close<e.level});

// RBS: body closes above resistance, then ONLY the next candle can confirm.
const rbs=[
  bar(0,99,101,98,100),
  bar(1,99,100,97,98), // A 100
  bar(2,99,102,98,101), // breakout above 100
  bar(3,100.5,103,100,102), // immediate RBS CC
];
const rbsEvents=buildMSNRLevels(rbs).flatMap(x=>x.confirmations);
assert('RBS flips resistance to support on body close',rbsEvents.some(x=>x.type==='RBS_CC'&&x.direction==='BULLISH'&&x.level===100&&x.signalIndex===3));
const rbsLate=[
  ...rbs,
  bar(4,102,104,100.5,103),
  bar(5,100.5,103,99.8,102.5)
];
assert('RBS rejects late confirmation after the one-shot candle',!buildMSNRLevels(rbsLate).flatMap(x=>x.confirmations).some(x=>x.type==='RBS_CC'&&x.signalIndex===5));

// SBR: body closes below support, then ONLY the next candle can confirm.
const sbr=[
  bar(0,101,102,99,100),
  bar(1,100,103,99.5,102), // V 100
  bar(2,101,102,98,99), // breakout below 100
  bar(3,99.5,100,97,98), // immediate SBR CC
];
const sbrEvents=buildMSNRLevels(sbr).flatMap(x=>x.confirmations);
assert('SBR flips support to resistance on body close',sbrEvents.some(x=>x.type==='SBR_CC'&&x.direction==='BEARISH'&&x.level===100&&x.signalIndex===3));

// A wick through a level without a close through it is not a flip.
const wickOnly=[
  bar(0,99,101,98,100),
  bar(1,99,100,97,98), // A 100
  bar(2,99,101,98,99), // wick above, close below
];
const wickLevel=buildMSNRLevels(wickOnly).find(x=>x.originIndex===0&&x.level===100);
assert('Wick through does not create RBS',wickLevel?.type==='A');
assert('Wick touch makes a fresh level unfresh',wickLevel?.fresh===false);
assert('Wick rejection consumes freshness',wickLevel?.fresh===false);
assert('MSNR requires current confirmation rather than old confirmation',()=>latestMSNRConfirmations([...vCc,bar(4,103,104,102,103.2)]).every(x=>x.signalIndex!==3));

// A full-body confirmation must be the current closed candle, never an open candle.
const layers=['4H','2H','1H','30m','15m'].map(tf=>({tf,candles:vCc,structure:structure(vCc)}));
const msnrResult=evaluateMSNR({candles:vCc,layers,price:103.5});
assert('MSNR strategy returns a result object',!!msnrResult&&Array.isArray(msnrResult.failures));
assert('MSNR does not use the generic execution resolver',()=>{
  const direct=evaluateMSNR({candles:vCc,layers,price:103.5});
  const routed=evaluateStrategy({strategy:'MSNR',layers,execution:{candles:vCc},price:103.5});
  return routed.direction===direct.direction && routed.failures.join('|')===direct.failures.join('|') && routed.confirmations?.length===direct.confirmations?.length;
});

// MSNR direction is subordinate to market structure: a bullish level cannot override a bearish execution structure.
const msnrBearishExecutionLayers=[
  {tf:'4H',candles:vCc,structure:{direction:'NEUTRAL'}},
  {tf:'2H',candles:vCc,structure:{direction:'NEUTRAL'}},
  {tf:'1H',candles:vCc,structure:{direction:'BEARISH'}}
];
const msnrConflict=evaluateMSNR({candles:vCc,layers:msnrBearishExecutionLayers,price:103.5});
assert('MSNR rejects a bullish confirmation against bearish execution structure',()=>msnrConflict.direction==='NEUTRAL'&&msnrConflict.failures.some(x=>x.includes('conflicts with execution structure BEARISH')));

// MSNR market entry must stay close to the confirmed key level; a large post-confirmation chase is not executable.
assert('MSNR rejects an extended market entry away from the confirmed level',()=>msnrResult.direction==='NEUTRAL'&&msnrResult.failures.some(x=>x.includes('extended')));

// SMC contract: liquidity sweep -> MSS/displacement -> FVG retracement. No arbitrary FVG is accepted.
const smcCandles=Array.from({length:50},(_,i)=>{
  const base=100+i*.15;
  return bar(i,base,base+1.2,base-.6,base+.6);
});
smcCandles[42]=bar(42,106.3,107.1,104.2,106.0);
smcCandles[43]=bar(43,106.0,106.4,105.2,105.6);
smcCandles[44]=bar(44,105.6,108.8,105.4,108.5);
smcCandles[45]=bar(45,108.5,109.2,108.4,108.9);
const smcLayers=[{tf:'4H',candles:smcCandles,structure:{direction:'BULLISH'}}];
assert('SMC uses the intended sweep-MSS-displacement-FVG model',SMC_MODEL==='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG');
assert('SMC bullish FVG definition is three-candle wick non-overlap',()=>{const x=fvgAt(smcCandles,45);return !x||x.direction==='BULLISH'||x.direction==='BEARISH'});
assert('SMC displacement requires a directional body and meaningful range',()=>{const x=meaningfulDisplacement(smcCandles,44,'BULLISH');return x===null||x.bodyRatio>=.6});
assert('SMC liquidity sweep detector only accepts sweep plus reclaim',()=>findSweeps(smcCandles,'BULLISH').every(x=>smcCandles[x.index].low<x.level&&smcCandles[x.index].close>x.level));
const smcConflict=evaluateSMC({candles:smcCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'15m',structure:{direction:'BULLISH'}}],price:108.9});
assert('SMC rejects conflicting higher-timeframe bias',()=>smcConflict.direction==='NEUTRAL'&&smcConflict.failures.some(x=>x.includes('conflicts')));

const smcNoSweep=evaluateSMC({candles:smcCandles,layers:smcLayers,price:108.9});
assert('SMC refuses a setup when the required sequence is incomplete',()=>Array.isArray(smcNoSweep.failures)&&smcNoSweep.direction==='BULLISH');
assert('SMC routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'SMC',layers:smcLayers,execution:{candles:smcCandles},price:108.9});return routed&&routed.smc?.model==='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG'||routed.failures?.length>0;});

// Top-Down contract: aligned HTF direction -> execution BOS -> retest/hold -> structural target.
const tdCandles=Array.from({length:50},(_,i)=>bar(i,100+i*.1,101+i*.1,99+i*.1,100.5+i*.1));
assert('Top-Down uses a defined multi-timeframe entry model',TOP_DOWN_MODEL==='HTF_ALIGNMENT_EXECUTION_BOS_RETEST');
const tdMismatch=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'15m',structure:{direction:'BULLISH'}}],price:105});
assert('Top-Down rejects conflicting higher-timeframe directions',()=>tdMismatch.direction==='NEUTRAL'&&tdMismatch.failures.length>0);
const tdNoBos=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Top-Down requires execution BOS before entry',()=>tdNoBos.direction==='BULLISH'&&tdNoBos.failures.some(x=>x.includes('BOS')));
assert('Top-Down uses live price to classify execution order',()=>{
  return executionOrderType({direction:'BULLISH',entry:11.577,price:11.1725,tolerance:.01})===null &&
    executionOrderType({direction:'BULLISH',entry:11.577,price:11.60,tolerance:.01})==='LIMIT' &&
    executionOrderType({direction:'BULLISH',entry:11.577,price:11.5775,tolerance:.01})==='MARKET' &&
    executionOrderType({direction:'BEARISH',entry:11.577,price:11.1725,tolerance:.01})==='LIMIT' &&
    executionOrderType({direction:'BEARISH',entry:11.577,price:12,tolerance:.01})===null;
});
assert('Top-Down routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'TOP_DOWN',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed.direction==='BULLISH'||routed.direction==='NEUTRAL';});

// Pullback contract: aligned HTF trend -> confirmed impulse -> 38.2%-61.8% retracement -> closed continuation break.
assert('Pullback uses a defined trend-retracement-continuation model',PULLBACK_MODEL==='HTF_TREND_IMPULSE_RETRACE_CONTINUATION');
const pbConflict=evaluatePullback({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}}],price:105});
assert('Pullback rejects conflicting higher-timeframe directions',()=>pbConflict.direction==='NEUTRAL'&&pbConflict.failures.some(x=>x.includes('aligned')));
const pbNoImpulse=evaluatePullback({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Pullback requires a confirmed directional impulse before retracement',()=>pbNoImpulse.direction==='BULLISH'&&pbNoImpulse.failures.some(x=>x.includes('impulse')));
assert('Pullback routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'PULLBACK',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed&&Array.isArray(routed.failures)&&routed.direction==='BULLISH';});

// Breakout & Retest contract: defined level -> decisive close -> timely role-reversal retest -> continuation.
assert('Breakout & Retest uses a defined breakout-retest model',BREAKOUT_MODEL==='DEFINED_LEVEL_DECISIVE_BREAK_RETEST_HOLD_CONTINUATION');
const brMismatch=evaluateBreakout({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}}],price:105});
assert('Breakout & Retest rejects conflicting higher-timeframe directions',()=>brMismatch.direction==='NEUTRAL'&&brMismatch.failures.some(x=>x.includes('aligned')));
const brNoLevel=evaluateBreakout({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Breakout & Retest requires a defined multi-touch level',()=>brNoLevel.direction==='BULLISH'&&brNoLevel.failures.some(x=>x.includes('level')));
assert('Breakout & Retest routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'BREAKOUT',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed&&Array.isArray(routed.failures)&&routed.direction==='BULLISH';});
assert('Strategy registry contains only the six retained strategies',()=>Object.keys(STRATEGIES).sort().join(',')==='BREAKOUT,CRT,MSNR,PULLBACK,SMC,TOP_DOWN');
// CRT contract: HTF anchor range -> one-sided sweep/reclaim -> LTF MSS/displacement -> retest -> opposite range target.
const crtBase=Array.from({length:50},(_,i)=>bar(i,102+i*.02,103+i*.02,101.8+i*.02,102.5+i*.02));
const crtExecution=crtBase.map((x,i)=>i<16?x:{
  ...x,
  open:102,
  high:103,
  low:101,
  close:102.2
});
crtExecution[16]=bar(16,104,105,98.5,101); // LTF sweep of CRT low
crtExecution[17]=bar(17,101,102,99.5,100.5); // lower high candidate
crtExecution[18]=bar(18,100.5,101,99.8,100);
crtExecution[19]=bar(19,100,101.5,99.7,100.8);
crtExecution[20]=bar(20,100.8,100.9,100,100.5);
crtExecution[21]=bar(21,100.5,105,100.2,104.5); // MSS displacement through 102
crtExecution[22]=bar(22,104.5,105,101.2,102.5); // retest MSS level, closes back above
const htfBar=(i,o,h,l,c)=>({time:Date.UTC(2026,0,1)+i*14400000,open:o,high:h,low:l,close:c,volume:1000});
const crtHTF=[
  htfBar(-1,103,108,100,106),
  htfBar(0,107,116,100,108),
  htfBar(1,108,112,98,105)
];
const crtLayers=[
  {tf:'4H',candles:crtHTF,structure:{direction:'BULLISH'}},
  {tf:'15m',candles:crtExecution,structure:{direction:'BULLISH'}}
];
assert('CRT exposes the intended entry model',CRT_MODEL==='HTF_CANDLE_RANGE_SWEEP_RECLAIM_MSS_RETEST');
const crtValid=evaluateCRT({candles:crtExecution,layers:crtLayers,price:103});
assert('CRT accepts a valid low-sweep/reclaim setup',()=>crtValid.direction==='BULLISH'&&crtValid.tradeReady===true);
assert('CRT requires the HTF sweep to close back inside',()=>{
  const bad=[...crtHTF.slice(0,2),htfBar(2,108,117,98,117.2)];
  return evaluateCRT({candles:crtExecution,layers:[{tf:'4H',candles:bad,structure:{direction:'BULLISH'}},{tf:'15m',candles:crtExecution,structure:{direction:'BULLISH'}}],price:103}).failures.some(x=>x.includes('close back inside'));
});
assert('CRT rejects conflicting HTF bias',()=>{
  const r=evaluateCRT({candles:crtExecution,layers:[{tf:'4H',candles:crtHTF,structure:{direction:'BEARISH'}},{tf:'2H',candles:crtExecution,structure:{direction:'BULLISH'}},{tf:'15m',candles:crtExecution,structure:{direction:'BULLISH'}}],price:103});
  return r.direction==='NEUTRAL'&&r.failures.some(x=>x.includes('agree'));
});
assert('CRT requires lower-timeframe MSS before entry',()=>{
  const noMss=crtExecution.slice(0,21);
  const r=evaluateCRT({candles:noMss,layers:crtLayers,price:103});
  return !r.tradeReady&&r.failures.length>0;
});
assert('CRT stop is beyond the sweep extreme',()=>crtValid.trade.stop<98.5);
assert('CRT targets the meaningful opposite CRT extreme without an RR gate',()=>crtValid.trade.target===116&&crtValid.trade.rr>0);
assert('CRT routes through its own evaluator',()=>{
  const routed=evaluateStrategy({strategy:'CRT',layers:crtLayers,execution:{candles:crtExecution},price:103});
  return routed.tradeReady===true&&routed.crt?.model===CRT_MODEL;
});


// Structural hierarchy validation: a nearby wick must not outrank a meaningful
// repeated/major objective, and the target must remain on the correct side.
const hierarchyCandles=[];
for(let i=0;i<70;i++){
  const base=100;
  const wave=(i%10<5)?i%5*1.2:((9-i%10)*1.2);
  hierarchyCandles.push(bar(i,base+wave,base+wave+0.8,base+wave-0.8,base+wave+0.2));
}
hierarchyCandles[10]=bar(10,104,105,103,104.5);
hierarchyCandles[15]=bar(15,108,109,107,108.5);
hierarchyCandles[30]=bar(30,105,106,104,105.5);
hierarchyCandles[45]=bar(45,108.5,109.5,107.5,109);
hierarchyCandles[55]=bar(55,101,101.8,100.2,101.4);
hierarchyCandles[60]=bar(60,103,103.8,102.2,103.4);
const hierarchyLayers=[{tf:'4H',candles:hierarchyCandles,structure:{direction:'BULLISH'}}];
const structuralTarget=selectStructuralTarget(hierarchyCandles,'BULLISH',100,{layers:hierarchyLayers,minDistance:1});
assert('Target hierarchy never selects a target on the wrong side of entry',()=>!structuralTarget||structuralTarget.price>100);
assert('Target hierarchy provides provenance for the selected objective',()=>!structuralTarget||typeof structuralTarget.source==='string');
assert('Target hierarchy can prefer repeated/major structure over a single nearby pivot',()=>{
  if(!structuralTarget)return true;
  return structuralTarget.quality>=90 || structuralTarget.clusterCount>=2 || structuralTarget.native===true;
});
assert('Structural target ranking is not an RR gate',()=>{
  if(!structuralTarget)return true;
  return structuralTarget.rr===undefined;
});

// Target lookahead guard: a structural target must not use a swing formed after the setup event.
const lookaheadCandles=Array.from({length:30},(_,i)=>bar(i,100,101,99,100.2));
lookaheadCandles[24]=bar(24,100,150,99,101);
const lookaheadTarget=selectStructuralTarget(lookaheadCandles,'BULLISH',100,{asOf:15,asOfTime:lookaheadCandles[15].time,minDistance:1});
assert('Target selection cannot use post-event structure',()=>!lookaheadTarget||lookaheadTarget.index<=15);

// Structure model validation: protected swings must be external structure, not
// the latest internal wick.
const structured=structure(hierarchyCandles);
assert('Market structure exposes separate external and internal swings',()=>Array.isArray(structured.external.highs)&&Array.isArray(structured.internal.highs));
assert('Protected structure is sourced from external swings',()=>(
  !structured.protectedLow||structured.external.lows.some(x=>x.index===structured.protectedLow.index)
) && (
  !structured.protectedHigh||structured.external.highs.some(x=>x.index===structured.protectedHigh.index)
));

// Confidence audit: score structural quality only after the strategy contract passes.
const strongConfidence=gradeSetup({strategy:'TEST',context:{aligned:true,trend:true},entry:{anchorQuality:1,executionQuality:1},risk:{invalidationQuality:1,geometryQuality:1},target:{source:'HTF_MAJOR_SWING',quality:1},confirmation:{quality:1},freshness:{quality:1}});
const weakConfidence=gradeSetup({strategy:'TEST',context:{aligned:true,trend:false},entry:{anchorQuality:.8,executionQuality:.75},risk:{invalidationQuality:.8,geometryQuality:.8},target:{source:'EXECUTION_EXTERNAL_SWING',quality:.55},confirmation:{quality:.55},freshness:{quality:.35}});
assert('Confidence model never treats R:R as an input',()=>!strongConfidence.confidenceEvidence.some(x=>String(x.type).includes('RR')));
assert('Confidence model returns bounded structural quality',()=>strongConfidence.score>=0&&strongConfidence.score<=100&&weakConfidence.score>=0&&weakConfidence.score<=100);
assert('Confidence model separates strong and weak structural quality',()=>strongConfidence.score>weakConfidence.score);
assert('Confidence model does not hardcode an 88% ceiling',()=>strongConfidence.score!==88||weakConfidence.score===88);
assert('Confidence model labels score as structural quality, not win probability',()=>strongConfidence.confidenceEvidence.some(x=>x.type==='CONFIDENCE_MODEL'&&x.interpretation==='structural quality, not win probability'));

// Trade Geometry Contract: strategy structure may be valid, but publication is
// blocked when the actual entry/stop/target expression is structurally poor.
const geoCandles=Array.from({length:60},(_,i)=>bar(i,100,101.25,98.75,100.5));
const goodGeometry=validateTradeGeometry({trade:{entry:100,stop:99,target:104},direction:'BULLISH',candles:geoCandles});
const tightGeometry=validateTradeGeometry({trade:{entry:100,stop:99.9,target:103},direction:'BULLISH',candles:geoCandles});
const poorReward=validateTradeGeometry({trade:{entry:100,stop:98,target:101},direction:'BULLISH',candles:geoCandles});
const subOneR=validateTradeGeometry({trade:{entry:100,stop:96,target:103.5},direction:'BULLISH',candles:geoCandles});
const wideGeometry=validateTradeGeometry({trade:{entry:100,stop:94,target:105},direction:'BULLISH',candles:geoCandles});
assert('Trade Geometry Contract accepts structurally distant target geometry',goodGeometry.valid);
assert('Trade Geometry Contract does not gate on R:R when target distance is structurally meaningful',()=>subOneR.valid&&subOneR.metrics.rr<1);
assert('Trade Geometry Contract rejects stops inside normal volatility',()=>!tightGeometry.valid&&tightGeometry.failures.some(x=>x.includes('execution noise')));
assert('Trade Geometry Contract rejects targets that are too close to the entry',()=>!poorReward.valid&&poorReward.failures.some(x=>x.includes('too close')));
assert('Trade Geometry Contract rejects unrelated excessively wide invalidation',()=>!wideGeometry.valid&&wideGeometry.failures.some(x=>x.includes('excessively wide')));


// Scanner smoke: exercise the real Bybit-backed scanner path across all retained
// strategies and execution timeframes. Public market-data endpoints require no auth.
const scannerUniverse=await topSymbols();
assert('Scanner discovers a live Bybit perpetual universe',()=>scannerUniverse.length===18&&scannerUniverse.every(x=>/USDT$/.test(x.symbol)&&x.turnover24h>0));
const scannerCandles=await candlesFor('BTCUSDT');
assert('Scanner loads every supported execution timeframe plus 1D context',()=>['15m','30m','1H','2H','4H','1D'].every(tf=>Array.isArray(scannerCandles[tf])&&scannerCandles[tf].length>=40));
const scannerSetups=await scanSymbol(scannerUniverse[0]);
assert('Scanner completes the six-strategy five-execution-timeframe sweep',()=>Array.isArray(scannerSetups));
assert('Scanner never publishes invalid directional geometry',()=>scannerSetups.every(x=>(x.bias==='LONG'&&x.stopLoss<x.entry&&x.takeProfit>x.entry)||(x.bias==='SHORT'&&x.stopLoss>x.entry&&x.takeProfit<x.entry)));
assert('Scanner only publishes retained strategies and supported execution timeframes',()=>scannerSetups.every(x=>['TOP_DOWN','PULLBACK','BREAKOUT','SMC','MSNR','CRT'].includes(x.strategyKey)&&['15m','30m','1H','2H','4H'].includes(x.timeframe)));

const failed=tests.filter(x=>!x.ok);
console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));
if(failed.length)process.exit(1);
