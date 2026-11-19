import {atr,bodyRatio} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup,validateTradeGeometry,enforceFreshnessGrade} from './grading.js';

export const SMC_MODEL='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG';

export {fvgAt, meaningfulDisplacement, findSweeps, buildTrade, swingBreakAfter, freshFvg};
const MIN_SWEEP_PENETRATION_ATR=.15;
const MIN_SWEEP_RECLAIM_ATR=.10;
const MIN_SWEEP_RANGE_ATR=.60;
const MAX_LIQUIDITY_POOL_AGE=40;
const MIN_FVG_SIZE_ATR=.10;

function sweepQuality(c,x,direction,level,asOfIndex=c.length-1){
  const a=atr(c.slice(0,asOfIndex+1),14);
  const r=x?.high-x?.low;
  if(!x||!a||!Number.isFinite(r)||r<=0)return null;
  const penetration=direction==='BULLISH'?level-x.low:x.high-level;
  const reclaim=direction==='BULLISH'?x.close-level:level-x.close;
  if(penetration<a*MIN_SWEEP_PENETRATION_ATR||reclaim<a*MIN_SWEEP_RECLAIM_ATR||r<a*MIN_SWEEP_RANGE_ATR)return null;
  return {penetration,penetrationATR:penetration/a,reclaimDepth:reclaim,reclaimDepthATR:reclaim/a,range:r,rangeATR:r/a};
}
function ageQuality(age,fresh,recent){if(!Number.isFinite(age))return 0;if(age<=fresh)return 1;if(age<=recent)return .7;if(age<=8)return .35;return 0;}

// Pending-order quality is based on executable proximity to the planned FVG
// midpoint. Sweep age is scored separately as setup freshness, so it must not
// be counted a second time as entry execution quality.
export function limitEntryQuality(entry,price,atrValue){
  if(!Number.isFinite(entry)||!Number.isFinite(price)||!(atrValue>0))return .45;
  const allowance=Math.max(atrValue,Math.abs(entry)*.003);
  const proximity=1-Math.min(1,Math.abs(price-entry)/allowance);
  return .45+.25*proximity;
}

function fvgAt(c,i){
  if(i<2||!c[i-2]||!c[i-1]||!c[i])return null;
  const a=c[i-2],d=c[i];
  if(a.high<d.low)return{direction:'BULLISH',index:i,createdBy:i-1,low:a.high,high:d.low,size:d.low-a.high,midpoint:(a.high+d.low)/2};
  if(a.low>d.high)return{direction:'BEARISH',index:i,createdBy:i-1,low:d.high,high:a.low,size:a.low-d.high,midpoint:(d.high+a.low)/2};
  return null;
}
function meaningfulDisplacement(c,i,direction){
  const x=c[i],a=atr(c.slice(0,i+1),14),r=x?.high-x?.low,body=x?Math.abs(x.close-x.open):0;
  if(!x||!a||!r||body/r<.6||r<a*1.05)return null;
  if(direction==='BULLISH'&&(x.close<=x.open||x.close<x.high-r*.25))return null;
  if(direction==='BEARISH'&&(x.close>=x.open||x.close>x.low+r*.25))return null;
  return{index:i,range:r,body,atrMultiple:r/a,bodyRatio:body/r};
}
function swingBreakAfter(c,start,end,direction){
  const s=confirmedSwings(c,1);
  // MSS must break the opposing internal swing that existed BEFORE the
  // liquidity raid. A pivot created after the sweep is not the structure
  // whose failure confirms the shift; using one delays confirmation and
  // can label continuation structure as MSS.
  const swings=direction==='BULLISH'?s.highs:s.lows;
  const prior=swings.filter(x=>x.index<start&&x.confirmationIndex<=start).at(-1);
  if(!prior)return null;
  const crossed=direction==='BULLISH'
    ?close=>close>prior.price
    :close=>close<prior.price;
  // If the active opposing swing was already broken before the raid, it
  // cannot serve as fresh post-sweep MSS confirmation.
  for(let i=prior.confirmationIndex;i<=start;i++){
    const close=Number(c[i]?.close);
    if(Number.isFinite(close)&&crossed(close))return null;
  }
  for(let i=start+1;i<=end;i++){
    const close=Number(c[i]?.close);
    if(Number.isFinite(close)&&crossed(close)){
      return{index:i,level:prior.price,swingIndex:prior.index,confirmationIndex:prior.confirmationIndex};
    }
  }
  return null;
}
function findSweeps(c,direction){
  const s=confirmedSwings(c,2),pools=direction==='BULLISH'?s.lows:s.highs,out=[];
  for(const p of pools){
    // A liquidity pool must still be structurally recent when it is raided.
    // Once price first trades through a confirmed pool, that pool is consumed:
    // a later revisit cannot be relabelled as a fresh sweep of the same level.
    for(let i=p.confirmationIndex;i<c.length;i++){
      if(i-p.index>MAX_LIQUIDITY_POOL_AGE)break;
      const x=c[i],swept=direction==='BULLISH'?x.low<p.price:x.high>p.price;
      if(!swept)continue;
      const reclaimed=direction==='BULLISH'?x.close>p.price:x.close<p.price;
      if(reclaimed){
        const quality=sweepQuality(c,x,direction,p.price,i);
        const extreme=direction==='BULLISH'?x.low:x.high;
        // The trade is invalidated by a stop-price wick, not only by a candle
        // close beyond the sweep extreme. Replay and live execution both use
        // wick-based stop fills, so allowing a later wick through the stop
        // would publish a setup whose invalidation had already happened.
        const decisionPrice=Number(c.at(-1)?.close);
        const decisionAtr=atr(c,14)||Math.max(Math.abs(decisionPrice)*.001,1e-9);
        const stopBuffer=Math.max(decisionAtr*.15,Math.abs(decisionPrice)*.00035);
        const stopPrice=direction==='BULLISH'?extreme-stopBuffer:extreme+stopBuffer;
        const stillValid=c.slice(i+1).every(z=>direction==='BULLISH'?z.low>stopPrice:z.high<stopPrice);
        if(quality&&stillValid)out.push({direction,index:i,time:x.time,level:p.price,extreme,stopPrice,swingIndex:p.index,age:c.length-1-i,quality});
      }
      // The first wick through the pool consumes it, whether it reclaims or
      // closes beyond the level. Never accept a later breach as a new sweep.
      break;
    }
  }
  return out.sort((a,b)=>a.index-b.index);
}
function preSweepDealingRange(c,sweep){
  // Anchor the dealing range to the exact liquidity pool that was raided.
  // The opposite boundary is the latest confirmed opposing swing before
  // the raid. Using the latest same-side pivot can select an unrelated
  // structure and put a genuine sweep on the wrong side of equilibrium.
  const swings=confirmedSwings(c,2);
  const priorOpposing=sweep.direction==='BEARISH'
    ?swings.lows.filter(x=>x.confirmationIndex<=sweep.index&&x.index>=sweep.index-40).at(-1)
    :swings.highs.filter(x=>x.confirmationIndex<=sweep.index&&x.index>=sweep.index-40).at(-1);
  if(!priorOpposing||!Number.isFinite(sweep.level))return null;
  const high=sweep.direction==='BEARISH'?sweep.level:priorOpposing.price;
  const low=sweep.direction==='BEARISH'?priorOpposing.price:sweep.level;
  if(!Number.isFinite(high)||!Number.isFinite(low)||high<=low)return null;
  return{
    high,low,equilibrium:(high+low)/2,
    source:'SWEPT_POOL_TO_PRIOR_OPPOSING_SWING',
    anchorHighIndex:sweep.direction==='BEARISH'?sweep.swingIndex:priorOpposing.index,
    anchorLowIndex:sweep.direction==='BEARISH'?priorOpposing.index:sweep.swingIndex
  };
}
function freshFvg(c,fvg,asOf){
  if(!fvg||!Number.isFinite(fvg.midpoint))return false;
  // The planned execution price is the FVG midpoint. Once price has traded
  // through that midpoint, a pending order there would already have filled;
  // the gap cannot be advertised as a fresh, unfilled opportunity again.
  for(let i=fvg.index+1;i<=asOf;i++){
    const x=c[i];
    if(!x)continue;
    if(fvg.direction==='BULLISH'&&x.low<=fvg.midpoint)return false;
    if(fvg.direction==='BEARISH'&&x.high>=fvg.midpoint)return false;
  }
  return true;
}
export function nextLiquidityTarget(c,direction,entry,price,risk,asOfIndex,layers=[],audit=null){
  if(!Number.isFinite(entry)||!Number.isFinite(price)||!(risk>0))return null;
  const a=atr(c,14)||0;
  // Select the nearest meaningful opposing objective that is STILL AHEAD
  // of the live quote. A nearer level between the planned entry and current
  // price has already been cleared; treating it as an obstruction incorrectly
  // rejects the next valid liquidity objective. The 3R calculation below
  // remains anchored to the planned entry, never the live quote.
  const target=selectStructuralTarget(c,direction,price,{
    layers,minDistance:0,
    // Include close but meaningful major/pool levels in the path check. The
    // generic selector keeps a wider noise buffer for other legacy strategies.
    minimumDistanceFloor:Math.max(a*.5,Math.abs(price)*.0015),
    asOf:asOfIndex,asOfTime:c[asOfIndex]?.time??null,audit
  });
  if(!target||!Number.isFinite(target.price))return null;
  const stillAhead=direction==='BULLISH'?target.price>price:target.price<price;
  const reward=Math.abs(target.price-entry);
  if(!stillAhead){if(audit)audit.reason='TARGET_NOT_AHEAD_OF_LIVE_PRICE';return null;}
  if(reward<risk*3){if(audit){audit.reason='NEAREST_TARGET_BELOW_3R';audit.nearestTargetRR=+(reward/risk).toFixed(3);audit.requiredReward=+(risk*3).toPrecision(10);}return null;}
  if(audit)audit.reason='SELECTED';
  return target;
}
function buildTrade({c,price,direction,sweep,mss,displacement,fvg,target,diagnostics=null}){
  const reject=reason=>{if(diagnostics)diagnostics[reason]=(diagnostics[reason]||0)+1;return null;};
  const a=atr(c,14)||Math.max(Math.abs(price)*.001,1e-9),buffer=Math.max(a*.15,Math.abs(price)*.00035);
  const stop=direction==='BULLISH'?sweep.extreme-buffer:sweep.extreme+buffer,entry=fvg.midpoint,risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=risk>0?reward/risk:0;
  if(!Number.isFinite(rr)||rr<=0)return reject('invalidRiskReward');
  if(direction==='BULLISH'&&price<=stop)return reject('sweepInvalidated');
  if(direction==='BEARISH'&&price>=stop)return reject('sweepInvalidated');
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const near=Math.abs(price-entry)<=tolerance;
  const last=c.at(-1);
  const lastRange=last?.high-last?.low;
  const fvgTouched=!!last&&last.low<=fvg.high&&last.high>=fvg.low;
  const fvgHeld=direction==='BULLISH'?last?.close>fvg.midpoint:last?.close<fvg.midpoint;
  const marketCandleQuality=!!last&&lastRange>0&&fvgTouched&&bodyRatio(last)>=.35&&fvgHeld;
  // A MARKET entry requires a closed candle to actually interact with and
  // hold the FVG. Without that, proximity to the midpoint is only a pending
  // limit opportunity, not confirmation to enter immediately.
  if(near&&!marketCandleQuality)return reject('marketRetestNotConfirmed');
  const correctPendingSide=direction==='BULLISH'?price>entry:price<entry;
  if(!near&&!correctPendingSide)return reject('pendingLimitWrongSide');
  // Do not impose an arbitrary ATR-distance ceiling on an untouched FVG.
  // A correctly sided limit remains valid while the FVG is unmitigated;
  // the shared 24-hour pending-entry lifecycle expires it if price never
  // returns. Distance alone does not invalidate the structural setup.
  const orderType=near?'MARKET':'LIMIT';
  return{entry,marketEntry:price,stop,target,rr,orderType,
    entryZone:{low:fvg.low,high:fvg.high,source:'FVG_RETEST_ZONE'},
    invalidationPrice:sweep.extreme,entryReason:'Retrace into the unmitigated FVG created by the displacement that caused the MSS.',invalidation:'Beyond the liquidity-sweep extreme with volatility buffer.',invalidationSource:'liquidity_sweep_extreme',sweepLevel:sweep.level,sweepExtreme:sweep.extreme,mssLevel:mss.level,displacementIndex:displacement.index,fvg:{low:fvg.low,high:fvg.high,midpoint:fvg.midpoint,index:fvg.index}};
}
export function evaluateSMC({candles,layers,price}){
  const c=candles||[],failures=[];
  if(c.length<40)return{direction:'NEUTRAL',failures:['Insufficient execution candles for SMC.'],evidence:[]};
  const ordered=(layers||[]).filter(Boolean),contextDirections=ordered.slice(0,-1).map(x=>x?.structure?.direction).filter(x=>x==='BULLISH'||x==='BEARISH'),htfDirection=contextDirections[0]||'NEUTRAL';
  if(!['BULLISH','BEARISH'].includes(htfDirection)){failures.push('Higher-timeframe structure is not directional.');return{direction:'NEUTRAL',failures,evidence:[]};}
  if(contextDirections.some(x=>x!==htfDirection)){
    failures.push('Higher-timeframe structure conflicts with the primary SMC bias.');
    return{direction:'NEUTRAL',failures,evidence:[]};
  }
  const direction=htfDirection,sweeps=findSweeps(c,direction).filter(x=>x.age<=16);
  if(!sweeps.length){failures.push(direction==='BULLISH'?'No valid sell-side liquidity sweep.':'No valid buy-side liquidity sweep.');return{direction,failures,evidence:[{type:'SMC_STAGE_DIAGNOSTICS',recentSweeps:0,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishReject:0,premiumDiscountBearishReject:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0,executionRejections:{invalidRiskReward:0,sweepInvalidated:0,marketRetestNotConfirmed:0,pendingLimitWrongSide:0,pendingLimitTooFar:0,geometryRejected:0,geometryRejectedBelow3R:0,geometryRejectedOther:0},geometryFailureReasons:{},pendingLimitAudit:[]}]};}

  const stages={recentSweeps:sweeps.length,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishReject:0,premiumDiscountBearishReject:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0};
  const executionRejections={invalidRiskReward:0,sweepInvalidated:0,marketRetestNotConfirmed:0,pendingLimitWrongSide:0,pendingLimitTooFar:0,geometryRejected:0,geometryRejectedBelow3R:0,geometryRejectedOther:0};
  const geometryFailureReasons={};
  const pendingLimitAudit=[];
  const premiumDiscountAudit=[];
  const stageEvidence=()=>({type:'SMC_STAGE_DIAGNOSTICS',...stages,executionRejections:{...executionRejections},geometryFailureReasons:{...geometryFailureReasons},pendingLimitAudit:pendingLimitAudit.slice(-100),premiumDiscountAudit:premiumDiscountAudit.slice(-8)});
  let selected=null;
  if(!Number.isFinite(price)||price<=0){
    failures.push('Live price is unavailable.');
    return{direction,failures,evidence:[]};
  }
  // Evaluate each qualifying sweep all the way through target and entry
  // construction. A newer sweep that has no usable objective or executable
  // FVG retest must not hide an older, otherwise valid setup.
  for(const sweepCandidate of sweeps.slice().reverse()){
    const mssCandidate=swingBreakAfter(c,sweepCandidate.index,c.length-1,direction);
    if(!mssCandidate||mssCandidate.index-sweepCandidate.index>10)continue;
    stages.mssWithinWindow++;
    const displacementCandidate=meaningfulDisplacement(c,mssCandidate.index,direction);
    if(!displacementCandidate)continue;
    stages.displacement++;
    const fvgCandidate=fvgAt(c,mssCandidate.index+1)?.direction===direction
      ?fvgAt(c,mssCandidate.index+1)
      :fvgAt(c,mssCandidate.index)?.direction===direction?fvgAt(c,mssCandidate.index):null;
    if(!fvgCandidate||fvgCandidate.createdBy!==mssCandidate.index)continue;
    stages.fvgCreatedByMss++;
    if(!freshFvg(c,fvgCandidate,c.length-1))continue;
    const fvgAtr=atr(c.slice(0,fvgCandidate.index+1),14);
    if(!fvgAtr||fvgCandidate.size<fvgAtr*MIN_FVG_SIZE_ATR)continue;
    stages.freshFvgAndSize++;
    const rangeCandidate=preSweepDealingRange(c,sweepCandidate);
    if(!rangeCandidate)continue;
    const premiumDiscountDelta=sweepCandidate.extreme-rangeCandidate.equilibrium;
    const rangeAtr=atr(c.slice(0,sweepCandidate.index),14)||0;
    if(rangeAtr>0){
      stages.premiumDiscountDeltaAtrSum+=premiumDiscountDelta/rangeAtr;
      stages.premiumDiscountDeltaSamples++;
    }
    premiumDiscountAudit.push({
      direction,sweepIndex:sweepCandidate.index,sweepLevel:sweepCandidate.level,sweepExtreme:sweepCandidate.extreme,
      mssIndex:mssCandidate.index,mssLevel:mssCandidate.level,fvgIndex:fvgCandidate.index,
      fvgLow:fvgCandidate.low,fvgHigh:fvgCandidate.high,fvgMidpoint:fvgCandidate.midpoint,
      premiumDiscountReference:'PRE_SWEEP_CONFIRMED_SWING_RANGE',
      atr:rangeAtr,
      structuralRangeHigh:rangeCandidate.high,structuralRangeLow:rangeCandidate.low,
      structuralEquilibrium:rangeCandidate.equilibrium,
      sweepDeltaAtr:rangeAtr?premiumDiscountDelta/rangeAtr:null,
      anchoredHighIndex:rangeCandidate.anchorHighIndex,anchoredLowIndex:rangeCandidate.anchorLowIndex
    });
    const inCorrectZone=direction==='BULLISH'?premiumDiscountDelta<=0:premiumDiscountDelta>=0;
    if(!inCorrectZone){
      if(direction==='BULLISH')stages.premiumDiscountBullishReject++;else stages.premiumDiscountBearishReject++;
      continue;
    }
    if(direction==='BULLISH')stages.premiumDiscountBullishPass++;else stages.premiumDiscountBearishPass++;
    stages.premiumDiscount++;

    // Build structural invalidation first so target selection can enforce
    // both the 3R floor and the live-quote boundary in one pass.
    const stopBuffer=Math.max((atr(c,14)||Math.max(Math.abs(price)*.001,1e-9))*.15,Math.abs(price)*.00035);
    const structuralStop=direction==='BULLISH'?sweepCandidate.extreme-stopBuffer:sweepCandidate.extreme+stopBuffer;
    const structuralRisk=Math.abs(fvgCandidate.midpoint-structuralStop);
    if(!(structuralRisk>0))continue;
    // Targets must be real confirmed structure beyond the current executable
    // quote, not merely beyond the planned FVG entry. Otherwise a LIMIT can
    // be published after its take-profit has already traded.
    const targetCandidate=nextLiquidityTarget(
      c,direction,fvgCandidate.midpoint,price,structuralRisk,c.length-1,ordered
    );
    if(!targetCandidate||!Number.isFinite(targetCandidate.price))continue;
    stages.structuralTarget++;
    const structuralReward=Math.abs(targetCandidate.price-fvgCandidate.midpoint);
    const structuralRR=structuralReward/structuralRisk;
    if(structuralRR<3)continue;
    stages.rrAtLeast3++;
    const tradeCandidate=buildTrade({
      c,price,direction,sweep:sweepCandidate,mss:mssCandidate,
      displacement:displacementCandidate,fvg:fvgCandidate,target:targetCandidate.price,diagnostics:executionRejections
    });
    if(executionRejections.pendingLimitAudit?.length){
      pendingLimitAudit.push(...executionRejections.pendingLimitAudit.splice(0,100-pendingLimitAudit.length));
    }
    if(!tradeCandidate)continue;
    tradeCandidate.targetSource=targetCandidate.source||'STRUCTURAL_TARGET';
    tradeCandidate.targetSelection={
      price:targetCandidate.price,source:targetCandidate.source||'STRUCTURAL_TARGET',
      quality:targetCandidate.quality??null,pool:targetCandidate.pool??null,
      clusterCount:targetCandidate.clusterCount??null
    };
    const geometry=validateTradeGeometry({trade:tradeCandidate,direction,candles:c});
    if(!geometry.valid){
      executionRejections.geometryRejected++;
      if(geometry.failures.some(x=>x.includes('below the 3R minimum')))executionRejections.geometryRejectedBelow3R++;
      else executionRejections.geometryRejectedOther++;
      for(const reason of geometry.failures)geometryFailureReasons[reason]=(geometryFailureReasons[reason]||0)+1;
      continue;
    }
    stages.executableEntry++;
    selected={
      sweep:sweepCandidate,mss:mssCandidate,displacement:displacementCandidate,
      fvg:fvgCandidate,range:rangeCandidate,target:targetCandidate,trade:tradeCandidate
    };
    break;
  }
  if(!selected){
    failures.push('No recent sweep completed the full SMC sequence with a valid structural target and executable FVG entry.');
    return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP_CANDIDATES',count:sweeps.length},stageEvidence()]};
  }

  const {sweep,mss,displacement,fvg,range,target,trade}=selected;
  const contextLayer=ordered[0];
  const contextStructure=contextLayer?.structure||{};
  const contextBreak=contextStructure.bos?.direction===direction||contextStructure.mss?.direction===direction;
  const fvgAtr=atr(c.slice(0,fvg.index+1),14)||0;
  const fvgStrength=fvgAtr>0?Math.max(.35,Math.min(1,fvg.size/(fvgAtr*.75))):0;
  const executionCandle=c.at(-1);
  const executionBody=executionCandle?bodyRatio(executionCandle):0;
  const executionQuality=trade.orderType==='MARKET'
    ?Math.max(.45,Math.min(1,executionBody))
    :limitEntryQuality(trade.entry,price,atr(c,14)||0);
  const riskAtr=(atr(c,14)||0)>0?Math.abs(trade.entry-trade.stop)/atr(c,14):0;
  const invalidationQuality=Math.max(.35,Math.min(1,1-Math.abs(riskAtr-1.25)/2.5));
  const geometryQuality=Math.max(.35,Math.min(1,1-Math.max(0,riskAtr-1)/2));
  const baseGrade=gradeSetup({
    strategy:'SMC',
    context:{aligned:contextStructure.direction===direction,trend:contextBreak},
    entry:{anchorQuality:fvgStrength,executionQuality},
    risk:{invalidationQuality,geometryQuality},
    target,
    confirmation:{quality:Math.min(1,.35+(sweep.quality?.penetrationATR>=.35?.15:.08)+(sweep.quality?.reclaimDepthATR>=.2?.12:.05)+(displacement.atrMultiple>=1.35?.28:.15))},
    freshness:{quality:Math.min(1,.35+ageQuality(sweep.age,2,8)*.4+Math.min(1,displacement.atrMultiple/1.5)*.25)}
  });
  const grade=enforceFreshnessGrade(baseGrade,sweep.age);
  trade.sweepAgeBars=sweep.age;
  trade.sweepTime=sweep.time??c[sweep.index]?.time??null;
  return{direction,grade,trade,failures:[],evidence:[{type:'HTF_BIAS',direction,timeframe:ordered[0]?.tf||null},{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg},{type:'PREMIUM_DISCOUNT',zone:direction==='BULLISH'?'DISCOUNT':'PREMIUM',equilibrium:range.equilibrium},stageEvidence()],smc:{model:SMC_MODEL,htfBias:direction,sweep,mss,displacement,fvg,dealingRange:range,target}};
}
