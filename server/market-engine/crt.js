import {atr,bodyRatio,rangeAverage} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const CRT_MODEL='HTF_CANDLE_RANGE_SWEEP_RECLAIM_MSS_RETEST';

const dirs=new Set(['BULLISH','BEARISH']);

function alignedHTFBias(layers=[]){
  const context=layers.slice(0,-1).map(x=>x?.structure?.direction).filter(x=>dirs.has(x));
  if(!context.length)return null;
  const bias=context[0];
  if(context.some(x=>x!==bias))return null;
  return bias;
}

function rangeAnchor(layers=[],direction,candles=[]){
  const htf=layers[0];
  if(!htf||!Array.isArray(htf.candles)||htf.candles.length<3)return null;
  const lastPair=htf.candles.length-2;
  const firstPair=Math.max(0,lastPair-7);
  for(let i=lastPair;i>=firstPair;i--){
    const anchor=htf.candles[i],following=htf.candles[i+1];
    if(!anchor||!following||!(anchor.high>anchor.low))continue;
    const range={
      tf:htf.tf,
      anchor,
      following,
      high:anchor.high,
      low:anchor.low,
      midpoint:(anchor.high+anchor.low)/2
    };
    const htfSweepResult=htfSweep(range,direction);
    if(!htfSweepResult)continue;
    const executionSweepResult=executionSweep(candles,range,direction);
    if(!executionSweepResult)continue;
    if(candles.length-1-executionSweepResult.index>48)continue;
    return {...range,htfSweep:htfSweepResult,executionSweep:executionSweepResult};
  }
  return null;
}

function htfSweep(range,direction){
  const x=range.following;
  const lowSweep=x.low<range.low&&x.close>range.low&&x.close<range.high;
  const highSweep=x.high>range.high&&x.close<range.high&&x.close>range.low;
  if(direction==='BULLISH'&&!lowSweep)return null;
  if(direction==='BEARISH'&&!highSweep)return null;
  if((x.low<range.low&&x.high>range.high)||(!lowSweep&&!highSweep))return null;
  return {
    direction,
    index:range.anchor.time,
    candle:x,
    side:direction==='BULLISH'?'LOW':'HIGH',
    sweptLevel:direction==='BULLISH'?range.low:range.high,
    extreme:direction==='BULLISH'?x.low:x.high,
    closeInside:true
  };
}

function executionSweep(c,range,direction){
  const start=range.following.time;
  const eligible=c.filter(x=>x.time>=start);
  for(let i=0;i<eligible.length;i++){
    const x=eligible[i];
    const swept=direction==='BULLISH'
      ?x.low<range.low&&x.close>range.low
      :x.high>range.high&&x.close<range.high;
    if(!swept)continue;
    return {index:c.indexOf(x),candle:x,level:direction==='BULLISH'?range.low:range.high,
      extreme:direction==='BULLISH'?x.low:x.high};
  }
  return null;
}

function mssAfterSweep(c,sweep,direction){
  if(!sweep)return null;
  const swings=confirmedSwings(c,1);
  const points=direction==='BULLISH'?swings.highs:swings.lows;
  const candidates=points.filter(x=>x.index>sweep.index&&x.confirmationIndex> sweep.index);
  for(const sw of candidates){
    for(let i=Math.max(sw.confirmationIndex+1,sweep.index+1);i<c.length;i++){
      const x=c[i];
      const broken=direction==='BULLISH'?x.close>sw.price:x.close<sw.price;
      if(!broken)continue;
      const r=x.high-x.low;
      const a=atr(c.slice(0,i+1),14);
      const avg=rangeAverage(c.slice(0,i+1),20);
      if(!a||!avg||r<a||r<avg*1.1||bodyRatio(x)<.55)continue;
      return {
        index:i,
        level:sw.price,
        swingIndex:sw.index,
        candle:x,
        bodyRatio:bodyRatio(x),
        range:r,
        atrMultiple:r/a
      };
    }
  }
  return null;
}

function retest(c,mss,direction){
  if(!mss)return null;
  const max=Math.min(c.length-1,mss.index+8);
  for(let i=mss.index+1;i<=max;i++){
    const x=c[i];
    const touched=direction==='BULLISH'
      ?x.low<=mss.level&&x.high>=mss.level
      :x.high>=mss.level&&x.low<=mss.level;
    if(!touched)continue;
    const held=direction==='BULLISH'?x.close>mss.level:x.close<mss.level;
    if(!held)return {failed:true,index:i,candle:x};
    return {index:i,candle:x,entry:x.close,held:true};
  }
  return null;
}

function target(range,direction,c,entry,mssIndex,layers=[]){
  const primary=direction==='BULLISH'?range.high:range.low;
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005);
  if((direction==='BULLISH'&&primary>entry)||(direction==='BEARISH'&&primary<entry)){
    if(Math.abs(primary-entry)>=minDistance)
      return{price:primary,source:'CRT_OPPOSITE_EXTREME',index:-1};
  }
  const selected=selectStructuralTarget(c,direction,entry,{layers,minDistance,asOf:mssIndex,asOfTime:c[mssIndex]?.time??null});
  return selected?{price:selected.price,index:selected.index,source:selected.source,quality:selected.quality,pool:selected.pool}:null;
}
function grade({range,sweep,mss,rt,tgt,live,entry,a,rr}){const distance=Math.abs(live-entry);const tolerance=Math.max(a*.45,Math.abs(entry)*.0015);return gradeSetup({strategy:'CRT',context:{aligned:true,trend:true},entry:{anchorQuality:1,executionQuality:distance<=tolerance?1:.82},risk:{invalidationQuality:1,geometryQuality:.95},target:{...tgt,rr},confirmation:{quality:.92},freshness:{quality:.9}});}

export function evaluateCRT({candles=[],layers=[],price}){
  const failures=[];
  if(!Array.isArray(candles)||candles.length<40)
    return {direction:'NEUTRAL',failures:['Insufficient execution candles for CRT.'],evidence:[]};
  if(!Array.isArray(layers)||layers.length<2)
    return {direction:'NEUTRAL',failures:['CRT requires a higher-timeframe range and a lower-timeframe execution layer.'],evidence:[]};

  const direction=alignedHTFBias(layers);
  if(!direction)
    return {direction:'NEUTRAL',failures:['Higher-timeframe directions do not agree on a CRT delivery direction.'],evidence:[]};

  const range=rangeAnchor(layers,direction,candles);
  if(!range){
    failures.push('No recent completed CRT range has a valid higher-timeframe sweep/reclaim and lower-timeframe sweep.');
    return {direction,failures,evidence:[]};
  }

  const htf=range.htfSweep;
  const sweep=range.executionSweep;

  const mss=mssAfterSweep(candles,sweep,direction);
  if(!mss){
    failures.push('No meaningful lower-timeframe MSS/displacement followed the CRT sweep.');
    return {direction,failures,evidence:[{type:'CRT_RANGE',...range},{type:'HTF_SWEEP',...htf},{type:'LTF_SWEEP',...sweep}]};
  }

  const rt=retest(candles,mss,direction);
  if(!rt){
    failures.push('CRT MSS confirmed but has not produced a valid retest entry.');
    return {direction,failures,evidence:[{type:'CRT_RANGE',...range},{type:'HTF_SWEEP',...htf},{type:'LTF_SWEEP',...sweep},{type:'MSS',...mss}]};
  }
  if(rt.failed){
    failures.push('CRT MSS retest closed back through the broken structure level.');
    return {direction,failures,evidence:[{type:'CRT_RANGE',...range},{type:'HTF_SWEEP',...htf},{type:'LTF_SWEEP',...sweep},{type:'MSS',...mss},{type:'RETEST_FAILURE',...rt}]};
  }

  // The executable entry is the broken MSS level being retested, not an arbitrary
  // close inside the retest candle. The retest proves that this level is being
  // defended; the level itself is the price that defines the trade zone.
  const entry=mss.level;
  const a=atr(candles,14)||Math.max(Math.abs(entry)*.001,1e-9);
  const stop=direction==='BULLISH'
    ?sweep.extreme-a*.25
    :sweep.extreme+a*.25;
  const risk=Math.abs(entry-stop);
  if(!(risk>0)){
    failures.push('CRT sweep invalidation produces non-positive risk.');
    return {direction,failures,evidence:[]};
  }

  const tgt=target(range,direction,candles,entry,mss.index,layers);
  if(!tgt){
    failures.push('No meaningful opposing CRT or external structural target is available.');
    return {direction,failures,evidence:[{type:'CRT_RANGE',...range},{type:'MSS',...mss}]};
  }

  const reward=Math.abs(tgt.price-entry);
  const rr=reward/risk;
  if(!(reward>0)){failures.push('CRT structural target is not beyond entry.');return {direction,failures,evidence:[{type:'CRT_RANGE',...range},{type:'HTF_SWEEP',...htf},{type:'LTF_SWEEP',...sweep},{type:'MSS',...mss},{type:'RETEST',...rt},{type:'TARGET',...tgt,rr}]};}

  const live=Number(price);
  if(!Number.isFinite(live)||live<=0){
    failures.push('Live price is unavailable.');
    return {direction,failures,evidence:[]};
  }
  if(direction==='BULLISH'&&(live<=stop||live>=tgt.price)){
    failures.push('Live price has invalidated or already passed the CRT objective.');
    return {direction,failures,evidence:[]};
  }
  if(direction==='BEARISH'&&(live>=stop||live<=tgt.price)){
    failures.push('Live price has invalidated or already passed the CRT objective.');
    return {direction,failures,evidence:[]};
  }
  if(Math.abs(live-entry)>Math.max(a*1.5,Math.abs(live)*.003)){
    failures.push('CRT retest entry is stale relative to the current market price.');
    return {direction,failures,evidence:[]};
  }

  const orderType=direction==='BULLISH'
    ?live<=entry+a*.3?'MARKET':'LIMIT'
    :live>=entry-a*.3?'MARKET':'LIMIT';

  const g=grade({range,sweep,mss,rt,tgt,live,entry,a,rr});
  if(g.grade==='NO-TRADE'){
    failures.push('CRT confluence is below the executable A-grade threshold.');
    return {direction,failures,evidence:[],grade:g};
  }

  const trade={
    entry,
    marketEntry:live,
    stop,
    entryZone:{low:entry-a*.35,high:entry+a*.35,source:'CRT_MSS_RETEST_LEVEL'},
    invalidationPrice:sweep.extreme,
    target:tgt.price,
    risk,
    reward,
    rr,
    orderType,
    entryReason:'HTF CRT range was swept and reclaimed; lower-timeframe MSS/displacement confirmed the reversal and price retested the broken structure level.',
    invalidation:sweep.extreme,
    invalidationSource:'CRT sweep extreme with ATR buffer'
  };

  return {
    direction,
    tradeReady:true,
    grade:g,
    trade,
    failures:[],
    evidence:[
      {type:'HTF_ALIGNMENT',direction,timeframes:layers.slice(0,-1).map(x=>x.tf)},
      {type:'CRT_RANGE',...range},
      {type:'HTF_SWEEP',...htf},
      {type:'LTF_SWEEP',...sweep},
      {type:'MSS',...mss},
      {type:'RETEST',...rt},
      {type:'TARGET',...tgt,rr}
    ],
    crt:{
      model:CRT_MODEL,
      direction,
      anchor:{time:range.anchor.time,high:range.high,low:range.low,midpoint:range.midpoint,timeframe:range.tf},
      sweep:htf,
      executionSweep:sweep,
      mss,
      retest:rt,
      target:tgt
    }
  };
}
