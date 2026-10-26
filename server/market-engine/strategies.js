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

/**
 * Prefer established HH/HL or LH/LL structure over a direction inferred from
 * one recent break while the swing sequence is still neutral/transitional.
 * A structure invalidated by its own protected swing remains neutral.
 */
function confirmedLayerDirection(structure){
  if(!structure)return 'NEUTRAL';
  if(Object.prototype.hasOwnProperty.call(structure,'rawDirection')){
    if(!DIRECTIONS.has(structure.rawDirection)||structure.direction==='NEUTRAL')return 'NEUTRAL';
    return structure.rawDirection;
  }
  return DIRECTIONS.has(structure.direction)?structure.direction:'NEUTRAL';
}

/**
 * Final market-structure veto shared by every strategy.
 *
 * A strategy may identify a pattern, but it cannot override the currently
 * confirmed directional structure on any layer. Neutral layers are not votes;
 * conflicting directional layers, or a trade against any directional layer,
 * invalidate the candidate. If every layer is neutral, there is no defensible
 * structure bias and no trade is published.
 */
export function applyMarketStructureGuard(result,layers=[]){
  if(!result||!result.trade||!DIRECTIONS.has(result.direction))return result;
  const directional=(Array.isArray(layers)?layers:[])
    .map(layer=>({tf:String(layer?.tf||'UNKNOWN'),direction:confirmedLayerDirection(layer?.structure)}))
    .filter(x=>DIRECTIONS.has(x.direction));

  if(!directional.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: no timeframe has a confirmed directional swing sequence; setup blocked.'],
      marketStructureGuard:{allowed:false,reason:'NO_DIRECTIONAL_STRUCTURE',directionalLayers:[]}
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
      marketStructureGuard:{allowed:false,reason:'TIMEFRAME_STRUCTURE_CONFLICT',directionalLayers:directional}
    };
  }

  const against=directional.filter(x=>x.direction!==result.direction);
  if(against.length){
    return {
      ...result,
      direction:'NEUTRAL',
      trade:null,
      failures:[...(result.failures||[]),'Market-structure guard: '+result.direction+' setup conflicts with confirmed '+bias+' structure ('+against.map(x=>x.tf).join(', ')+'); counter-structure setup blocked.'],
      marketStructureGuard:{allowed:false,reason:'TRADE_AGAINST_STRUCTURE',bias,proposedDirection:result.direction,directionalLayers:directional}
    };
  }

  return {
    ...result,
    marketStructureGuard:{allowed:true,bias,directionalLayers:directional}
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
