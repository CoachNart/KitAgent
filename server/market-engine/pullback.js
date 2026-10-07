import {atr} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const PULLBACK_MODEL='HTF_TREND_IMPULSE_RETRACE_CONTINUATION';

const validDir=d=>d==='BULLISH'||d==='BEARISH';
const last=a=>a?.at(-1)||null;

function alignedDirection(layers=[]){
  const dirs=layers.map(x=>x?.structure?.direction).filter(validDir);
  if(!dirs.length||dirs.some(d=>d!==dirs[0]))return null;
  return dirs[0];
}

function impulse(c,direction){
  const s=confirmedSwings(c,2);
  if(direction==='BULLISH'){
    const h=last(s.highs),prevL=s.lows.filter(x=>x.index<h?.index).at(-1);
    if(!h||!prevL)return null;
    return {direction,start:prevL,end:h,move:h.price-prevL.price};
  }
  const l=last(s.lows),prevH=s.highs.filter(x=>x.index<l?.index).at(-1);
  if(!l||!prevH)return null;
  return {direction,start:prevH,end:l,move:prevH.price-l.price};
}

function retracementZone(move,direction){
  const size=move.move;
  if(!(size>0))return null;
  if(direction==='BULLISH')return {low:move.end.price-size*.618,high:move.end.price-size*.382,depthLow:.382,depthHigh:.618};
  return {low:move.end.price+size*.382,high:move.end.price+size*.618,depthLow:.382,depthHigh:.618};
}

function pullbackTouches(c,zone,from){
  for(let i=Math.max(from+1,0);i<c.length;i++){
    const x=c[i];
    if(x.low<=zone.high&&x.high>=zone.low)return {index:i,candle:x};
  }
  return null;
}

function confirmation(c,touch,direction){
  if(!touch)return null;
  const x=c.at(-1);
  if(!x||touch.index>=c.length-1||x.time<=touch.candle.time)return null;
  const prior=c.slice(touch.index+1,c.length-1);
  if(!prior.length)return null;
  const pullHigh=Math.max(...prior.map(k=>k.high));
  const pullLow=Math.min(...prior.map(k=>k.low));
  if(direction==='BULLISH'&&x.close>pullHigh)return {index:c.length-1,type:'CONTINUATION_BREAK',level:pullHigh,candle:x};
  if(direction==='BEARISH'&&x.close<pullLow)return {index:c.length-1,type:'CONTINUATION_BREAK',level:pullLow,candle:x};
  return null;
}

function nextTarget(c,direction,entry,move,after,layers=[]){
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005);
  const native=(direction==='BULLISH'&&move.end.price>entry)||(direction==='BEARISH'&&move.end.price<entry)
    ?{price:move.end.price,index:move.end.index,source:'IMPULSE_EXTREME'}
    :null;
  if(native&&Math.abs(native.price-entry)>=minDistance)return native;
  return selectStructuralTarget(c,direction,entry,{layers,minDistance});
}
export function evaluatePullback({candles=[],layers=[],price}){
  const failures=[];
  if(!Array.isArray(candles)||candles.length<40)return {direction:'NEUTRAL',failures:['Insufficient execution candles.'],evidence:[]};
  const direction=alignedDirection(layers);
  if(!direction){
    failures.push('Higher-timeframe directions are not aligned.');
    return {direction:'NEUTRAL',failures,evidence:[]};
  }
  const move=impulse(candles,direction);
  if(!move||!(move.move>0)){
    failures.push('No confirmed directional impulse with a protected swing.');
    return {direction,failures,evidence:[]};
  }
  const zone=retracementZone(move,direction);
  const touch=pullbackTouches(candles,zone,move.end.index);
  if(!touch){
    failures.push('Price has not retraced into the 38.2%-61.8% value zone.');
    return {direction,failures,evidence:[{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone}]};
  }
  const protectedInvalid=move.start.price;
  const broken=direction==='BULLISH'
    ?candles.slice(move.end.index+1).some(x=>x.close<protectedInvalid)
    :candles.slice(move.end.index+1).some(x=>x.close>protectedInvalid);
  if(broken){
    failures.push('Pullback broke the impulse origin; continuation thesis is invalid.');
    return {direction,failures,evidence:[{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch}]};
  }
  const confirm=confirmation(candles,touch,direction);
  if(!confirm){
    failures.push('No closed continuation break after the pullback.');
    return {direction,failures,evidence:[{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch}]};
  }
  const live=Number(price);
  if(!Number.isFinite(live)||live<=0){
    failures.push('Live price is unavailable.');
    return {direction,failures,evidence:[]};
  }
  const entry=confirm.level;
  const a=atr(candles,14)||Math.max(Math.abs(entry)*.001,1e-9);
  // The executable stop invalidates the retracement structure, not the entire
  // impulse origin. The impulse origin remains a thesis-level failure check;
  // anchoring the stop to it can create unrelated multi-ATR risk.
  const pullbackCandles=candles.slice(touch.index);
  const pullbackLow=Math.min(...pullbackCandles.map(x=>x.low));
  const pullbackHigh=Math.max(...pullbackCandles.map(x=>x.high));
  const stop=direction==='BULLISH'
    ?Math.min(touch.candle.low,pullbackLow)-a*.25
    :Math.max(touch.candle.high,pullbackHigh)+a*.25;
  const risk=Math.abs(entry-stop);
  if(!(risk>0)){failures.push('Invalid structural risk.');return {direction,failures,evidence:[]};}
  const target=nextTarget(candles,direction,entry,move,confirm.index,layers);
  if(!target){
    failures.push('No meaningful structural continuation target is available.');
    return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm}]};
  }
  const reward=Math.abs(target.price-entry),rr=risk>0?reward/risk:0;
  if(!(reward>0)){
    failures.push('Structural target is not beyond entry.');
    return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target,rr}]};
  }
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const near=Math.abs(live-entry)<=tolerance;
  const orderType=near?'MARKET':direction==='BULLISH'?(live>entry?'LIMIT':null):(live<entry?'LIMIT':null);
  if(!orderType){
    failures.push('Live price has crossed the planned pullback entry; setup is stale and cannot be published as a waiting limit.');
    return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target,rr}]};
  }
  const grade=gradeSetup({
    strategy:'PULLBACK',
    context:{aligned:true,trend:layers.at(-1)?.structure?.state?.startsWith('TRENDING_')},
    entry:{anchorQuality:1,executionQuality:near?1:.8},
    risk:{invalidationQuality:1,geometryQuality:1},
    target,
    confirmation:{quality:.9},
    freshness:{quality:.85}
  });
  const trade={
    entry,marketEntry:live,stop,target:target.price,risk,reward,rr,orderType,
    entryReason:'HTF trend aligned with a confirmed impulse; price retraced into the value zone and the continuation break established the structural entry level.',
    invalidation:protectedInvalid,
    invalidationSource:'impulse_origin_structural_invalidation',
    targetSource:target.source||'STRUCTURAL_TARGET'
  };
  return {
    direction,tradeReady:true,trade,grade,orderType,entry,stopLoss:stop,takeProfit1:target.price,rr,
    failures:[],
    evidence:[...grade.confidenceEvidence,{type:'HTF_ALIGNMENT',direction},{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch},{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target}],
    pullback:{model:PULLBACK_MODEL,direction,impulse:move,retracement:zone,touch,confirmation:confirm,target}
  };
}
