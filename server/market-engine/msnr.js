import {gradeSetup} from './grading.js';
import {atr} from './data.js';
import {confirmedSwings} from './structure.js';
const RESISTANCE_TYPES=new Set(['A','BEARISH_GAP','SBR']);
const SUPPORT_TYPES=new Set(['V','BULLISH_GAP','RBS']);

function color(c){
  if(!c)return null;
  if(c.close>c.open)return 'GREEN';
  if(c.close<c.open)return 'RED';
  return null;
}

function baseType(first,second){
  const a=color(first),b=color(second);
  if(!a||!b)return null;
  if(a==='GREEN'&&b==='RED')return 'A';
  if(a==='RED'&&b==='GREEN')return 'V';
  if(a==='GREEN'&&b==='GREEN')return 'BULLISH_GAP';
  if(a==='RED'&&b==='RED')return 'BEARISH_GAP';
  return null;
}

function sideFor(type){
  return RESISTANCE_TYPES.has(type)?'RESISTANCE':'SUPPORT';
}

function flippedType(type){
  return sideFor(type)==='RESISTANCE'?'RBS':'SBR';
}

function continuation(candle,middle,direction,level){
  if(direction==='BULLISH'){
    return candle.low<=level&&candle.open>level&&candle.close>level&&candle.close>=middle.close;
  }
  return candle.high>=level&&candle.open<level&&candle.close<level&&candle.close<=middle.close;
}

function touch(candle,direction,level){
  return direction==='BULLISH'?candle.low<=level:candle.high>=level;
}

function bodyBeyond(candle,direction,level){
  return direction==='BULLISH'?candle.open>level&&candle.close>level:candle.open<level&&candle.close<level;
}

function zoneBounds(first,second,type){
  if(type==='BULLISH_GAP'||type==='BEARISH_GAP'){
    return {
      zoneLow:Math.min(first.close,second.open),
      zoneHigh:Math.max(first.close,second.open)
    };
  }
  return {zoneLow:first.close,zoneHigh:first.close};
}

function candleTouchesZone(candle,direction,level){
  return direction==='BULLISH'
    ? candle.low<=level.zoneHigh && candle.high>=level.zoneLow
    : candle.high>=level.zoneLow && candle.low<=level.zoneHigh;
}

function bodyBeyondZone(candle,direction,level){
  return direction==='BULLISH'
    ? candle.open>level.zoneHigh&&candle.close>level.zoneHigh
    : candle.open<level.zoneLow&&candle.close<level.zoneLow;
}

function breakThroughZone(candle,side,level){
  return side==='RESISTANCE'
    ? candle.close>level.zoneHigh
    : candle.close<level.zoneLow;
}

function makeBaseLevels(candles){
  const out=[];
  for(let i=0;i<candles.length-1;i++){
    const first=candles[i],second=candles[i+1],type=baseType(first,second);
    if(!type)continue;
    const gap=type==='BULLISH_GAP'||type==='BEARISH_GAP';
    out.push({
      id:`msnr-${i}-${type}`,
      originIndex:i,
      originTime:first.time,
      confirmationIndex:i+1,
      level:first.close,
      type,
      baseType:type,
      side:sideFor(type),
      fresh:true,
      touches:0,
      flipCount:0,
      lastTouchIndex:null,
      lastFlipIndex:null,
      ...zoneBounds(first,second,type)
    });
  }
  return out;
}

function trackLevel(seed,candles){
  let currentType=seed.type;
  let side=sideFor(currentType);
  let fresh=true;
  let touches=0;
  let flipCount=0;
  let lastTouchIndex=null;
  let lastFlipIndex=null;
  const confirmations=[];

  for(let i=seed.confirmationIndex+1;i<candles.length;i++){
    const candle=candles[i];
    const broken=breakThroughZone(candle,side,seed);

    // A body close through the level is a break. Breakout takes priority over
    // rejection/touch and immediately flips the level back to Fresh.
    if(broken){
      currentType=flippedType(currentType);
      side=sideFor(currentType);
      fresh=true;
      touches=0;
      flipCount++;
      lastFlipIndex=i;

      // RBS/SBR are deliberately one-shot: only the very next candle may
      // confirm the fresh flip.
      if(i+1<candles.length){
        const signal=candles[i+1];
        const direction=side==='SUPPORT'?'BULLISH':'BEARISH';
        if(candleTouchesZone(signal,direction,seed)&&bodyBeyondZone(signal,direction,seed)){
          const middle=candle;
          const valid=continuation(signal,middle,direction,seed.level);
          if(valid){
            confirmations.push({
              type:currentType==='RBS'?'RBS_CC':'SBR_CC',
              direction,
              signalIndex:i+1,
              breakoutIndex:i,
              level:seed.level,
              freshBefore:true,
              signalCandle:signal,
              middleCandle:middle,
              reason:'Fresh role-reversal level was body-broken, then the very next closed candle rejected the new side.'
            });
          }
        }
      }
      continue;
    }

    if(fresh&&candleTouchesZone(candle,side==='SUPPORT'?'BULLISH':'BEARISH',seed)){
      const direction=side==='SUPPORT'?'BULLISH':'BEARISH';
      const bodyHolds=bodyBeyondZone(candle,direction,seed);
      const previous=candles[i-1];

      // For the original A/V/GAP levels, confirmation is the exact
      // creator -> middle -> signal sequence. The signal candle must touch
      // the level, keep its full body on the trade side, and close at least
      // as far as the middle candle.
      if(i===seed.confirmationIndex+1&&previous){
        const valid=bodyHolds&&continuation(candle,previous,direction,seed.level);
        if(valid){
          confirmations.push({
            type:currentType==='A'?'A_CC':
              currentType==='V'?'V_CC':
              currentType==='BULLISH_GAP'?'BULLISH_GAP_CC':'BEARISH_GAP_CC',
            direction,
            signalIndex:i,
            level:seed.level,
            freshBefore:true,
            signalCandle:candle,
            middleCandle:previous,
            reason:'Fresh MSNR level was touched and rejected by a full-body confirmation candle.'
          });
        }
      }

      fresh=false;
      touches++;
      lastTouchIndex=i;
    }
  }

  return {
    ...seed,
    type:currentType,
    side,
    fresh,
    touches,
    flipCount,
    lastTouchIndex,
    lastFlipIndex,
    confirmations
  };
}

export function buildMSNRLevels(candles){
  if(!Array.isArray(candles)||candles.length<3)return [];
  return makeBaseLevels(candles).map(level=>trackLevel(level,candles));
}

export function latestMSNRConfirmations(candles){
  const levels=buildMSNRLevels(candles);
  const lastIndex=candles.length-1;
  return levels
    .flatMap(level=>level.confirmations.map(event=>({...event,levelState:level})))
    .filter(event=>event.signalIndex===lastIndex)
    .sort((a,b)=>b.levelState.originIndex-a.levelState.originIndex);
}

function levelStrength(type){
  if(type==='RBS'||type==='SBR')return 1;
  if(type==='A'||type==='V')return .9;
  return .72;
}

function currentContext(layers,direction){
  const htf=layers.slice(0,-1).map(x=>x.structure?.direction).filter(Boolean);
  const aligned=htf.filter(x=>x===direction).length;
  const opposing=htf.filter(x=>x!==direction&&x!=='NEUTRAL').length;
  return {aligned,opposing,dominant:htf.find(x=>x!=='NEUTRAL')||'NEUTRAL'};
}

function objective(levels,direction,entry,minDistance=0){
  const opposing=direction==='BULLISH'
    ?levels.filter(x=>x.side==='RESISTANCE'&&x.level>entry)
    :levels.filter(x=>x.side==='SUPPORT'&&x.level<entry);
  const distanceFloor=Math.max(minDistance,Math.abs(entry)*.005);
  const candidates=opposing
    .filter(x=>(x.fresh||x.type==='RBS'||x.type==='SBR')&&Math.abs(x.level-entry)>=distanceFloor);
  for(const x of candidates){
    const peers=candidates.filter(y=>Math.abs(y.level-x.level)<=Math.max(distanceFloor*.35,Math.abs(entry)*.0015));
    const strength=x.type==='RBS'||x.type==='SBR'?100:x.type==='A'||x.type==='V'?90:75;
    x.clusterCount=peers.length;
    x.quality=strength+(x.fresh?18:0)+(x.flipCount>0?12:0)+(peers.length>=3?24:peers.length===2?14:0)+(x.tf?8:0);
  }
  return candidates
    .sort((a,b)=>b.quality-a.quality||Math.abs(a.level-entry)-Math.abs(b.level-entry))
    .find(x=>x.level!==entry)||null;
}
function gradeMSNR({level,event,context,target}){
  const levelType=String(event?.type||'').replace('_CC','');
  const strong=['RBS','SBR'].includes(levelType);
  return gradeSetup({
    strategy:'MSNR',
    context:{aligned:context.aligned>0||context.dominant==='NEUTRAL',trend:context.dominant!=='NEUTRAL'},
    entry:{anchorQuality:strong?1:.9,executionQuality:1},
    risk:{invalidationQuality:1,geometryQuality:1},
    target:{source:'MSNR_OPPOSING_LEVEL',quality:strong?.95:.82,pool:level?.flipCount>0?'REPEATED_STRUCTURE':undefined},
    confirmation:{quality:event?.freshBefore?1:.65},
    freshness:{quality:event?.freshBefore?1:.6}
  });
}

export function evaluateMSNR({candles,layers,price}){
  const levels=buildMSNRLevels(candles);
  const events=latestMSNRConfirmations(candles);
  const failures=[];
  if(!events.length)failures.push('No fresh MSNR confirmation candle at a live key level.');
  const liveExecutionDirection=layers.at(-1)?.structure?.direction||'NEUTRAL';
  const conflictingConfirmation=events.find(event=>liveExecutionDirection!=='NEUTRAL'&&event.direction!==liveExecutionDirection);
  if(conflictingConfirmation)return{
    direction:'NEUTRAL',
    failures:[`MSNR direction ${conflictingConfirmation.direction} conflicts with execution structure ${liveExecutionDirection}.`],
    evidence:[],
    levels,
    confirmations:events,
    candidates:[]
  };
  if(events.length&&Number.isFinite(price)){
    const liveAtr=atr(candles,14)||Math.max(Math.abs(price)*.001,1e-9);
    const allExtended=events.every(event=>{
      const level=event.levelState;
      const distance=price>level.zoneHigh?Math.abs(price-level.zoneHigh):price<level.zoneLow?Math.abs(level.zoneLow-price):0;
      return distance>Math.max(liveAtr*.2,Math.abs(price)*.0035);
    });
    if(allExtended)return{
      direction:'NEUTRAL',
      failures:['Confirmation candle closed too far from the MSNR level; entry is extended.'],
      evidence:[],
      levels,
      confirmations:events,
      candidates:[]
    };
  }

  const candidates=[];
  for(const event of events){
    const level=event.levelState;
    const direction=event.direction;
    const context=currentContext(layers,direction);
    const executionDirection=layers.at(-1)?.structure?.direction||'NEUTRAL';
    const opposingHigherTimeframe=layers.slice(0,-1)
      .map(x=>x.structure?.direction||'NEUTRAL')
      .find(x=>x!=='NEUTRAL'&&x!==direction);
    if(executionDirection!=='NEUTRAL'&&executionDirection!==direction){
      candidates.push({event,level,direction,context,entry:price,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:`MSNR direction ${direction} conflicts with execution structure ${executionDirection}.`});
      continue;
    }
    if(opposingHigherTimeframe){
      candidates.push({event,level,direction,context,entry:price,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:`MSNR direction ${direction} conflicts with higher-timeframe structure ${opposingHigherTimeframe}.`});
      continue;
    }
    const signalClose=event.signalCandle.close;
    const a=atr(candles,14)||Math.max(signalClose*.001,1e-9);
    const liveDrift=Math.abs(price-signalClose);
    if(liveDrift>Math.max(a*.25,Math.abs(price)*.001)){
      candidates.push({event,level,direction,context,entry:price,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:'MSNR confirmation is stale: live price moved too far from the confirmation close.'});
      continue;
    }
    const entry=price;
    if(direction==='BULLISH'&&entry<=level.zoneHigh){
      candidates.push({event,level,direction,context,entry,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:'Live price is no longer above the confirmed MSNR support level.'});
      continue;
    }
    if(direction==='BEARISH'&&entry>=level.zoneLow){
      candidates.push({event,level,direction,context,entry,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:'Live price is no longer below the confirmed MSNR resistance level.'});
      continue;
    }
    // Invalidate the MSNR thesis at the level plus a confirmed structural
    // swing, not at a tiny confirmation-candle wick.
    const external=confirmedSwings(candles,3);
    const structuralInvalidation=direction==='BULLISH'
      ?external.lows.filter(x=>x.confirmationIndex<=event.signalIndex&&x.price<=level.zoneLow).at(-1)
      :external.highs.filter(x=>x.confirmationIndex<=event.signalIndex&&x.price>=level.zoneHigh).at(-1);
    if(!structuralInvalidation){
      candidates.push({event,level,direction,context,entry,stop:null,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:'No confirmed external swing supports the MSNR invalidation zone.'});
      continue;
    }
    const invalidation=structuralInvalidation.price;
    const buffer=Math.max(a*.12,Math.abs(entry)*.00035);
    const stop=direction==='BULLISH'?invalidation-buffer:invalidation+buffer;
    const allLevels=layers.flatMap(layer=>
      buildMSNRLevels(layer.candles).map(x=>({...x,tf:layer.tf}))
    );
    const minTargetDistance=Math.max(a*1.5,Math.abs(entry)*.005);
    const target=objective(allLevels,direction,entry,minTargetDistance);
    if(!target){
      candidates.push({event,level,direction,context,entry,stop,target:null,rr:0,grade:{grade:'NO-TRADE',score:0},failure:'No opposing MSNR key level exists beyond the confirmed entry.'});
      continue;
    }
    const reward=Math.abs(target.level-entry),risk=Math.abs(entry-stop),rr=risk>0?reward/risk:0;
    const distanceFromLevel=entry>level.zoneHigh?Math.abs(entry-level.zoneHigh):entry<level.zoneLow?Math.abs(level.zoneLow-entry):0;
    const tooExtended=distanceFromLevel>Math.max(a*.2,Math.abs(entry)*.0035);
    if(tooExtended){
      candidates.push({event,level,direction,context,entry,stop,target,rr,grade:{grade:'NO-TRADE',score:0},failure:'Confirmation candle closed too far from the MSNR level; entry is extended.'});
      continue;
    }
    const stopTooWide=risk>Math.max(a*1.25,Math.abs(entry)*.015);
    if(stopTooWide){
      candidates.push({event,level,direction,context,entry,stop,target,rr,grade:{grade:'NO-TRADE',score:0},failure:'MSNR invalidation is too far from the live entry; stop geometry is no longer efficient for the confirmed level.'});
      continue;
    }
    if(!(risk>0&&reward>0)){
      candidates.push({event,level,direction,context,entry,stop,target,rr,grade:{grade:'NO-TRADE',score:0},failure:'The next opposing MSNR objective is not beyond the entry.'});
      continue;
    }
    const g=gradeMSNR({level,event,context,target});
    if(!['A+','A'].includes(g.grade)){
      candidates.push({event,level,direction,context,entry,stop,target,rr,grade:g,failure:'MSNR confluence is below the executable A-grade threshold.'});
      continue;
    }
    candidates.push({
      event,level,direction,context,entry,stop,target,rr,grade:g,
      trade:{
        entry,stop,target:target.level,risk,reward,rr,
        orderType:'MARKET',
        marketEntry:price,
        entryReason:`${event.type} at fresh ${level.type} ${level.side} level; the confirmation candle closed with its full body on the ${direction==='BULLISH'?'support':'resistance'} side and live price remains executable.`,
        invalidation:invalidation,
        invalidationSource:direction==='BULLISH'
          ?'MSNR level / confirmed external swing low'
          :'MSNR level / confirmed external swing high'
      }
    });
  }

  const valid=candidates.filter(x=>x.trade).sort((a,b)=>b.grade.score-a.grade.score||b.rr-a.rr);
  const best=valid[0]||null;
  if(!best){
    const candidateFailures=candidates.map(x=>x.failure).filter(Boolean);
    return {
      direction:'NEUTRAL',
      failures:[...new Set([...failures,...candidateFailures])],
      evidence:[],
      levels,
      confirmations:events,
      candidates
    };
  }

  const level=best.level;
  const evidence=[
    `MSNR ${best.event.type}: ${level.type} ${level.side} at ${level.level}`,
    `Freshness: ${best.event.freshBefore?'FRESH':'UNFRESH'} before confirmation`,
    `Confirmation: closed candle ${best.event.signalIndex} touched the level and kept its full body on the trade side`,
    `Entry: live market price ${best.entry} immediately after the closed confirmation candle`,
    `Invalidation: ${best.trade.invalidation} from ${best.trade.invalidationSource}`,
    `Objective: next opposing MSNR level ${best.target.type} at ${best.target.level}`,
    `R:R: 1:${best.rr.toFixed(2)}`
  ];

  return {
    direction:best.direction,
    trade:best.trade,
    failures:[],
    evidence,
    levels,
    confirmations:events,
    candidates,
    msnr:{
      level:{
        price:level.level,
        type:level.type,
        side:level.side,
        fresh:!!best.event.freshBefore,
        originIndex:level.originIndex,
        originTime:level.originTime,
        flipCount:level.flipCount,
        touches:level.touches
      },
      confirmation:best.event,
      context:best.context,
      objective:{
        price:best.target.level,
        type:best.target.type,
        side:best.target.side,
        timeframe:best.target.tf||null
      }
    },
    grade:best.grade
  };
}

export const MSNR_LEVEL_TYPES=['A','V','BULLISH_GAP','BEARISH_GAP','SBR','RBS'];
export const MSNR_CONFIRMATION_TYPES=['A_CC','V_CC','BULLISH_GAP_CC','BEARISH_GAP_CC','SBR_CC','RBS_CC'];
