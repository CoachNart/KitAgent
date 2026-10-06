import {evaluateMSNR} from './msnr.js';
import {evaluateSMC} from './smc.js';

export const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',status:'NOT_BUILT'},
  PULLBACK:{name:'CRT Pullback',status:'NOT_BUILT'},
  BREAKOUT:{name:'Breakout & Retest',status:'NOT_BUILT'},
  SMC:{name:'SMC',status:'READY'},
  MSNR:{name:'MSNR',status:'READY'},
  PRICE_ACTION:{name:'Price Action',status:'NOT_BUILT'},
  LIQUIDITY_REVERSAL:{name:'Liquidity Reversal',status:'NOT_BUILT'},
  CRT:{name:'CRT',status:'NOT_BUILT'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
  if(strategy==='SMC')return evaluateSMC({candles:execution.candles,layers,price});
  if(strategy!=='MSNR'){
    return {
      direction:'NEUTRAL',
      failures:[`${STRATEGIES[strategy]?.name||strategy} is intentionally disabled while the strategy engine is being rebuilt strategy-by-strategy.`],
      evidence:[]
    };
  }
  return evaluateMSNR({candles:execution.candles,layers,price});
}

export function resolveEntry(){
  throw new Error('resolveEntry is removed. Each strategy now owns its own entry model.');
}
