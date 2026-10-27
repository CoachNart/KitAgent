import {evaluateMSNR} from './msnr.js';
import {evaluateSMC} from './smc.js';
import {evaluateTopDown} from './topDown.js';
import {evaluatePullback} from './pullback.js';
import {evaluateBreakout} from './breakout.js';
import {evaluateCRT} from './crt.js';

export const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',status:'PAUSED',reason:'Historical Bybit replay has shown repeated negative expectancy across validation windows; blocked until entry logic is rebuilt and revalidated.'},
  PULLBACK:{name:'Pullback',status:'READY'},
  BREAKOUT:{name:'Breakout & Retest',status:'READY'},
  SMC:{name:'SMC',status:'READY'},
  MSNR:{name:'MSNR',status:'READY'},
  CRT:{name:'CRT',status:'READY'}
};

const DIRECTIONS=new Set(['BULLISH','BEARISH']);

function structureState(layer){
  const s=layer?.structure;
  const tf=String(layer?.tf||'UNKNOWN');
  if(!s)return {tf,direction:'NEUTRAL',transition:null};
  const direction=DIRECTIONS.has(s.direction)?s.direction:'NEUTRAL';
  const rawDirection=DIRECTIONS.has(s.rawDirection)?s.rawDirection:'NEUTRAL';

  // A confirmed HH/HL or LH/LL sequence is the established bias. If the
  // structure engine has a directional state derived from a recent break while
  // raw swing sequencing is neutral, keep that break as transitional evidence.
  if(Object.prototype.hasOwnProperty.call(s,'rawDirection')){
    if(rawDirection!=='NEUTRAL'&&direction!=='NEUTRAL'){
      return {tf,direction:rawDirection,transition:null};
    }
    if(rawDirection==='NEUTRAL'&&direction!=='NEUTRAL'){
      return {tf,direction:'NEUTRAL',transition:direction};
    }
    if(rawDirection!=='NEUTRAL'&&direction==='NEUTRAL'){
      // Neutralized raw trend usually means its protected swing was invalidated.
      // Prefer the actual recent break direction; otherwise treat invalidation
      // as contrary evidence instead of silently ignoring the broken trend.
      const recentBreak=s?.structureBreak;
      const transition=DIRECTIONS.has(recentBreak?.direction)&&Number(recentBreak?.age)<=8
        ?recentBreak.direction
        :(rawDirection==='BULLISH'?'BEARISH':'BULLISH');
      return {tf,direction:'NEUTRAL',transition};
    }
    return {tf,direction:'NEUTRAL',transition:null};
  }
  return {tf,direction,transition:null};
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

export function evaluateStrategy({strategy,layers,execution,price,allowPausedResearch=false}){
  const config=STRATEGIES[strategy];
  const researchOverride=allowPausedResearch===true&&config?.status==='PAUSED';
  if(!config||(config.status!=='READY'&&!researchOverride)){
    const reason=config?.reason||`Strategy ${String(strategy||'UNKNOWN')} is not enabled for trade publication.`;
    return {
      direction:'NEUTRAL',
      trade:null,
      grade:{grade:'NO-TRADE',score:0,hardFailures:[reason]},
      failures:[reason],
      evidence:[],
      strategyStatus:config?.status||'UNAVAILABLE'
    };
  }
  let result;
  if(strategy==='TOP_DOWN')result=evaluateTopDown({candles:execution.candles,layers,price});
  else if(strategy==='SMC')result=evaluateSMC({candles:execution.candles,layers,price});
  else if(strategy==='PULLBACK')result=evaluatePullback({candles:execution.candles,layers,price});
  else if(strategy==='BREAKOUT')result=evaluateBreakout({candles:execution.candles,layers,price});
  else if(strategy==='CRT')result=evaluateCRT({candles:execution.candles,layers,price});
  else result=evaluateMSNR({candles:execution.candles,layers,price});

  const guarded=applyMarketStructureGuard(result,layers);
  return researchOverride?{...guarded,researchOnly:true,strategyStatus:'PAUSED_RESEARCH_ONLY'}:guarded;
}
