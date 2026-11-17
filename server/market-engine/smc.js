import {atr,bodyRatio} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const SMC_MODEL='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG';

export {fvgAt, meaningfulDisplacement, findSweeps, buildTrade};
const MIN_SWEEP_PENETRATION_ATR=.15;
const MIN_SWEEP_RECLAIM_ATR=.10;
const MIN_SWEEP_RANGE_ATR=.60;
const MIN_FVG_SIZE_ATR=.10;

function sweepQuality(c,x,direction,level){
  const a=atr(c,14);
  const r=x?.high-x?.low;
  if(!x||!a||!Number.isFinite(r)||r<=0)return null;
  const penetration=direction==='BULLISH'?level-x.low:x.high-level;
  const reclaim=direction==='BULLISH'?x.close-level:level-x.close;
  if(penetration<a*MIN_SWEEP_PENETRATION_ATR||reclaim<a*MIN_SWEEP_RECLAIM_ATR||r<a*MIN_SWEEP_RANGE_ATR)return null;
  return {penetration,penetrationATR:penetration/a,reclaimDepth:reclaim,reclaimDepthATR:reclaim/a,range:r,rangeATR:r/a};
}
function ageQuality(age,fresh,recent){if(!Number.isFinite(age))return 0;if(age<=fresh)return 1;if(age<=recent)return .7;if(age<=16)return .35;return 0;}

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
  if(direction==='BULLISH'){
    const candidates=s.highs.filter(x=>x.index>start&&x.confirmationIndex<=end);
    for(const sw of candidates.slice().reverse())for(let i=Math.max(sw.confirmationIndex,start+1);i<=end;i++)if(c[i].close>sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
  }else{
    const candidates=s.lows.filter(x=>x.index>start&&x.confirmationIndex<=end);
    for(const sw of candidates.slice().reverse())for(let i=Math.max(sw.confirmationIndex,start+1);i<=end;i++)if(c[i].close<sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
  }
  return null;
}
function findSweeps(c,direction){
  const s=confirmedSwings(c,2),pools=direction==='BULLISH'?s.lows:s.highs,out=[];
  for(const p of pools)for(let i=p.confirmationIndex;i<c.length;i++){
    const x=c[i],swept=direction==='BULLISH'?x.low<p.price:x.high>p.price,reclaimed=direction==='BULLISH'?x.close>p.price:x.close<p.price;
    if(swept&&reclaimed){
      const quality=sweepQuality(c,x,direction,p.price);
      if(!quality)continue;
      const extreme=direction==='BULLISH'?x.low:x.high;
      const stillValid=c.slice(i+1).every(z=>direction==='BULLISH'?z.close>=extreme:z.close<=extreme);
      if(stillValid)out.push({direction,index:i,level:p.price,extreme,swingIndex:p.index,age:c.length-1-i,quality});
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
  if(!fvg)return false;
  // A valid FVG entry is expected to be the first controlled return into the
  // gap. Treating any wick into the gap as "mitigated" made the entry contract
  // self-contradictory: the strategy required a fresh FVG and then required
  // price to enter that same FVG. The gap is invalidated only when price closes
  // through its far boundary.
  for(let i=fvg.index+1;i<=asOf;i++){
    const x=c[i];
    if(fvg.direction==='BULLISH'&&x.close<=fvg.low)return false;
    if(fvg.direction==='BEARISH'&&x.close>=fvg.high)return false;
  }
  return true;
}
function nextLiquidityTarget(c,direction,entry,asOfIndex,layers=[]){
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005);
  return selectStructuralTarget(c,direction,entry,{layers,minDistance,asOf:asOfIndex,asOfTime:c[asOfIndex]?.time??null})||null;
}
function buildTrade({c,price,direction,sweep,mss,displacement,fvg,target}){
  const a=atr(c,14)||Math.max(Math.abs(price)*.001,1e-9),buffer=Math.max(a*.15,Math.abs(price)*.00035);
  const stop=direction==='BULLISH'?sweep.extreme-buffer:sweep.extreme+buffer,entry=fvg.midpoint,risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=risk>0?reward/risk:0;
  if(!Number.isFinite(rr)||rr<=0)return null;
  if(direction==='BULLISH'&&price<sweep.extreme)return null;
  if(direction==='BEARISH'&&price>sweep.extreme)return null;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const near=Math.abs(price-entry)<=tolerance;
  const pendingDistance=Math.abs(price-entry);
  const pendingMax=Math.max(a,Math.abs(entry)*.003);
  const last=c.at(-1);
  const lastRange=last?.high-last?.low;
  const fvgTouched=!!last&&last.low<=fvg.high&&last.high>=fvg.low;
  const fvgHeld=direction==='BULLISH'?last?.close>fvg.midpoint:last?.close<fvg.midpoint;
  const marketCandleQuality=!!last&&lastRange>0&&fvgTouched&&bodyRatio(last)>=.35&&fvgHeld;
  // A MARKET entry requires a closed candle to actually interact with and
  // hold the FVG. Without that, proximity to the midpoint is only a pending
  // limit opportunity, not confirmation to enter immediately.
  if(near&&!marketCandleQuality)return null;
  const orderType=near?'MARKET':direction==='BULLISH'?(price>entry&&pendingDistance<=pendingMax?'LIMIT':null):(price<entry&&pendingDistance<=pendingMax?'LIMIT':null);
  if(!orderType)return null;
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
  if(!sweeps.length){failures.push(direction==='BULLISH'?'No valid sell-side liquidity sweep.':'No valid buy-side liquidity sweep.');return{direction,failures,evidence:[{type:'SMC_STAGE_DIAGNOSTICS',recentSweeps:0,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishReject:0,premiumDiscountBearishReject:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0}]};}

  const stages={recentSweeps:sweeps.length,mssWithinWindow:0,displacement:0,fvgCreatedByMss:0,freshFvgAndSize:0,premiumDiscount:0,premiumDiscountBullishPass:0,premiumDiscountBearishPass:0,premiumDiscountBullishReject:0,premiumDiscountBearishReject:0,premiumDiscountDeltaAtrSum:0,premiumDiscountDeltaSamples:0,structuralTarget:0,rrAtLeast3:0,executableEntry:0};
  const premiumDiscountAudit=[];
  const stageEvidence=()=>({type:'SMC_STAGE_DIAGNOSTICS',...stages,premiumDiscountAudit:premiumDiscountAudit.slice(-8)});
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

    const targetCandidate=nextLiquidityTarget(c,direction,fvgCandidate.midpoint,fvgCandidate.index,ordered);
    if(!targetCandidate||!Number.isFinite(targetCandidate.price))continue;
    stages.structuralTarget++;
    const stopBuffer=Math.max((atr(c,14)||Math.max(Math.abs(price)*.001,1e-9))*.15,Math.abs(price)*.00035);
    const structuralStop=direction==='BULLISH'?sweepCandidate.extreme-stopBuffer:sweepCandidate.extreme+stopBuffer;
    const structuralRisk=Math.abs(fvgCandidate.midpoint-structuralStop);
    const structuralReward=Math.abs(targetCandidate.price-fvgCandidate.midpoint);
    const structuralRR=structuralRisk>0?structuralReward/structuralRisk:0;
    if(structuralRR>=3)stages.rrAtLeast3++;
    const tradeCandidate=buildTrade({
      c,price,direction,sweep:sweepCandidate,mss:mssCandidate,
      displacement:displacementCandidate,fvg:fvgCandidate,target:targetCandidate.price
    });
    if(!tradeCandidate)continue;
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
  const grade=gradeSetup({
    strategy:'SMC',
    context:{aligned:true,trend:true},
    entry:{anchorQuality:1,executionQuality:1},
    risk:{invalidationQuality:1,geometryQuality:1},
    target:{...target,rr:trade.rr},
    confirmation:{quality:Math.min(1,.5+(sweep.quality?.penetrationATR>=.35?.15:.08)+(displacement.atrMultiple>=1.35?.27:.12))},
    freshness:{quality:Math.min(1,.45+ageQuality(sweep.age,4,10)*.35+Math.min(1,displacement.atrMultiple/1.5)*.2)}
  });
  return{direction,grade,trade,failures:[],evidence:[{type:'HTF_BIAS',direction,timeframe:ordered[0]?.tf||null},{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg},{type:'PREMIUM_DISCOUNT',zone:direction==='BULLISH'?'DISCOUNT':'PREMIUM',equilibrium:range.equilibrium},stageEvidence()],smc:{model:SMC_MODEL,htfBias:direction,sweep,mss,displacement,fvg,dealingRange:range,target}};
}
