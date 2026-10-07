import {atr} from './data.js';
import {confirmedSwings} from './structure.js';

export const PULLBACK_MODEL='HTF_TREND_IMPULSE_RETRACE_CONTINUATION';

const validDir=d=>d==='BULLISH'||d==='BEARISH';
const last=(a)=>a?.at(-1)||null;

function alignedDirection(layers=[]){
  const dirs=layers.map(x=>x?.structure?.direction).filter(validDir);
  if(!dirs.length||dirs.some(d=>d!==dirs[0]))return null;
  return dirs[0];
}

function impulse(c,direction){
  const s=confirmedSwings(c,2);
  if(direction==='BULLISH'){
    const h=last(s.highs), prevL=s.lows.filter(x=>x.index<h?.index).at(-1);
    if(!h||!prevL)return null;
    return {direction,start:prevL,end:h,move:h.price-prevL.price};
  }
  const l=last(s.lows), prevH=s.highs.filter(x=>x.index<l?.index).at(-1);
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
  if(!x||touch.index>=c.length-1)return null;
  if(x.time<=touch.candle.time)return null;
  const prior=c.slice(Math.max(touch.index,touch.index+1),c.length-1);
  const pullHigh=Math.max(...prior.map(k=>k.high));
  const pullLow=Math.min(...prior.map(k=>k.low));
  if(direction==='BULLISH'&&x.close>pullHigh)return {index:c.length-1,type:'CONTINUATION_BREAK',level:pullHigh,candle:x};
  if(direction==='BEARISH'&&x.close<pullLow)return {index:c.length-1,type:'CONTINUATION_BREAK',level:pullLow,candle:x};
  return null;
}

function nextTarget(c,direction,entry,move,after){
  // The impulse extreme is the first legitimate continuation objective even though
  // it formed before the confirmation candle. Only use later structure if that level
  // is already behind price.
  if(direction==='BULLISH'&&move.end.price>entry)return move.end;
  if(direction==='BEARISH'&&move.end.price<entry)return move.end;
  const s=confirmedSwings(c,2);
  const candidates=direction==='BULLISH'?s.highs.filter(x=>x.index>after&&x.price>entry):s.lows.filter(x=>x.index>after&&x.price<entry);
  return candidates[0]||null;
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
  const protectedInvalid=direction==='BULLISH'?move.start.price:move.start.price;
  const broken=direction==='BULLISH'?candles.slice(move.end.index+1).some(x=>x.close<protectedInvalid):candles.slice(move.end.index+1).some(x=>x.close>protectedInvalid);
  if(broken){
    failures.push('Pullback broke the impulse origin; continuation thesis is invalid.');
    return {direction,failures,evidence:[{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch}]};
  }
  const confirm=confirmation(candles,touch,direction);
  if(!confirm){
    failures.push('No closed continuation break after the pullback.');
    return {direction,failures,evidence:[{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch}]};
  }
  const entry=Number.isFinite(Number(price))?Number(price):confirm.candle.close;
  const a=atr(candles,14)||Math.max(Math.abs(entry)*.001,1e-9);
  const stop=direction==='BULLISH'?Math.min(touch.candle.low,move.start.price)-a*.25:Math.max(touch.candle.high,move.start.price)+a*.25;
  const risk=Math.abs(entry-stop);
  if(!(risk>0)){failures.push('Invalid structural risk.');return {direction,failures,evidence:[]};}
  const target=nextTarget(candles,direction,entry,move,confirm.index);
  if(!target){failures.push('No opposing structural continuation target.');return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm}]};}
  const reward=Math.abs(target.price-entry),rr=reward/risk;
  if(!(rr>=2)){failures.push('Structural target does not provide at least 2R.');return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target,rr}]};}
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);\n  const near=Math.abs(Number(price)-entry)<=tolerance;\n  const orderType=near?'MARKET':direction==='BULLISH'?(Number(price)>entry?'LIMIT':null):(Number(price)<entry?'LIMIT':null);\n  if(!orderType){failures.push('Live price has crossed the planned pullback entry; setup is stale and cannot be published as a waiting limit.');return {direction,failures,evidence:[{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target,rr}]};}
  return {
    direction,tradeReady:true,orderType,entry,stopLoss:stop,takeProfit1:target.price,rr,
    failures:[],
    evidence:[{type:'HTF_ALIGNMENT',direction},{type:'IMPULSE',...move},{type:'RETRACEMENT_ZONE',...zone},{type:'PULLBACK_TOUCH',...touch},{type:'CONTINUATION_BREAK',...confirm},{type:'TARGET',...target}],
    pullback:{model:PULLBACK_MODEL,direction,impulse:move,retracement:zone,touch,confirmation:confirm,target}
  };
}
