import {atr,bodyRatio} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup,validateTradeGeometry,enforceFreshnessGrade} from './grading.js';

export const SMC_MODEL='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG';

// A confirmed HH/HL or LH/LL sequence is an established HTF trend;
// a direction inferred only from a recent break is transitional context.
export function hasConfirmedContextTrend(contextStructure,direction){
  return contextStructure?.rawDirection===direction;
}

export {fvgAt, meaningfulDisplacement, findSweeps, buildTrade, swingBreakAfter, freshFvg, isEntryInPremiumDiscount};
const MIN_SWEEP_PENETRATION_ATR=.15;
const MIN_SWEEP_RECLAIM_ATR=.10;
const MIN_SWEEP_RANGE_ATR=.60;
const MAX_LIQUIDITY_POOL_AGE=40;
// Replay sensitivity showed older raids materially degrade execution quality.
// A sweep older than eight 1H bars is no longer treated as an actionable setup.
export const MAX_SWEEP_AGE_BARS=8;
const MIN_FVG_SIZE_ATR=.10;
// Minimum impulse-size filter; its 1.30 ATR value remains under replay validation.
const MIN_DISPLACEMENT_ATR=1.30;

export function sweepQuality(c,x,direction,level,asOfIndex=c.length-1){
  // Compare the sweep to volatility before the raid, not an ATR inflated by its wick.
  const a=atr(c.slice(0,asOfIndex),14);
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
  // Measure the impulse against volatility that existed BEFORE the impulse.
  // Including the candidate candle in its own ATR denominator makes the
  // displacement threshold self-normalizing and can reject valid impulses.
  const x=c[i],a=atr(c.slice(0,i),14),r=x?.high-x?.low,body=x?Math.abs(x.close-x.open):0;
  if(!x||!a||!r||body/r<.6||r<a*MIN_DISPLACEMENT_ATR)return null;
  if(direction==='BULLISH'&&(x.close<=x.open||x.close<x.high-r*.25))return null;
  if(direction==='BEARISH'&&(x.close>=x.open||x.close>x.low+r*.25))return null;
  return{index:i,range:r,body,atrMultiple:r/a,bodyRatio:body/r};
}
export function displacementFvgForMss(c,sweepIndex,mssIndex,direction){
  for(let displacementIndex=mssIndex;displacementIndex>sweepIndex;displacementIndex--){
    const displacement=meaningfulDisplacement(c,displacementIndex,direction);
    if(!displacement)continue;
    const fvg=fvgAt(c,displacementIndex+1);
    if(fvg&&fvg.direction===direction&&fvg.createdBy===displacementIndex)
      return{displacement,fvg};
  }
  return null;
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
function buildSweepRangeIndex(c){
  let size=1;
  while(size<c.length)size*=2;
  const minLow=Array(size*2).fill(Infinity);
  const maxHigh=Array(size*2).fill(-Infinity);
  for(let i=0;i<c.length;i++){
    minLow[size+i]=Number(c[i]?.low);
    maxHigh[size+i]=Number(c[i]?.high);
  }
  for(let i=size-1;i>0;i--){
    minLow[i]=Math.min(minLow[i*2],minLow[i*2+1]);
    maxHigh[i]=Math.max(maxHigh[i*2],maxHigh[i*2+1]);
  }
  function firstCross(tree,node,left,right,from,to,level,mode){
    if(right<from||left>to)return -1;
    if(mode==='BELOW'?tree[node]>=level:tree[node]<=level)return -1;
    if(left===right)return left<c.length?left:-1;
    const mid=(left+right)>>1;
    const first=firstCross(tree,node*2,left,mid,from,to,level,mode);
    return first>=0?first:firstCross(tree,node*2+1,mid+1,right,from,to,level,mode);
  }
  return{
    firstBelow:(from,to,level)=>from<=to?firstCross(minLow,1,0,size-1,from,to,level,'BELOW'):-1,
    firstAbove:(from,to,level)=>from<=to?firstCross(maxHigh,1,0,size-1,from,to,level,'ABOVE'):-1
  };
}
function findSweeps(c,direction){
  const s=confirmedSwings(c,2),pools=direction==='BULLISH'?s.lows:s.highs,out=[];
  const rangeIndex=buildSweepRangeIndex(c);
  const suffixMinLow=Array(c.length+1).fill(Infinity);
  const suffixMaxHigh=Array(c.length+1).fill(-Infinity);
  for(let i=c.length-1;i>=0;i--){
    suffixMinLow[i]=Math.min(Number(c[i]?.low),suffixMinLow[i+1]);
    suffixMaxHigh[i]=Math.max(Number(c[i]?.high),suffixMaxHigh[i+1]);
  }
  const decisionPrice=Number(c.at(-1)?.close);
  const decisionAtr=atr(c,14)||Math.max(Math.abs(decisionPrice)*.001,1e-9);
  const stopBuffer=Math.max(decisionAtr*.15,Math.abs(decisionPrice)*.00035);
  for(const p of pools){
    // Query the first breach directly instead of rescanning every later candle
    // for every swing pool. The segment tree preserves the original first-touch
    // rule while reducing this stage from quadratic to O(n + pools*log(n)).
    const from=p.confirmationIndex;
    const to=Math.min(c.length-1,p.index+MAX_LIQUIDITY_POOL_AGE);
    const i=direction==='BULLISH'
      ?rangeIndex.firstBelow(from,to,p.price)
      :rangeIndex.firstAbove(from,to,p.price);
    if(i<0)continue;
    const x=c[i];
    const reclaimed=direction==='BULLISH'?x.close>p.price:x.close<p.price;
    if(!reclaimed)continue;
    const quality=sweepQuality(c,x,direction,p.price,i);
    const extreme=direction==='BULLISH'?x.low:x.high;
    const stopPrice=direction==='BULLISH'?extreme-stopBuffer:extreme+stopBuffer;
    const stillValid=direction==='BULLISH'
      ?suffixMinLow[i+1]>stopPrice
      :suffixMaxHigh[i+1]<stopPrice;
    if(quality&&stillValid)out.push({
      direction,index:i,time:Number.isFinite(x.time)?x.time+60*60_000:x.time,
      level:p.price,extreme,stopPrice,swingIndex:p.index,age:c.length-1-i,quality
    });
  }
  return out.sort((a,b)=>a.index-b.index);
}
function isEntryInPremiumDiscount(direction,entry,equilibrium){
  if(!Number.isFinite(entry)||!Number.isFinite(equilibrium))return false;
  return direction==='BULLISH'?entry<equilibrium:direction==='BEARISH'?entry>equilibrium:false;
}
export function premiumDiscountConfluenceFactor(inPreferredZone){
  return inPreferredZone===true?1:.9;
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
function freshFvg(c,fvg,asOf,allowCurrentRetest=false){
  if(!fvg||!Number.isFinite(fvg.midpoint))return false;
  // The planned execution price is the FVG midpoint. Once price has traded
  // through that midpoint, a pending order there would already have filled;
  // the gap cannot be advertised as a fresh, unfilled opportunity again.
  const lastPriorBar=allowCurrentRetest?asOf-1:asOf;
  for(let i=fvg.index+1;i<=lastPriorBar;i++){
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
  // A market retest must trade through the actual planned midpoint, reject it
  // in the HTF direction, and close with directional intent. Merely touching
  // an outer edge of the FVG (or closing on the correct side with a counter-
  // directional candle) is not enough evidence to cross the spread immediately.
  const midpointTouched=!!last&&last.low<=fvg.midpoint&&last.high>=fvg.midpoint;
  const directionalCandle=direction==='BULLISH'
    ?last?.close>last?.open&&last?.close>=last.low+lastRange*.65
    :last?.close<last?.open&&last?.close<=last.low+lastRange*.35;
  const fvgHeld=direction==='BULLISH'?last?.close>fvg.midpoint:last?.close<fvg.midpoint;
  const marketCandleQuality=!!last&&lastRange>0&&midpointTouched&&
    bodyRatio(last)>=.45&&directionalCandle&&fvgHeld;
  // A MARKET entry requires a completed midpoint retest with a directional
  // rejection close. Otherwise the setup is rejected rather than entering on
  // proximity alone; untouched, correctly-sided FVGs remain LIMIT candidates.
  if(midpointTouched&&!near)return reject('fvgRetestAlreadyPassed');
  if(near&&!marketCandleQuality)return reject('marketRetestNotConfirmed');
  const correctPendingSide=direction==='BULLISH'?price>entry:price<entry;
  if(!near&&!correctPendingSide)return reject('pendingLimitWrongSide');
  // Historical outcome diagnostics show a sharp quality drop once an
  // untouched FVG limit is more than 1.5 execution-timeframe ATR from price.
  // Keep distant, unfilled FVGs off the publication board instead of relying
  // on a 24-hour expiry to turn stale, low-proximity ideas into trades.
  if(!near&&Math.abs(price-entry)>a*1.5)return reject('pendingLimitTooFar');
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
  const direction=htfDirection,sweeps=findSweeps(c,direction).filter(x=>x.age<=MAX_SWEEP_AGE_BARS);
  if(!sweeps.length){failures.push(direction==='BULLISH'?'No valid sell-side liquidity sweep.':'No valid buy-side liquidity sweep.');return{direction,failures,evidence:[{type:'SMC_STAGE_DIAGNOSTICS',recentSweeps:0,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishOutOfZone:0,premiumDiscountBearishOutOfZone:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0,targetNoQualifiedStructure:0,targetOutOfReach:0,nearestTargetBelow3R:0,executionRejections:{invalidRiskReward:0,sweepInvalidated:0,marketRetestNotConfirmed:0,pendingLimitWrongSide:0,pendingLimitTooFar:0,geometryRejected:0,geometryRejectedBelow3R:0,geometryRejectedOther:0},geometryFailureReasons:{},pendingLimitAudit:[]}]};}

  const stages={recentSweeps:sweeps.length,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishOutOfZone:0,premiumDiscountBearishOutOfZone:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0,targetNoQualifiedStructure:0,targetOutOfReach:0,nearestTargetBelow3R:0};
  const executionRejections={invalidRiskReward:0,sweepInvalidated:0,marketRetestNotConfirmed:0,pendingLimitWrongSide:0,pendingLimitTooFar:0,geometryRejected:0,geometryRejectedBelow3R:0,geometryRejectedOther:0};
  const geometryFailureReasons={};
  const pendingLimitAudit=[];
  const premiumDiscountAudit=[];
  const targetRejectionAudit=[];
  const stageEvidence=()=>({type:'SMC_STAGE_DIAGNOSTICS',...stages,targetRejectionAudit:targetRejectionAudit.slice(-30),executionRejections:{...executionRejections},geometryFailureReasons:{...geometryFailureReasons},pendingLimitAudit:pendingLimitAudit.slice(-100),premiumDiscountAudit:premiumDiscountAudit.slice(-8)});
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
    // The impulse that creates the FVG may precede the confirming MSS
    // close. Requiring displacement, FVG creation, and MSS on one exact
    // candle discarded valid sweep -> displacement/FVG -> structure-break
    // sequences. Search backward from the MSS, but never before the sweep;
    // the displacement candle itself must create the directional FVG.
    const impulseSequence=displacementFvgForMss(c,sweepCandidate.index,mssCandidate.index,direction);
    const displacementCandidate=impulseSequence?.displacement||null;
    const fvgCandidate=impulseSequence?.fvg||null;
    if(!displacementCandidate||!fvgCandidate)continue;
    stages.displacement++;
    stages.fvgCreatedByMss++;
    // The current closed candle may be the confirming midpoint retest. Earlier
    // midpoint mitigation still invalidates the FVG; buildTrade below decides
    // whether this final-candle touch is a valid MARKET confirmation or stale.
    if(!freshFvg(c,fvgCandidate,c.length-1,true))continue;
    const fvgAtr=atr(c.slice(0,fvgCandidate.index+1),14);
    if(!fvgAtr||fvgCandidate.size<fvgAtr*MIN_FVG_SIZE_ATR)continue;
    stages.freshFvgAndSize++;
    const rangeCandidate=preSweepDealingRange(c,sweepCandidate);
    if(!rangeCandidate)continue;
    // Premium/discount classifies the planned FVG entry, not the sweep wick.
    // Measuring the wick against a range whose boundary is the swept pool
    // makes this filter pass almost automatically and adds no entry-location edge.
    const premiumDiscountDelta=fvgCandidate.midpoint-rangeCandidate.equilibrium;
    const rangeAtr=atr(c.slice(0,sweepCandidate.index),14)||0;
    if(rangeAtr>0){
      stages.premiumDiscountDeltaAtrSum+=premiumDiscountDelta/rangeAtr;
      stages.premiumDiscountDeltaSamples++;
    }
    premiumDiscountAudit.push({
      direction,sweepIndex:sweepCandidate.index,sweepLevel:sweepCandidate.level,sweepExtreme:sweepCandidate.extreme,
      mssIndex:mssCandidate.index,mssLevel:mssCandidate.level,fvgIndex:fvgCandidate.index,
      fvgLow:fvgCandidate.low,fvgHigh:fvgCandidate.high,fvgMidpoint:fvgCandidate.midpoint,
      premiumDiscountReference:'FVG_ENTRY_VS_PRE_SWEEP_CONFIRMED_SWING_RANGE',
      entryPrice:fvgCandidate.midpoint,
      atr:rangeAtr,
      structuralRangeHigh:rangeCandidate.high,structuralRangeLow:rangeCandidate.low,
      structuralEquilibrium:rangeCandidate.equilibrium,
      sweepDeltaAtr:rangeAtr?premiumDiscountDelta/rangeAtr:null,
      anchoredHighIndex:rangeCandidate.anchorHighIndex,anchoredLowIndex:rangeCandidate.anchorLowIndex
    });
    const inCorrectZone=isEntryInPremiumDiscount(direction,fvgCandidate.midpoint,rangeCandidate.equilibrium);
    // Premium/discount is a confluence, not a mandatory veto. The current
    // execution-timeframe range is a local reference and can sit on the wrong
    // side of an otherwise valid displacement FVG after MSS. Keep the
    // classification visible and let it modestly influence structural quality;
    // the sweep, MSS, fresh FVG, real target, executable geometry and 3R
    // contract remain hard requirements.
    if(inCorrectZone){
      if(direction==='BULLISH')stages.premiumDiscountBullishPass++;else stages.premiumDiscountBearishPass++;
    }else{
      if(direction==='BULLISH')stages.premiumDiscountBullishOutOfZone++;else stages.premiumDiscountBearishOutOfZone++;
    }
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
    const targetAudit={direction,sweepIndex:sweepCandidate.index,mssIndex:mssCandidate.index,fvgIndex:fvgCandidate.index};
    const targetCandidate=nextLiquidityTarget(
      c,direction,fvgCandidate.midpoint,price,structuralRisk,c.length-1,ordered,targetAudit
    );
    if(!targetCandidate||!Number.isFinite(targetCandidate.price)){
      if(targetAudit.reason==='NO_QUALIFIED_OPPOSING_STRUCTURE')stages.targetNoQualifiedStructure++;
      else if(targetAudit.reason==='QUALIFIED_TARGETS_OUTSIDE_EXECUTION_REACH')stages.targetOutOfReach++;
      else if(targetAudit.reason==='NEAREST_TARGET_BELOW_3R')stages.nearestTargetBelow3R++;
      if(targetRejectionAudit.length<30)targetRejectionAudit.push({...targetAudit,decisionTime:c.at(-1)?.time??null});
      continue;
    }
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
      fvg:fvgCandidate,range:rangeCandidate,target:targetCandidate,trade:tradeCandidate,
      inCorrectPremiumDiscountZone:inCorrectZone
    };
    break;
  }
  if(!selected){
    failures.push('No recent sweep completed the full SMC sequence with a valid structural target and executable FVG entry.');
    return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP_CANDIDATES',count:sweeps.length},stageEvidence()]};
  }

  const {sweep,mss,displacement,fvg,range,target,trade,inCorrectPremiumDiscountZone}=selected;
  // Publication freshness begins when BOTH parts of the entry sequence
  // exist: the MSS is confirmed and its displacement FVG has formed. The
  // older sweep is context, not the age of the actionable setup.
  const setupConfirmedIndex=Math.max(mss.index,fvg.index);
  const setupAgeBars=Math.max(0,c.length-1-setupConfirmedIndex);
  const contextLayer=ordered[0];
  const contextStructure=contextLayer?.structure||{};
  // A confirmed HH/HL or LH/LL sequence is a directional trend even when
  // the latest recorded break is a countertrend CHoCH. Only transitional
  // direction inferred from a recent break receives the reduced trend score.
  const confirmedContextTrend=hasConfirmedContextTrend(contextStructure,direction);
  const fvgAtr=atr(c.slice(0,fvg.index+1),14)||0;
  const fvgStrength=fvgAtr>0?Math.max(.35,Math.min(1,fvg.size/(fvgAtr*.75))):0;
  const executionCandle=c.at(-1);
  const executionBody=executionCandle?bodyRatio(executionCandle):0;
  const executionRange=executionCandle?executionCandle.high-executionCandle.low:0;
  const closePosition=executionRange>0
    ?direction==='BULLISH'
      ?(executionCandle.close-executionCandle.low)/executionRange
      :(executionCandle.high-executionCandle.close)/executionRange
    :0;
  const executionQuality=trade.orderType==='MARKET'
    ?Math.max(.45,Math.min(1,executionBody*.65+closePosition*.35))
    :limitEntryQuality(trade.entry,price,atr(c,14)||0);
  // Grade market-entry risk at the live decision quote, not the FVG midpoint.
  // The shared execution layer may move a MARKET fill to bid/ask; it then
  // validates final geometry again before publication.
  const gradeEntryPrice=trade.orderType==='MARKET'?price:trade.entry;
  const riskAtr=(atr(c,14)||0)>0?Math.abs(gradeEntryPrice-trade.stop)/atr(c,14):0;
  const invalidationQuality=Math.max(.35,Math.min(1,1-Math.abs(riskAtr-1.25)/2.5));
  const geometryQuality=Math.max(.35,Math.min(1,1-Math.max(0,riskAtr-1)/2));
  const baseGrade=gradeSetup({
    strategy:'SMC',
    context:{aligned:contextStructure.direction===direction,trend:confirmedContextTrend},
    entry:{anchorQuality:fvgStrength,executionQuality},
    risk:{invalidationQuality,geometryQuality},
    target,
    confirmation:{quality:Math.min(1,.35+(sweep.quality?.penetrationATR>=.35?.15:.08)+(sweep.quality?.reclaimDepthATR>=.2?.12:.05)+(displacement.atrMultiple>=1.35?.28:.15))*premiumDiscountConfluenceFactor(inCorrectPremiumDiscountZone)},
    freshness:{quality:Math.min(1,.35+ageQuality(setupAgeBars,2,8)*.4+Math.min(1,displacement.atrMultiple/1.5)*.25)}
  });
  const grade=enforceFreshnessGrade(baseGrade,setupAgeBars);
  trade.sweepAgeBars=sweep.age;
  trade.setupAgeBars=setupAgeBars;
  trade.sweepTime=sweep.time??c[sweep.index]?.time??null;
  return{direction,grade,trade,failures:[],evidence:[{type:'HTF_BIAS',direction,timeframe:ordered[0]?.tf||null},{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg},{type:'PREMIUM_DISCOUNT',zone:fvg.midpoint<range.equilibrium?'DISCOUNT':fvg.midpoint>range.equilibrium?'PREMIUM':'EQUILIBRIUM',preferredZone:direction==='BULLISH'?'DISCOUNT':'PREMIUM',entryInPreferredZone:inCorrectPremiumDiscountZone,equilibrium:range.equilibrium,entry:fvg.midpoint,interpretation:'Confluence only; a valid SMC sequence is not rejected solely for local dealing-range location.'},stageEvidence()],smc:{model:SMC_MODEL,htfBias:direction,sweep,mss,displacement,fvg,dealingRange:range,target}};
}
