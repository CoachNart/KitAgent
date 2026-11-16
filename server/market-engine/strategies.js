import {evaluateSMC} from './smc.js';

export const STRATEGIES={
  SMC:{name:'Unified Liquidity & Displacement',status:'READY',model:'LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
  if(strategy!=='SMC')throw new Error('Only the unified liquidity and displacement model is enabled.');
  return evaluateSMC({candles:execution.candles,layers,price});
}
