import {evaluateMSNR} from './msnr.js';
import {evaluateSMC} from './smc.js';
import {evaluateTopDown} from './topDown.js';
import {evaluatePullback} from './pullback.js';
import {evaluateBreakout} from './breakout.js';
import {evaluateCRT} from './crt.js';

// Only SMC is registered for live scanning and publication. The other evaluators
// remain directly addressable solely for legacy regression tests and research.
export const STRATEGIES={
  SMC:{name:'Unified Liquidity & Displacement',status:'READY',model:'LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
  if(strategy==='SMC')return evaluateSMC({candles:execution.candles,layers,price});
  // Compatibility path for old unit fixtures; these are not live strategies.
  if(strategy==='TOP_DOWN')return evaluateTopDown({candles:execution.candles,layers,price});
  if(strategy==='PULLBACK')return evaluatePullback({candles:execution.candles,layers,price});
  if(strategy==='BREAKOUT')return evaluateBreakout({candles:execution.candles,layers,price});
  if(strategy==='CRT')return evaluateCRT({candles:execution.candles,layers,price});
  if(strategy==='MSNR')return evaluateMSNR({candles:execution.candles,layers,price});
  throw new Error('Only the unified liquidity and displacement model is registered for live use.');
}
