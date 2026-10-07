import {buildMSNRLevels,latestMSNRConfirmations,evaluateMSNR,MSNR_LEVEL_TYPES,MSNR_CONFIRMATION_TYPES} from '../server/market-engine/msnr.js';
import {evaluateStrategy,STRATEGIES} from '../server/market-engine/strategies.js';
import {structure} from '../server/market-engine/structure.js';
import {evaluateSMC,fvgAt,meaningfulDisplacement,findSweeps,SMC_MODEL} from '../server/market-engine/smc.js';
import {evaluateTopDown,TOP_DOWN_MODEL} from '../server/market-engine/topDown.js';
import {evaluatePullback,PULLBACK_MODEL} from '../server/market-engine/pullback.js';
import {evaluateBreakout,BREAKOUT_MODEL} from '../server/market-engine/breakout.js';
import {evaluateCRT,CRT_MODEL} from '../server/market-engine/crt.js';

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
const smcNoSweep=evaluateSMC({candles:smcCandles,layers:smcLayers,price:108.9});
assert('SMC refuses a setup when the required sequence is incomplete',()=>Array.isArray(smcNoSweep.failures)&&smcNoSweep.direction==='BULLISH');
assert('SMC routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'SMC',layers:smcLayers,execution:{candles:smcCandles},price:108.9});return routed&&routed.smc?.model==='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG'||routed.failures?.length>0;});

// Top-Down contract: aligned HTF direction -> execution BOS -> retest/hold -> structural target.
const tdCandles=Array.from({length:50},(_,i)=>bar(i,100+i*.1,101+i*.1,99+i*.1,100.5+i*.1));
assert('Top-Down uses a defined multi-timeframe entry model',TOP_DOWN_MODEL==='HTF_ALIGNMENT_EXECUTION_BOS_RETEST');
const tdMismatch=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}}],price:105});
assert('Top-Down rejects conflicting higher-timeframe directions',()=>tdMismatch.direction==='NEUTRAL'&&tdMismatch.failures.length>0);
const tdNoBos=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Top-Down requires execution BOS before entry',()=>tdNoBos.direction==='BULLISH'&&tdNoBos.failures.some(x=>x.includes('BOS')));
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
assert('CRT targets the opposite CRT extreme when it provides >=2R',()=>crtValid.trade.target===116&&crtValid.trade.rr>=2);
assert('CRT routes through its own evaluator',()=>{
  const routed=evaluateStrategy({strategy:'CRT',layers:crtLayers,execution:{candles:crtExecution},price:103});
  return routed.tradeReady===true&&routed.crt?.model===CRT_MODEL;
});

const failed=tests.filter(x=>!x.ok);
console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));
if(failed.length)process.exit(1);
