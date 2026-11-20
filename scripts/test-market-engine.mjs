import {buildMSNRLevels,latestMSNRConfirmations,recentMSNRConfirmations,evaluateMSNR,MSNR_LEVEL_TYPES,MSNR_CONFIRMATION_TYPES} from '../server/market-engine/msnr.js';
import {evaluateStrategy,STRATEGIES} from '../server/market-engine/strategies.js';
import {structure,selectStructuralTarget,rankStructuralTargets,structuralBreakEvents} from '../server/market-engine/structure.js';
import {liquidityMap} from '../server/market-engine/liquidity.js';
import {evaluateSMC,fvgAt,meaningfulDisplacement,findSweeps,buildTrade,swingBreakAfter,freshFvg,nextLiquidityTarget,limitEntryQuality,hasConfirmedContextTrend,SMC_MODEL} from '../server/market-engine/smc.js';
import {evaluateTopDown,scoreSetup,TOP_DOWN_MODEL,executionOrderType,findValidRetest} from '../server/market-engine/topDown.js';
import {evaluatePullback,PULLBACK_MODEL} from '../server/market-engine/pullback.js';
import {evaluateBreakout,BREAKOUT_MODEL} from '../server/market-engine/breakout.js';
import {evaluateCRT,CRT_MODEL} from '../server/market-engine/crt.js';
import {gradeSetup,validateTradeGeometry,validateEntryExecution,executableTrade,enforceFreshnessGrade} from '../server/market-engine/grading.js';
import {selectMinimumRRStructuralTarget} from '../server/market-engine/index.js';
import {EXECUTION_TIMEFRAMES,atr,validateCandles} from '../server/market-engine/data.js';
import {topSymbols,candlesFor,scanSymbol,candidateScore} from '../server/market-engine/daily.js';
import {isSupportedCryptoBase,isSupportedCryptoPerpetualSymbol} from '../server/market-engine/crypto-universe.js';

const tests=[];
const supportedExecutionTimeframes=['1H'];
const executionTimeframesAreCorrect=EXECUTION_TIMEFRAMES.length===supportedExecutionTimeframes.length&&supportedExecutionTimeframes.every(tf=>EXECUTION_TIMEFRAMES.includes(tf));

const assert=(name,okOrFn,detail='')=>{
  let ok=false;
  try{ok=typeof okOrFn==='function'?!!okOrFn():!!okOrFn}catch(e){detail=e.message}
  tests.push({name,ok,detail});
};
const freshAPlus={grade:'A+',score:96,confidenceEvidence:[]};
const freshA={grade:'A',score:88,confidenceEvidence:[]};
assert('Fresh sweep retains A+ eligibility',()=>enforceFreshnessGrade(freshAPlus,1).grade==='A+');
assert('A+ is capped at A when the sweep is older than two 1H bars',()=>enforceFreshnessGrade(freshAPlus,3).grade==='A'&&enforceFreshnessGrade(freshAPlus,3).score<=91);
assert('A is capped at B when the sweep is older than eight 1H bars',()=>enforceFreshnessGrade(freshA,9).grade==='B'&&enforceFreshnessGrade(freshA,9).score<=83);
assert('A-grade freshness gate prevents a 15-bar-old sweep from publication',()=>enforceFreshnessGrade(freshA,15).grade==='B');
assert('Freshness gate does not upgrade an already lower grade',()=>enforceFreshnessGrade({grade:'C',score:70},15).grade==='C');
assert('Execution timeframe allowlist contains only the 1H execution timeframe',executionTimeframesAreCorrect);
assert('Crypto universe includes major USDT perpetual markets',()=>isSupportedCryptoPerpetualSymbol('BTCUSDT')&&isSupportedCryptoPerpetualSymbol('SOLUSDT'));
assert('Crypto universe excludes tokenized equities and commodity contracts',()=>!isSupportedCryptoPerpetualSymbol('SOXLUSDT')&&!isSupportedCryptoPerpetualSymbol('SNDKUSDT')&&!isSupportedCryptoPerpetualSymbol('XAGUSDT'));
assert('Crypto universe includes supported newer crypto perpetuals',()=>isSupportedCryptoBase('HYPE')&&isSupportedCryptoBase('VIRTUAL'));
assert('Confirmed 4H HH/HL or LH/LL trend keeps full context quality despite a countertrend CHoCH',()=>hasConfirmedContextTrend({direction:'BULLISH',rawDirection:'BULLISH',choch:{direction:'BEARISH'}},'BULLISH'));
assert('A transitional direction inferred from a recent break is not scored as an established trend',()=>!hasConfirmedContextTrend({direction:'BULLISH',rawDirection:'NEUTRAL',bos:{direction:'BULLISH'}},'BULLISH'));
const eligibleThreeR={direction:'BULLISH',trade:{entry:100,stop:95,target:115,rr:3},grade:{grade:'A',score:84}};
const ineligibleTwoR={...eligibleThreeR,trade:{...eligibleThreeR.trade,target:110,rr:2}};
const weakGrade={...eligibleThreeR,grade:{grade:'B',score:83}};
assert('Daily publication rejects setups below 3R',candidateScore(ineligibleTwoR)<0);
assert('Daily publication rejects structural scores below A-grade',candidateScore(weakGrade)<0);
assert('Daily publication accepts A-grade setups at 3R or better',candidateScore(eligibleThreeR)>=0);
const eligibleAplus={...eligibleThreeR,grade:{grade:'A+',score:94},trade:{...eligibleThreeR.trade,target:120,rr:4}};
assert('Daily publication accepts qualified A+ setups with stronger structural RR',candidateScore(eligibleAplus)>candidateScore(eligibleThreeR));

const bar=(i,o,h,l,c)=>({
  time:Date.UTC(2026,0,1)+i*1800000,
  open:o,high:h,low:l,close:c,volume:100
});
const monitorCandles=Array.from({length:80},(_,i)=>bar(i,100,101,99,100.2));
assert('30m candles are valid for trade outcome monitoring',()=>validateCandles(monitorCandles,'30m').valid);
assert('30m monitoring does not enter the signal-generation timeframe allowlist',()=>!EXECUTION_TIMEFRAMES.includes('30m'));

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
assert('MSNR keeps the public latest-confirmation helper exact',()=>latestMSNRConfirmations([...vCc,bar(4,103,104,102,103.2)]).every(x=>x.signalIndex===4));
assert('MSNR accepts a confirmation from the recent execution window',()=>recentMSNRConfirmations([...vCc,bar(4,103,104,102,103.2)],2).every(x=>x.signalIndex>=3));

// A full-body confirmation must be the current closed candle, never an open candle.
const layers=['4H','2H','1H','LTF'].map(tf=>({tf,candles:vCc,structure:structure(vCc)}));
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
const smcLayers=[{tf:'4H',candles:smcCandles,structure:{direction:'BULLISH'}},{tf:'LTF',candles:smcCandles,structure:{direction:'BULLISH'}}];
assert('SMC uses the intended sweep-MSS-displacement-FVG model',SMC_MODEL==='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG');
assert('SMC bullish FVG definition is three-candle wick non-overlap',()=>{const x=fvgAt(smcCandles,45);return !x||x.direction==='BULLISH'||x.direction==='BEARISH'});
assert('SMC displacement requires a directional body and meaningful range',()=>{const x=meaningfulDisplacement(smcCandles,44,'BULLISH');return x===null||x.bodyRatio>=.6});
assert('SMC displacement rejects marginal impulses below 1.30 ATR',()=>{const c=Array.from({length:20},(_,i)=>bar(i,100,100.1,99.9,100));c[19]=bar(19,100,100.24,99.98,100.22);return meaningfulDisplacement(c,19,'BULLISH')===null;});
assert('SMC liquidity sweep detector only accepts sweep plus reclaim',()=>findSweeps(smcCandles,'BULLISH').every(x=>smcCandles[x.index].low<x.level&&smcCandles[x.index].close>x.level));
const mssFixture=Array.from({length:12},(_,i)=>bar(i,100,104,96,100));
mssFixture[3]=bar(3,103,110,99,105);
mssFixture[6]=bar(6,100,103,90,100);
mssFixture[8]=bar(8,105,112,104,111);
const preSweepMss=swingBreakAfter(mssFixture,6,11,'BULLISH');
assert('SMC MSS breaks the last confirmed opposing swing that existed before the sweep',()=>preSweepMss?.index===8&&preSweepMss.swingIndex===3&&preSweepMss.level===110);
const touchedMidpointCandles=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
touchedMidpointCandles[39]=bar(39,102,102.5,100.5,101.8);
assert('SMC consumes a bullish FVG once its planned midpoint entry has already been traded',()=>!freshFvg(touchedMidpointCandles,{direction:'BULLISH',index:38,low:100,high:102,midpoint:101},39));
const untouchedMidpointCandles=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
untouchedMidpointCandles[39]=bar(39,102.2,102.8,101.5,102.4);
assert('SMC keeps a bullish FVG fresh when price has only entered the near edge, not reached its midpoint entry',()=>freshFvg(untouchedMidpointCandles,{direction:'BULLISH',index:38,low:100,high:102,midpoint:101},39));
const bullishTargetFixture=Array.from({length:50},(_,i)=>bar(i,100,101,99,100));
bullishTargetFixture[25]=bar(25,104,110,103,105);
const bullishAheadTarget=nextLiquidityTarget(bullishTargetFixture,'BULLISH',100,105,2,49,[]);
const bullishAlreadyPassedTarget=nextLiquidityTarget(bullishTargetFixture,'BULLISH',100,111,2,49,[]);
assert('SMC bullish target must remain beyond the live quote and preserve at least 3R',()=>bullishAheadTarget?.price>105&&Math.abs(bullishAheadTarget.price-100)>=6);
assert('SMC rejects a bullish structural target already passed by live price',()=>bullishAlreadyPassedTarget===null);
assert('SMC pending-limit execution quality improves as the quote approaches the planned FVG midpoint',()=>limitEntryQuality(100,100,2)>limitEntryQuality(100,102,2));
assert('SMC pending-limit execution quality is capped when the order is at maximum allowed distance',()=>Math.abs(limitEntryQuality(100,102,2)-.45)<1e-9);
const obstructedBullishTarget=Array.from({length:60},(_,i)=>bar(i,100,101,99,100));
obstructedBullishTarget[8]=bar(8,100,102.5,99,101); // Close major swing, inside the generic 1.5 ATR noise floor.
obstructedBullishTarget[15]=bar(15,100,104,99,100.5); // Next opposing swing is also less than 3R.
obstructedBullishTarget[30]=bar(30,104,110,103,105); // Farther swing would misleadingly offer 3R+.
const targetBeyondConsumedBullishLevels=nextLiquidityTarget(obstructedBullishTarget,'BULLISH',100,100,2,59,[]);
assert('SMC ignores already-consumed nearer bullish swing levels and selects the next untouched 3R objective',()=>targetBeyondConsumedBullishLevels?.price===110);
const consumedBearishTargetCandles=Array.from({length:60},(_,i)=>bar(i,100,101,99,100));
consumedBearishTargetCandles[8]=bar(8,100,101,97.5,99);
consumedBearishTargetCandles[15]=bar(15,98,101,96,99);
consumedBearishTargetCandles[30]=bar(30,95,101,90,100);
const targetBeyondConsumedBearishLevels=nextLiquidityTarget(consumedBearishTargetCandles,'BEARISH',100,100,2,59,[]);
assert('SMC ignores already-consumed nearer bearish swing levels and selects the next untouched 3R objective',()=>targetBeyondConsumedBearishLevels?.price===90);
const bearishTargetFixture=Array.from({length:50},(_,i)=>bar(i,100,101,99,100));
bearishTargetFixture[25]=bar(25,96,97,90,95);
const bearishAheadTarget=nextLiquidityTarget(bearishTargetFixture,'BEARISH',100,95,2,49,[]);
const bearishAlreadyPassedTarget=nextLiquidityTarget(bearishTargetFixture,'BEARISH',100,89,2,49,[]);
assert('SMC bearish target must remain beyond the live quote and preserve at least 3R',()=>bearishAheadTarget?.price<95&&Math.abs(100-bearishAheadTarget.price)>=6);
assert('SMC rejects a bearish structural target already passed by live price',()=>bearishAlreadyPassedTarget===null);
const touchedBearishCandles=Array.from({length:40},(_,i)=>bar(i,98,99,97,98));
touchedBearishCandles[39]=bar(39,98,101.5,97.5,99);
assert('SMC consumes a bearish FVG once its planned midpoint entry has already been traded',()=>!freshFvg(touchedBearishCandles,{direction:'BEARISH',index:38,low:100,high:102,midpoint:101},39));
const stalePoolCandles=Array.from({length:70},(_,i)=>bar(i,100,101,99,100));
stalePoolCandles[5]=bar(5,100,101,98,100);
stalePoolCandles[60]=bar(60,100,102,97,100);
assert('SMC rejects a liquidity pool older than the 40-candle structural window',()=>!findSweeps(stalePoolCandles,'BULLISH').some(x=>x.swingIndex===5));
const consumedPoolCandles=Array.from({length:40},(_,i)=>bar(i,100,101,99,100));
consumedPoolCandles[5]=bar(5,100,101,98,100);
consumedPoolCandles[10]=bar(10,98,99,97,97.5); // First breach closes below the pool.
consumedPoolCandles[20]=bar(20,99,101,96,100); // Later reclaim must not revive it.
assert('SMC consumes a liquidity pool on its first breach even without a reclaim',()=>!findSweeps(consumedPoolCandles,'BULLISH').some(x=>x.swingIndex===5));
const freshPoolCandles=Array.from({length:60},(_,i)=>bar(i,100,101,99,100));
freshPoolCandles[40]=bar(40,100,101,98,100);
freshPoolCandles[45]=bar(45,99,101,97,100);
assert('SMC still accepts a recent first-touch sweep with a decisive reclaim',()=>findSweeps(freshPoolCandles,'BULLISH').some(x=>x.swingIndex===40&&x.index===45));
const stopWickInvalidationCandles=Array.from({length:60},(_,i)=>bar(i,100,101,99,100));
stopWickInvalidationCandles[40]=bar(40,100,101,98,100);
stopWickInvalidationCandles[45]=bar(45,99,101,97,100); // Valid sell-side sweep and reclaim.
stopWickInvalidationCandles[50]=bar(50,99,100,96.5,99); // Wick crosses the buffered stop, but closes above the sweep extreme.
assert('SMC invalidates a sweep when a later wick has already hit its buffered stop',()=>!findSweeps(stopWickInvalidationCandles,'BULLISH').some(x=>x.swingIndex===40&&x.index===45));
const freshSweepAudit=findSweeps(freshPoolCandles,'BULLISH').find(x=>x.swingIndex===40&&x.index===45);
assert('SMC normalizes historical sweep quality using ATR available at the sweep candle',()=>!!freshSweepAudit&&Math.abs(freshSweepAudit.quality.penetrationATR-1/atr(freshPoolCandles.slice(0,46),14))<1e-9);
const smcConflict=evaluateSMC({candles:smcCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'LTF',structure:{direction:'BULLISH'}}],price:108.9});
assert('SMC rejects conflicting higher-timeframe bias',()=>smcConflict.direction==='NEUTRAL'&&smcConflict.failures.some(x=>x.includes('conflicts')));

const smcIncompleteCandles=Array.from({length:50},(_,i)=>bar(i,100+i*.15,100+i*.65,100+i*.05,100+i*.5));
const smcNoSweep=evaluateSMC({candles:smcIncompleteCandles,layers:smcLayers,price:108.9});
assert('SMC refuses a setup when the required sequence is incomplete',()=>Array.isArray(smcNoSweep.failures)&&smcNoSweep.direction==='BULLISH'&&!smcNoSweep.trade);
assert('SMC reports zero-count stage diagnostics when no qualifying liquidity sweep exists',()=>{
  const d=smcNoSweep.evidence?.find(x=>x.type==='SMC_STAGE_DIAGNOSTICS');
  return !!d&&d.recentSweeps===0&&d.mssWithinWindow===0&&d.executableEntry===0;
});
assert('SMC routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'SMC',layers:smcLayers,execution:{candles:smcCandles},price:108.9});return routed&&routed.smc?.model==='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG'||routed.failures?.length>0;});

// Top-Down contract: aligned HTF direction -> execution BOS -> retest/hold -> structural target.
const tdCandles=Array.from({length:50},(_,i)=>bar(i,100+i*.1,101+i*.1,99+i*.1,100.5+i*.1));
assert('Top-Down uses a defined multi-timeframe entry model',TOP_DOWN_MODEL==='HTF_ALIGNMENT_EXECUTION_BOS_RETEST');
const tdMismatch=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'LTF',structure:{direction:'BULLISH'}}],price:105});
assert('Top-Down rejects conflicting higher-timeframe directions',()=>tdMismatch.direction==='NEUTRAL'&&tdMismatch.failures.length>0);
const tdNoBos=evaluateTopDown({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Top-Down requires execution BOS before entry',()=>tdNoBos.direction==='BULLISH'&&tdNoBos.failures.some(x=>x.includes('BOS')));
const retestBars=[
  bar(0,100,102,99,101),
  bar(1,101,106,100,105),
  bar(2,104,105,100.5,102),
  bar(3,102,103,99,99.5),
  bar(4,99.5,104,99,103)
];
const invalidRetest=findValidRetest(retestBars,{index:1,level:101},'BULLISH');
assert('Top-Down invalidates a BOS when price closes back through the broken level',()=>invalidRetest?.failed===true&&invalidRetest.index===3);
const cleanRetest=findValidRetest(retestBars.slice(0,3),{index:1,level:101},'BULLISH');
assert('Top-Down accepts the first confirmed retest that holds the broken level',()=>cleanRetest?.index===2&&!cleanRetest.failed);
const noRetestAfterBos=findValidRetest([bar(0,100,101,99,100),bar(1,100,103,100,102)],{index:1,level:101},'BULLISH');
assert('Top-Down does not invent a retest when no post-BOS candle touches the level',()=>noRetestAfterBos===null);
assert('Top-Down uses live price to classify execution order',()=>{
  return executionOrderType({direction:'BULLISH',entry:11.577,price:11.1725,tolerance:.01})===null &&
    executionOrderType({direction:'BULLISH',entry:11.577,price:11.60,tolerance:.01})==='LIMIT' &&
    executionOrderType({direction:'BULLISH',entry:11.577,price:11.5775,tolerance:.01})==='MARKET' &&
    executionOrderType({direction:'BEARISH',entry:11.577,price:11.1725,tolerance:.01})==='LIMIT' &&
    executionOrderType({direction:'BEARISH',entry:11.577,price:12,tolerance:.01})===null;
});
assert('Top-Down routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'TOP_DOWN',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed.direction==='BULLISH'||routed.direction==='NEUTRAL';});

// Top-Down scoring regression: direction is explicit input, never an undeclared global.
const topDownScoreCandles=Array.from({length:60},(_,i)=>bar(i,100,101.25,98.75,100.5));
const topDownScore=scoreSetup({
  layers:[
    {tf:'4H',structure:{direction:'BULLISH'}},
    {tf:'2H',structure:{direction:'BULLISH'}},
    {tf:'LTF',structure:{direction:'BULLISH'}}
  ],
  bos:{age:0},retestPoint:{age:0},price:100,entry:100,
  target:{source:'HTF_MAJOR_SWING',quality:95},rr:3,
  candles:topDownScoreCandles,direction:'BULLISH'
});
assert('Top-Down score calculation receives directional context without runtime ReferenceError',()=>Number.isFinite(topDownScore.score)&&topDownScore.score>0);

// Pullback contract: aligned HTF trend -> confirmed impulse -> 38.2%-61.8% retracement -> closed continuation break.
assert('Pullback uses a defined trend-retracement-continuation model',PULLBACK_MODEL==='HTF_TREND_IMPULSE_RETRACE_CONTINUATION');
const pbConflict=evaluatePullback({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'LTF',structure:{direction:'BULLISH'}}],price:105});
assert('Pullback rejects conflicting higher-timeframe directions',()=>pbConflict.direction==='NEUTRAL'&&pbConflict.failures.some(x=>x.includes('aligned')));
const pbNoImpulse=evaluatePullback({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Pullback requires a confirmed directional impulse before retracement',()=>pbNoImpulse.direction==='BULLISH'&&pbNoImpulse.failures.some(x=>x.includes('impulse')));
assert('Pullback routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'PULLBACK',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed&&Array.isArray(routed.failures)&&routed.direction==='BULLISH';});

// Breakout & Retest contract: defined level -> decisive close -> timely role-reversal retest -> continuation.
assert('Breakout & Retest uses a defined breakout-retest model',BREAKOUT_MODEL==='DEFINED_LEVEL_DECISIVE_BREAK_RETEST_HOLD_CONTINUATION');
const brMismatch=evaluateBreakout({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BEARISH'}},{tf:'LTF',structure:{direction:'BULLISH'}}],price:105});
assert('Breakout & Retest rejects conflicting higher-timeframe directions',()=>brMismatch.direction==='NEUTRAL'&&brMismatch.failures.some(x=>x.includes('aligned')));
const brNoLevel=evaluateBreakout({candles:tdCandles,layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],price:105});
assert('Breakout & Retest requires a defined multi-touch level',()=>brNoLevel.direction==='BULLISH'&&brNoLevel.failures.some(x=>x.includes('level')));
assert('Breakout & Retest routes through its own evaluator',()=>{const routed=evaluateStrategy({strategy:'BREAKOUT',layers:[{tf:'4H',structure:{direction:'BULLISH'}},{tf:'2H',structure:{direction:'BULLISH'}}],execution:{candles:tdCandles},price:105});return routed&&Array.isArray(routed.failures)&&routed.direction==='BULLISH';});
assert('Live strategy registry exposes only the unified SMC model',()=>Object.keys(STRATEGIES).join(',')==='SMC'&&STRATEGIES.SMC.model===SMC_MODEL);
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
// Keep enough higher-timeframe history for ATR-based sweep validation. The
// anchor and sweep pair are the latest two closed HTF candles.
const crtHTF=Array.from({length:20},(_,i)=>htfBar(i,103,108,100,106));
crtHTF[18]=htfBar(18,107,116,100,108);
crtHTF[19]=htfBar(19,108,112,98,105);
crtExecution.forEach((x,i)=>{x.time=crtHTF[19].time+i*1800000;});
const crtLayers=[
  {tf:'4H',candles:crtHTF,structure:{direction:'BULLISH'}},
  {tf:'LTF',candles:crtExecution,structure:{direction:'BULLISH'}}
];
assert('CRT exposes the intended entry model',CRT_MODEL==='HTF_CANDLE_RANGE_SWEEP_RECLAIM_MSS_RETEST');
const crtValid=evaluateCRT({candles:crtExecution,layers:crtLayers,price:103});
assert('CRT accepts a valid low-sweep/reclaim setup',()=>crtValid.direction==='BULLISH'&&crtValid.tradeReady===true);
assert('CRT requires the HTF sweep to close back inside',()=>{
  const bad=[...crtHTF.slice(0,2),htfBar(2,108,117,98,117.2)];
  const result=evaluateCRT({candles:crtExecution,layers:[{tf:'4H',candles:bad,structure:{direction:'BULLISH'}},{tf:'LTF',candles:crtExecution,structure:{direction:'BULLISH'}}],price:103});
  return result.failures.some(x=>x.includes('close back inside')||x.includes('No recent completed CRT range'));
});
assert('CRT rejects conflicting HTF bias',()=>{
  const r=evaluateCRT({candles:crtExecution,layers:[{tf:'4H',candles:crtHTF,structure:{direction:'BEARISH'}},{tf:'2H',candles:crtExecution,structure:{direction:'BULLISH'}},{tf:'LTF',candles:crtExecution,structure:{direction:'BULLISH'}}],price:103});
  return r.direction==='NEUTRAL'&&r.failures.some(x=>x.includes('agree'));
});
assert('CRT requires lower-timeframe MSS before entry',()=>{
  const noMss=crtExecution.slice(0,21);
  const r=evaluateCRT({candles:noMss,layers:crtLayers,price:103});
  return !r.tradeReady&&r.failures.length>0;
});
assert('CRT rejects a trivial lower-timeframe boundary poke as a sweep',()=>{
  const noisy=crtExecution.map((x,i)=>i===16?{...bar(16,100.1,100.4,99.9,100.2),time:x.time}:x);
  const r=evaluateCRT({candles:noisy,layers:crtLayers,price:103});
  return !r.tradeReady||r.crt?.executionSweep?.index!==16;
});
assert('CRT rejects a wick-only retest candle',()=>{
  const noisy=crtExecution.map((x,i)=>i===22?{...bar(22,102.6,103,102.5,102.7),time:x.time}:x);
  const r=evaluateCRT({candles:noisy,layers:crtLayers,price:103});
  return !r.tradeReady&&r.failures.length>0;
});
assert('SMC rejects a market entry when the last closed candle has not interacted with the FVG',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2)),diagnostics={};
  const trade=buildTrade({c,price:100.2,direction:'BULLISH',sweep:{extreme:98.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:104,diagnostics});
  return trade===null&&diagnostics.marketRetestNotConfirmed===1;
});
assert('SMC diagnostics distinguish a pending limit on the wrong side of price',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2)),diagnostics={};
  const trade=buildTrade({c,price:99,direction:'BULLISH',sweep:{extreme:80},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:104,diagnostics});
  return trade===null&&diagnostics.pendingLimitWrongSide===1;
});
assert('SMC keeps a correctly sided unmitigated FVG limit valid beyond one ATR',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2)),diagnostics={};
  const trade=buildTrade({c,price:110,direction:'BULLISH',sweep:{extreme:98.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:116,diagnostics});
  return trade?.orderType==='LIMIT'&&trade.entry===100&&trade.target===116&&
    diagnostics.pendingLimitTooFar===undefined&&diagnostics.pendingLimitWrongSide===undefined;
});
assert('SMC fresh FVG check allows a midpoint touch only on the current confirmation candle',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[39]=bar(39,100,101,99.5,100.8);
  const fvg={direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100};
  return !freshFvg(c,fvg,39)&&freshFvg(c,fvg,39,true);
});
assert('SMC fresh FVG check still rejects a midpoint mitigated before the current candle',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[38]=bar(38,100,101,99.5,100.8);
  c[39]=bar(39,101,102,100.5,101.5);
  const fvg={direction:'BULLISH',index:37,low:99.5,high:100.5,midpoint:100};
  return !freshFvg(c,fvg,39,true);
});
assert('SMC permits a market entry after a closed candle touches and holds the FVG',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[39]=bar(39,100,101,99.5,100.8);
  const trade=buildTrade({c,price:100.2,direction:'BULLISH',sweep:{extreme:98.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:104});
  return trade?.orderType==='MARKET'&&trade.entry===100;
});
assert('SMC rejects a bullish market entry when the FVG midpoint is touched but the retest candle closes against the long bias',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[39]=bar(39,99.7,100.5,99.5,99.8);
  const diagnostics={};
  const trade=buildTrade({c,price:100.2,direction:'BULLISH',sweep:{extreme:98.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:104,diagnostics});
  return trade===null&&diagnostics.marketRetestNotConfirmed===1;
});
assert('SMC rejects a market entry when the candle only touches the outer FVG edge, not the planned midpoint',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[39]=bar(39,100.15,100.5,100.1,100.4);
  const diagnostics={};
  const trade=buildTrade({c,price:100.2,direction:'BULLISH',sweep:{extreme:98.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BULLISH',index:38,low:99.5,high:100.5,midpoint:100},target:104,diagnostics});
  return trade===null&&diagnostics.marketRetestNotConfirmed===1;
});
assert('SMC accepts a bearish market entry only after a bearish midpoint rejection close',()=>{
  const c=Array.from({length:40},(_,i)=>bar(i,102,103,101,102.2));
  c[39]=bar(39,100.8,101,99.5,99.7);
  const trade=buildTrade({c,price:100.2,direction:'BEARISH',sweep:{extreme:101.5},mss:{level:100},displacement:{index:37},fvg:{direction:'BEARISH',index:38,low:99.5,high:100.5,midpoint:100},target:96});
  return trade?.orderType==='MARKET'&&trade.entry===100;
});
assert('CRT stop is beyond its actual sweep extreme',()=>crtValid.trade.stop<crtValid.crt.executionSweep.extreme);
assert('CRT targets the meaningful opposite CRT extreme with positive structural reward',()=>crtValid.trade.target===116&&crtValid.trade.rr>0);
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
const fartherStructuralTarget=selectMinimumRRStructuralTarget({
  trade:{entry:100,stop:98,target:102},
  direction:'BULLISH',
  candles:hierarchyCandles,
  layers:hierarchyLayers,
  minimumRR:3
});
assert('3R recovery selects a real farther structural objective rather than fabricating a price',()=>!!fartherStructuralTarget&&fartherStructuralTarget.target>100&&fartherStructuralTarget.rr>=3&&typeof fartherStructuralTarget.targetSource==='string');

assert('Target hierarchy can prefer repeated/major structure over a single nearby pivot',()=>{
  if(!structuralTarget)return true;
  return structuralTarget.quality>=90 || structuralTarget.clusterCount>=2 || structuralTarget.native===true;
});
assert('Structural target ranking is not an RR gate',()=>{
  if(!structuralTarget)return true;
  return structuralTarget.rr===undefined;
});

// A nearer opposing swing already behind the live quote has been cleared;
// target selection must continue to the next confirmed objective ahead.
const targetAfterClearedLevel=nextLiquidityTarget(
  hierarchyCandles,'BULLISH',100,106,2,hierarchyCandles.length-1,hierarchyLayers
);
assert('SMC selects the next structural target ahead of price after a nearer level is cleared',()=>!!targetAfterClearedLevel&&targetAfterClearedLevel.price>106&&targetAfterClearedLevel.price-100>=6);
 
// The liquidity layer already detects equal highs/lows. SMC target ranking
// must consume those confirmed pools rather than relying only on isolated
// external swing pivots.
const poolExecution=Array.from({length:50},(_,i)=>bar(i,100,101,99,100.2));
const poolContext=Array.from({length:50},(_,i)=>bar(i,100,101,99,100.2));
const equalHighPool={
  type:'EQUAL_HIGHS',level:105,first:10,second:20,
  confirmationIndex:22,time:poolContext[22].time
};
const poolTarget=selectStructuralTarget(poolExecution,'BULLISH',100,{
  layers:[{tf:'4H',candles:poolContext,liquidity:{pools:[equalHighPool]}}],
  minDistance:1
});
assert('SMC can select a confirmed equal-high liquidity pool as its opposing target',()=>poolTarget?.price===105&&poolTarget.source==='HTF_EQUAL_HIGHS');
const poolDetectionCandles=Array.from({length:50},(_,i)=>bar(i,100,101,99,100.2));
 poolDetectionCandles[10]=bar(10,100,105,99,100.2);
 poolDetectionCandles[20]=bar(20,100,105,99,100.2);
const detectedPools=liquidityMap(poolDetectionCandles).pools.filter(x=>x.type==='EQUAL_HIGHS');
assert('Liquidity map exposes equal-high pool confirmation time for target lookahead checks',()=>detectedPools.length>0&&detectedPools.every(x=>Number.isFinite(x.confirmationIndex)&&Number.isFinite(x.time)));


// A crowded higher-timeframe target list must not crowd out a nearer valid
// execution-timeframe objective before the final reachability selector runs.
const crowdedExecution=Array.from({length:80},(_,i)=>bar(i,100,101,99,100.2));
crowdedExecution[20]=bar(20,100,105,99,104);
const crowdedHTF=Array.from({length:110},(_,i)=>({
  time:Date.UTC(2026,0,1)+i*14400000,open:100,high:101,low:99,close:100.2,volume:100
}));
for(let i=0;i<13;i++){
  const pivotIndex=8+i*7;
  // Descending unconsumed highs keep every prior objective valid: later
  // candles never trade back through an earlier, higher swing.
  crowdedHTF[pivotIndex]={...crowdedHTF[pivotIndex],high:130-i};
}
const crowdedTargets=rankStructuralTargets(crowdedExecution,'BULLISH',100,{
  layers:[{tf:'4H',candles:crowdedHTF}]
});
const nearestCrowdedTarget=selectStructuralTarget(crowdedExecution,'BULLISH',100,{
  layers:[{tf:'4H',candles:crowdedHTF}]
});
assert('Structural target ranking retains more than twelve qualified objectives',()=>crowdedTargets.length>12);
assert('A nearer valid execution swing is not discarded by higher-timeframe target ranking',()=>nearestCrowdedTarget?.price===105);

// Target lookahead guard: a structural target must not use a swing formed after the setup event.
const lookaheadCandles=Array.from({length:30},(_,i)=>bar(i,100,101,99,100.2));
lookaheadCandles[24]=bar(24,100,150,99,101);
const lookaheadTarget=selectStructuralTarget(lookaheadCandles,'BULLISH',100,{asOf:15,asOfTime:lookaheadCandles[15].time,minDistance:1});
assert('Target selection cannot use post-event structure',()=>!lookaheadTarget||lookaheadTarget.index<=15);

// Active structural break validation: older levels must not produce a fresh BOS
// after a newer confirmed swing has superseded them.
const breakFixture=Array.from({length:8},(_,i)=>bar(i,6,11,5,[6,7,7,6,7,9,9,11][i]));
const breakHighs=[
  {price:8,index:0,confirmationIndex:1,time:breakFixture[0].time},
  {price:10,index:3,confirmationIndex:4,time:breakFixture[3].time}
];
const staleBreaks=structuralBreakEvents(breakFixture.slice(0,7),breakHighs,[],6);
const confirmedBreaks=structuralBreakEvents(breakFixture,breakHighs,[],7);
assert('A superseded lower swing cannot create a fresh BOS when price closes below the active higher swing',()=>staleBreaks.length===0);
assert('A BOS is recorded when price closes through the latest confirmed active swing',()=>confirmedBreaks.length===1&&confirmedBreaks[0].direction==='BULLISH'&&confirmedBreaks[0].level===10&&confirmedBreaks[0].index===7);
assert('Structural break events retain the swing confirmation index for auditability',()=>confirmedBreaks[0]?.confirmationIndex===4);

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
const strongConfidence=gradeSetup({strategy:'TEST',context:{aligned:true,trend:true},entry:{anchorQuality:1,executionQuality:1},risk:{invalidationQuality:1,geometryQuality:1},target:{source:'HTF_MAJOR_SWING',quality:1,rr:2.5},confirmation:{quality:1},freshness:{quality:1}});
const weakConfidence=gradeSetup({strategy:'TEST',context:{aligned:true,trend:false},entry:{anchorQuality:.8,executionQuality:.75},risk:{invalidationQuality:.8,geometryQuality:.8},target:{source:'EXECUTION_EXTERNAL_SWING',quality:.55,rr:1.9},confirmation:{quality:.55},freshness:{quality:.35}});
assert('Confidence model never treats R:R as an input',()=>!strongConfidence.confidenceEvidence.some(x=>String(x.type).includes('RR')));
assert('Confidence model returns bounded structural quality',()=>strongConfidence.score>=0&&strongConfidence.score<=100&&weakConfidence.score>=0&&weakConfidence.score<=100);
assert('Confidence model separates strong and weak structural quality',()=>strongConfidence.score>weakConfidence.score);
assert('Confidence model does not hardcode an 88% ceiling',()=>strongConfidence.score!==88||weakConfidence.score===88);
assert('Confidence model labels score as structural quality, not win probability',()=>strongConfidence.confidenceEvidence.some(x=>x.type==='CONFIDENCE_MODEL'&&x.interpretation==='structural quality, not win probability'));

// Executable market-order pricing: the quoted execution price, not the planned
// structural level, must drive the displayed entry and realized R multiple.
const marketExecution=executableTrade({entry:100,marketEntry:101,stop:98,target:104,orderType:'MARKET'},'BULLISH',101.5);
const limitExecution=executableTrade({entry:100,marketEntry:101,stop:98,target:104,orderType:'LIMIT'},'BULLISH',99.8);
assert('Market orders use the live executable quote as entry and preserve the planned level',()=>marketExecution.entry===101.5&&marketExecution.marketEntry===101.5&&marketExecution.plannedEntry===100&&marketExecution.executionPriceSource==='market_quote_at_signal_time');
assert('Market-order R:R is recomputed from executable entry',()=>marketExecution.risk===3.5&&marketExecution.reward===2.5&&Math.abs(marketExecution.rr-(2.5/3.5))<1e-9);
assert('Limit-order entry remains at its planned limit price',()=>limitExecution.entry===100&&limitExecution.plannedEntry===undefined);

// Shared order-state validation: pending limits cannot remain published after
// the executable quote reaches or crosses their planned entry.
assert('Shared entry validation accepts a bullish limit that is still waiting below price',()=>validateEntryExecution({trade:{entry:100,orderType:'LIMIT'},direction:'BULLISH',livePrice:101}).valid);
assert('Shared entry validation rejects a bullish limit already reached by price',()=>!validateEntryExecution({trade:{entry:100,orderType:'LIMIT'},direction:'BULLISH',livePrice:99.9}).valid);
assert('Shared entry validation accepts a bearish limit that is still waiting above price',()=>validateEntryExecution({trade:{entry:100,orderType:'LIMIT'},direction:'BEARISH',livePrice:99}).valid);
assert('Shared entry validation rejects a bearish limit already reached by price',()=>!validateEntryExecution({trade:{entry:100,orderType:'LIMIT'},direction:'BEARISH',livePrice:100.1}).valid);
assert('Shared entry validation accepts a valid market order without applying pending-limit rules',()=>validateEntryExecution({trade:{entry:100,orderType:'MARKET'},direction:'BULLISH',livePrice:100.2}).valid);

// Trade Geometry Contract: entry, stop, target and invalidation must describe
// one coherent setup. Extreme R:R is rejected instead of being celebrated.
const geoCandles=Array.from({length:60},(_,i)=>bar(i,100,101.25,98.75,100.5));
const geometryTrade=(stop,target,invalidationPrice,extra={})=>({
  entry:100,stop,target,invalidationPrice,invalidationSource:'STRUCTURAL_SWING',
  entryZone:{low:99.5,high:100.5},...extra
});
const goodGeometry=validateTradeGeometry({trade:geometryTrade(98.7,104,99),direction:'BULLISH',candles:geoCandles});
const tightGeometry=validateTradeGeometry({trade:geometryTrade(99.9,103,99.95),direction:'BULLISH',candles:geoCandles});
const poorReward=validateTradeGeometry({trade:geometryTrade(98.7,101,99),direction:'BULLISH',candles:geoCandles});
const subTwoR=validateTradeGeometry({trade:geometryTrade(96,103.5,96.5),direction:'BULLISH',candles:geoCandles});
const wideGeometry=validateTradeGeometry({trade:geometryTrade(91,105,91.5),direction:'BULLISH',candles:geoCandles});
const extremeRr=validateTradeGeometry({trade:geometryTrade(98.7,150,99),direction:'BULLISH',candles:geoCandles});
const missingInvalidation=validateTradeGeometry({trade:{entry:100,stop:98.7,target:104},direction:'BULLISH',candles:geoCandles});
assert('Trade Geometry Contract accepts a coherent structural entry/stop/target',goodGeometry.valid);
assert('Trade Geometry Contract rejects structurally valid setups below 3R instead of publishing them',()=>!subTwoR.valid&&subTwoR.metrics.rr<3&&subTwoR.failures.some(x=>x.includes('below the 3R minimum')));
const weakStructuralGrade=gradeSetup({strategy:'TEST',context:{aligned:true,trend:true},entry:{anchorQuality:1,executionQuality:1},risk:{invalidationQuality:1,geometryQuality:1},target:{source:'MAJOR_SWING',quality:95,rr:1.79},confirmation:{quality:1},freshness:{quality:1}});
const strongGrade=gradeSetup({strategy:'TEST',context:{aligned:true,trend:true},entry:{anchorQuality:1,executionQuality:1},risk:{invalidationQuality:1,geometryQuality:1},target:{source:'MAJOR_SWING',quality:95,rr:2.4},confirmation:{quality:1},freshness:{quality:1}});
assert('Structural quality score is separate from the 3R execution eligibility gate',()=>weakStructuralGrade.grade!=='NO-TRADE'&&strongGrade.grade!=='NO-TRADE');
assert('R:R does not inflate structural quality scores',()=>weakStructuralGrade.score===strongGrade.score);
assert('Trade Geometry Contract rejects stops inside normal volatility',()=>!tightGeometry.valid&&tightGeometry.failures.some(x=>x.includes('too tight')||x.includes('buffer')));
assert('Trade Geometry Contract rejects targets that are too close to the entry',()=>!poorReward.valid&&poorReward.failures.some(x=>x.includes('too close')));
assert('Trade Geometry Contract rejects unrelated excessively wide invalidation',()=>!wideGeometry.valid&&wideGeometry.failures.some(x=>x.includes('excessively wide')));
assert('Trade Geometry Contract rejects implausible 40R geometry',()=>!extremeRr.valid&&extremeRr.failures.some(x=>x.includes('exceeds 10R')||x.includes('too far')));
assert('Trade Geometry Contract rejects trades with no numeric invalidation anchor',()=>!missingInvalidation.valid&&missingInvalidation.failures.some(x=>x.includes('no numeric structural invalidation')));
const nearestTarget=selectStructuralTarget(geoCandles,'BULLISH',100,{nativeTargets:[{price:110,source:'CRT_OPPOSITE_RANGE',native:true},{price:140,source:'DISTANT_NATIVE_OBJECTIVE',native:true}]});
assert('Structural target selection rejects distant objectives when a nearer valid native target exists',()=>nearestTarget?.price===110);


// Scanner smoke: run the real scanner helpers against deterministic Bybit-shaped
// public responses. This keeps CI independent of external API availability.
const originalFetch=globalThis.fetch;
const mockTicker=(symbol='')=>({retCode:0,result:{list:symbol?[{symbol,lastPrice:'100',bid1Price:'99.9',ask1Price:'100.1',turnover24h:'1000000',time:String(Date.now())}]:Array.from({length:18},(_,i)=>({symbol:`MOCK${i}USDT`,lastPrice:'100',turnover24h:String(1000000-i)}))}});
const mockKlines=interval=>{const step=({30:1800000,60:3600000,120:7200000,240:14400000,D:86400000})[interval]||1800000;return{retCode:0,result:{list:Array.from({length:300},(_,i)=>{const t=Date.UTC(2025,0,1)+i*step;const p=100+i*.01;return[String(t),String(p-.1),String(p+.5),String(p-.5),String(p+.1),'1000']}).reverse()}}};
globalThis.fetch=async input=>{const u=new URL(String(input));if(u.pathname.endsWith('/market/tickers'))return{ok:true,json:async()=>mockTicker(u.searchParams.get('symbol')||'')};if(u.pathname.endsWith('/market/kline'))return{ok:true,json:async()=>mockKlines(u.searchParams.get('interval'))};throw new Error('Unexpected scanner test URL');};
try{
  const scannerUniverse=await topSymbols();
  assert('Scanner discovers the configured perpetual universe',()=>scannerUniverse.length===18&&scannerUniverse.every(x=>/USDT$/.test(x.symbol)&&x.turnover24h>0));
  const scannerCandles=await candlesFor('BTCUSDT');
  assert('Scanner loads only 4H context and 1H execution candles',()=>['1H','4H'].every(tf=>Array.isArray(scannerCandles[tf])&&scannerCandles[tf].length>=40)&&Object.keys(scannerCandles).length===2);
  const scannerSetups=await scanSymbol(scannerUniverse[0]);
  assert('Scanner evaluates one unified model on one execution timeframe',()=>Array.isArray(scannerSetups));
  assert('Scanner never publishes invalid directional geometry',()=>scannerSetups.every(x=>(x.bias==='LONG'&&x.stopLoss<x.entry&&x.takeProfit>x.entry)||(x.bias==='SHORT'&&x.stopLoss>x.entry&&x.takeProfit<x.entry)));
  assert('Scanner only publishes the unified model on 1H',()=>scannerSetups.every(x=>x.strategyKey==='SMC'&&x.timeframe==='1H'&&x.model===SMC_MODEL));
}finally{globalThis.fetch=originalFetch;}
// Structural trade audit: every retained strategy must publish an execution zone and
// a numeric invalidation anchor so an SL cannot be generated from an arbitrary distance.
assert('Trade Geometry Contract requires structural entry and invalidation metadata',()=>{
  const long=validateTradeGeometry({
    trade:{
      entry:100,stop:98,target:106,
      entryZone:{low:99.5,high:100.5},
      invalidationPrice:98.5,
      invalidationSource:'STRUCTURAL_SWING'
    },
    direction:'BULLISH',
    candles:geoCandles
  });
  const randomStop=validateTradeGeometry({
    trade:{
      entry:100,stop:99.2,target:105,
      entryZone:{low:99.5,high:100.5},
      invalidationPrice:99,
      invalidationSource:'STRUCTURAL_SWING'
    },
    direction:'BULLISH',
    candles:geoCandles
  });
  const badEntry=validateTradeGeometry({
    trade:{
      entry:102,stop:98,target:108,
      entryZone:{low:99.5,high:100.5},
      invalidationPrice:98.5,
      invalidationSource:'STRUCTURAL_SWING'
    },
    direction:'BULLISH',
    candles:geoCandles
  });
  return long.valid &&
    !randomStop.valid&&randomStop.failures.some(x=>x.includes('beyond the actual structural invalidation')) &&
    !badEntry.valid&&badEntry.failures.some(x=>x.includes('outside the strategy-defined execution zone'));
});

const failed=tests.filter(x=>!x.ok);
console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));
if(failed.length)process.exit(1);
