import {displacement,structure} from './structure.js';
import {latestSweep} from './liquidity.js';
import {fvg,orderBlocks,nearestTarget} from './levels.js';
import {executionConfirmation,tradeGeometry} from './execution.js';

function thesisBase(m){return m.direction==='BULLISH'||m.direction==='BEARISH';}

function directionFor(ctx,exec,strategy){
 const h=ctx.at(-1)?.structure?.direction||'NEUTRAL',e=exec.structure.direction;
 if(strategy==='LIQUIDITY_REVERSAL'||strategy==='SMC'||strategy==='CRT')return e!=='NEUTRAL'?e:h;
 return h!=='NEUTRAL'?h:e;
}

export const STRATEGIES={
 TOP_DOWN:{name:'Top-Down'},
 PULLBACK:{name:'CRT Pullback'},
 BREAKOUT:{name:'Breakout & Retest'},
 SMC:{name:'SMC'},
 MSNR:{name:'MSNR'},
 PRICE_ACTION:{name:'Price Action'},
 LIQUIDITY_REVERSAL:{name:'Liquidity Reversal'},
 CRT:{name:'CRT'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
 const s=execution.structure, direction=directionFor(layers,execution,strategy), failures=[], evidence=[];
 if(!thesisBase({direction}))return {direction:'NEUTRAL',failures:['Market structure is unclear.'],evidence};
 const ctx=layers.map(x=>x.structure.direction).filter(x=>x!=='NEUTRAL'), aligned=ctx.filter(x=>x===direction).length;
 if(!['SMC','LIQUIDITY_REVERSAL','CRT'].includes(strategy)&&ctx.some(x=>x!==direction))failures.push('Higher-timeframe structure conflicts with the proposed continuation.');
 const sweep=latestSweep(execution.liquidity,direction,6),disp=displacement(execution.candles,direction),conf=executionConfirmation(execution.candles,direction);
 if(strategy==='TOP_DOWN'){
  if(aligned<Math.min(2,layers.length))failures.push('Top-down hierarchy is not coherent.');
  if(!s.mss&&!s.bos)failures.push('No confirmed execution structure event.');
  evidence.push('Macro direction → intermediate structure → execution confirmation.');
 }else if(strategy==='PULLBACK'){
  if(!disp)failures.push('No meaningful directional impulse/displacement.');
  if(s.direction!==direction)failures.push('Execution structure does not support continuation.');
  if(!execution.pullback)failures.push('No qualified structural pullback location.');
  if(!conf?.confirmed)failures.push('Pullback has not produced execution displacement and continuation confirmation.');
  evidence.push('Impulse → structural retracement → continuation.');
 }else if(strategy==='BREAKOUT'){
  if(!execution.breakout)failures.push('No established level with a decisive breakout.');
  if(!execution.retest)failures.push('Breakout has not produced a confirmed retest.');
  if(!conf?.confirmed)failures.push('Retest lacks continuation displacement.');
  evidence.push('Established level → decisive break → accepted retest.');
 }else if(strategy==='SMC'){
  if(!sweep)failures.push('No meaningful opposing liquidity sweep.');
  if(!disp)failures.push('No displacement after liquidity event.');
  if(!(s.mss||s.choch||s.bos))failures.push('No structural shift after the liquidity event.');
  const poi=[...fvg(execution.candles,direction),...orderBlocks(execution.candles,direction)];
  if(!poi.length)failures.push('No objectively identifiable fresh POI.');
  else { const related=sweep?poi.some(z=>z.index>=sweep.index):true; if(!related)failures.push('POI is not causally related to the recent liquidity event.'); else evidence.push('Fresh POI: '+(poi[0].low??poi[0].mid)); }
  evidence.push('Liquidity → MSS/CHoCH/BOS → displacement → POI.');
 }else if(strategy==='MSNR'){
  if(!execution.msnrLevel)failures.push('No fresh structurally significant support/resistance level.');
  else if(execution.msnrLevel.consumed)failures.push('Decision level is too heavily consumed.');
  if(!execution.msnrReaction)failures.push('No confirmed reaction at the decision level.');
  evidence.push('Structural level → reaction → continuation/reversal.');
 }else if(strategy==='PRICE_ACTION'){
  if(!execution.priceActionLevel)failures.push('No meaningful structural level.');
  if(!execution.priceActionReaction)failures.push('No qualifying price-action rejection.');
  evidence.push('Meaningful structure → arrival → rejection/engulfing.');
 }else if(strategy==='LIQUIDITY_REVERSAL'){
  if(!sweep)failures.push('No meaningful liquidity sweep.');
  if(!sweep||sweep.age>6)failures.push('Liquidity event is not recent enough.');
  if(!s.mss&&!s.choch)failures.push('No structural shift after the sweep.');
  if(!disp)failures.push('No displacement confirming reversal.');
  evidence.push('Liquidity taken → failure → MSS/CHoCH → displacement.');
 }else if(strategy==='CRT'){
  if(!execution.crt?.sweep)failures.push('No valid CRT range sweep.');
  if(!execution.crt?.reclaim)failures.push('Sweep did not reclaim the reference range.');
  if(!s.mss&&!s.choch)failures.push('No structural confirmation after CRT reclaim.');
  evidence.push('Reference range → one-sided sweep → reclaim → opposite side.');
 }
 if(failures.length)return {direction,failures:[...new Set(failures)],evidence};

 const smcPoi=[...fvg(execution.candles,direction),...orderBlocks(execution.candles,direction)].filter(z=>Number.isFinite(z.low)&&Number.isFinite(z.high));
 const smcEntry=smcPoi.length?direction==='BULLISH'?Math.max(...smcPoi.map(z=>z.high)):Math.min(...smcPoi.map(z=>z.low)):null;
 const level=execution.msnrLevel?.level??execution.priceActionLevel?.level??execution.pullback?.level??execution.crt?.entryZone??execution.retest?.level??execution.breakout?.level??smcEntry??null;
 const currentEntry=execution.entry??price;
 const candidateLimit=Number.isFinite(level)&&((direction==='BULLISH'&&level<price)||(direction==='BEARISH'&&level>price)) ? level : null;
 const orderType=candidateLimit!=null&&Math.abs(candidateLimit-price)>Math.max(price*.0008,(execution.structure.atr||price*.001)*.15)?'LIMIT':'MARKET';
 const entry=orderType==='LIMIT'?candidateLimit:currentEntry;
 const target=execution.crt?.target||execution.breakout?.target||nearestTarget(execution.candles,direction,entry)?.level;

 // Stop hierarchy:
 // 1) strategy-defined invalidation when it is an actual market event/zone;
 // 2) otherwise the execution structure's protected swing.
 // There is deliberately no "nearest swing" fallback.
 const structuralInvalidation=direction==='BULLISH'
   ? (execution.crt?.invalidation??execution.retest?.invalidation??execution.structure.protectedLow?.price??null)
   : (execution.crt?.invalidation??execution.retest?.invalidation??execution.structure.protectedHigh?.price??null);

 const trade=tradeGeometry(execution.candles,direction,entry,target,structuralInvalidation);
 if(!trade)return {direction,failures:['No logical structural invalidation/target pair provides at least 2R.'],evidence};
 trade.orderType=orderType;
 trade.marketEntry=price;
 trade.entryReason=orderType==='LIMIT'?'Planned structural retracement/retest entry':'Confirmed execution at the current market price';
 trade.invalidationSource=execution.crt?.invalidation!=null?'CRT sweep invalidation':execution.retest?.invalidation!=null?'Breakout retest invalidation':direction==='BULLISH'?'Protected bullish swing low':'Protected bearish swing high';
 return {direction,trade,failures:[],evidence};
}
