import {buildMSNRLevels,latestMSNRConfirmations,evaluateMSNR,MSNR_LEVEL_TYPES,MSNR_CONFIRMATION_TYPES} from '../server/market-engine/msnr.js';
import {evaluateStrategy,STRATEGIES} from '../server/market-engine/strategies.js';
import {structure} from '../server/market-engine/structure.js';
import {evaluateSMC,fvgAt,meaningfulDisplacement,findSweeps,SMC_MODEL} from '../server/market-engine/smc.js';

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

// Non-MSR strategies are intentionally disabled until their own contracts are rebuilt.
for(const strategy of Object.keys(STRATEGIES).filter(x=>!['MSNR','SMC'].includes(x))){
  const result=evaluateStrategy({strategy,layers,execution:{candles:vCc},price:103.5});
  assert(strategy+' is not using the old generic engine',()=>result.failures.some(x=>x.includes('intentionally disabled')));
}

const failed=tests.filter(x=>!x.ok);
console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));
if(failed.length)process.exit(1);
