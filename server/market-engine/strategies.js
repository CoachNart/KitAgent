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

const DIRECTIONS=new Set(['BULLISH','BEARISH']);

function structureState(layer){
  const s=layer?.structure;
  if(!s)return {tf:String(layer?.tf||'UNKNOWN'),direction:'NEUTRAL',transition:null};
  // The structure engine can infer a temporary direction from a recent break
  // while its HH/HL or LH/LL sequence is still neutral. That is not established
  // trend bias, but it is important contrary evidence and must not be ignored.
  if(Object.prototype.hasOwnProperty.call(s,'rawDirection')){
    if(DIRECTIONS.has(s.rawDirection)&&s.direction!=='NEUTRAL'){
      return {tf:String(layer?.tf||'UNKNOWN'),direction:s.rawDirection,transition:null};
    }
    return {
      tf:String(layer?.tf||'UNKNOWN'),
      direction:'NEUTRAL',
      transition:s.rawDirection==='NEUTRAL'&&DIRECTIONS.has(s.direction)?s.direction:null
    };
  }
  return {
    tf:String(layer?.tf||'UNKNOWN'),
    direction:DIRECTIONS.has(s.direction)?s.direction:'NEUTRAL',
    transition:null
  };
}

/**
 * Final market-structure veto shared by every strategy.
 * Confirmed structure must agree across directional layers and with the
 * candidate. A temporary break direction is not promoted to trend bias, but
 * an opposing transition blocks entries until structure resolves.
 */
export function applyMarketStructureGuard(result,layers=[]){
  if(!result||!result.trade||!DIRECTIONS.has(result.direction))return result;
  const states=(Array.isArray(layers)?layers:[]).map(structureState);
  const directional=states.filter(x=>DIRECTIONS.has(x.direction));
  const transitions=states.filter(x=>DIRECTIONS.has(x.transition));

  if(!directional.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: no timeframe has a confirmed directional swing sequence; setup blocked.'],
      marketStructureGuard:{allowed:false,reason:'NO_DIRECTIONAL_STRUCTURE',directionalLayers:[],transitionLayers:transitions}
    };
  }

  const bias=directional[0].direction;
  const conflicts=directional.filter(x=>x.direction!==bias);
  if(conflicts.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: timeframe structure conflicts ('+directional.map(x=>x.tf+': '+x.direction).join(', ')+'); setup blocked.'],
      marketStructureGuard:{allowed:false,reason:'TIMEFRAME_STRUCTURE_CONFLICT',directionalLayers:directional,transitionLayers:transitions}
    };
  }

  const against=directional.filter(x=>x.direction!==result.direction);
  if(against.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: '+result.direction+' setup conflicts with confirmed '+bias+' structure ('+against.map(x=>x.tf).join(', ')+'); counter-structure setup blocked.'],
      marketStructureGuard:{allowed:false,reason:'TRADE_AGAINST_STRUCTURE',bias,proposedDirection:result.direction,directionalLayers:directional,transitionLayers:transitions}
    };
  }

  const opposingTransition=transitions.filter(x=>x.transition!==result.direction);
  if(opposingTransition.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: a recent break points against the setup while swing structure is transitional ('+opposingTransition.map(x=>x.tf+': '+x.transition).join(', ')+'); wait for structure to resolve.'],
      marketStructureGuard:{allowed:false,reason:'TRANSITIONAL_STRUCTURE_CONFLICT',bias,proposedDirection:result.direction,directionalLayers:directional,transitionLayers:transitions}
    };
  }

  return {
    ...result,
    marketStructureGuard:{allowed:true,bias,directionalLayers:directional,transitionLayers:transitions}
  };
}

export function evaluateStrategy({strategy,layers,execution,price}){
  let result;
  if(strategy==='TOP_DOWN')result=evaluateTopDown({candles:execution.candles,layers,price});
  else if(strategy==='SMC')result=evaluateSMC({candles:execution.candles,layers,price});
  else if(strategy==='PULLBACK')result=evaluatePullback({candles:execution.candles,layers,price});
  else if(strategy==='BREAKOUT')result=evaluateBreakout({candles:execution.candles,layers,price});
  else if(strategy==='CRT')result=evaluateCRT({candles:execution.candles,layers,price});
  else result=evaluateMSNR({candles:execution.candles,layers,price});

  return applyMarketStructureGuard(result,layers);
}
