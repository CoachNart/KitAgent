import {evaluateMSNR} from './msnr.js';
import {evaluateSMC} from './smc.js';
import {evaluateTopDown} from './topDown.js';
import {evaluatePullback} from './pullback.js';
import {evaluateBreakout} from './breakout.js';
import {evaluateCRT} from './crt.js';

export const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',status:'READY'},
  PULLBACK:{name:'Pullback',status:'READY'},
  BREAKOUT:{name:'Breakout & Retest',status:'READY'},
  SMC:{name:'SMC',status:'READY'},
  MSNR:{name:'MSNR',status:'READY'},
  CRT:{name:'CRT',status:'READY'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
  if(strategy==='TOP_DOWN')return evaluateTopDown({candles:execution.candles,layers,price});
  if(strategy==='SMC')return evaluateSMC({candles:execution.candles,layers,price});
  if(strategy==='PULLBACK')return evaluatePullback({candles:execution.candles,layers,price});
  if(strategy==='BREAKOUT')return evaluateBreakout({candles:execution.candles,layers,price});
  if(strategy==='CRT')return evaluateCRT({candles:execution.candles,layers,price});
  return evaluateMSNR({candles:execution.candles,layers,price});
}

