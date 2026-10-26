import {atr,bodyRatio,rangeAverage} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const BREAKOUT_MODEL='DEFINED_LEVEL_DECISIVE_BREAK_RETEST_HOLD_CONTINUATION';

const validDir=d=>d==='BULLISH'||d==='BEARISH';
function executionOrderType({direction,entry,price,tolerance}){
  const gap=Math.abs(price-entry),near=gap<=tolerance;
  if(direction==='BULLISH')return price<entry&&!near?null:(near?'MARKET':'LIMIT');
  if(direction==='BEARISH')return price>entry&&!near?null:(near?'MARKET':'LIMIT');
  return null;
}

function alignedDirection(layers=[]){
  const dirs=layers.slice(0,-1).map(x=>x?.structure?.direction).filter(validDir);
  if(!dirs.length)return null;
  const bias=dirs[0];
  if(dirs.some(d=>d!==bias))return null;
  return bias;
}

export function levelCluster(c,direction,asOfIndex= c.length){
  const s=confirmedSwings(c,2);
  // A level is only available after its swing-confirmation bars have closed.
  // When evaluating a historical breakout, exclude every swing confirmed later.
  const points=(direction==='BULLISH'?s.highs:s.lows)
    .filter(x=>x.confirmationIndex<asOfIndex);
  if(points.length<2)return null;
  const history=c.slice(0,Math.min(c.length,Math.max(0,Math.floor(asOfIndex))));
  const a=atr(history,14);
  if(!a)return null;
  const recent=points.slice(-10);
  const tolerance=a*.35;
  // Do not anchor the search to the newest swing: the newest swing is often
  // the breakout itself and therefore cannot be the repeated level. Search
  // the recent confirmed swings for the strongest genuine multi-touch cluster.
  const clusters=[];
  for(const seed of recent){
    const cluster=recent.filter(x=>Math.abs(x.price-seed.price)<=tolerance);
    if(cluster.length<2)continue;
    const level=cluster.reduce((sum,x)=>sum+x.price,0)/cluster.length;
    const newest=Math.max(...cluster.map(x=>x.confirmationIndex));
    const oldest=Math.min(...cluster.map(x=>x.confirmationIndex));
    clusters.push({level,cluster,newest,oldest});
  }
  const best=clusters
    .sort((x,y)=>y.cluster.length-x.cluster.length||y.newest-x.newest||y.oldest-x.oldest)[0];
  if(!best)return null;
  return {
    direction,
    level:best.level,
    touches:best.cluster.map(x=>({index:x.index,price:x.price,confirmationIndex:x.confirmationIndex})),
    tolerance
  };
}

function breakout(c,direction){
  const events=[];
  for(let i=c.length-1;i>=Math.max(1,c.length-12);i--){
    // Evaluate each candidate against the level and volatility available at
    // that candle; a future swing or later volatility must not define it.
    const historicalLevel=levelCluster(c,direction,i);
    if(!historicalLevel)continue;
    const history=c.slice(0,i+1);
    const a=atr(history,14),avg=rangeAverage(history,20);
    if(!a||!avg)continue;
    const level=historicalLevel.level;
    const x=c[i],r=x.high-x.low;
    const body=bodyRatio(x);
    const directional=direction==='BULLISH'?x.close>level&&x.close>x.open:x.close<level&&x.close<x.open;
    if(!directional||body<.55||r<a||r<avg*1.15)continue;
    const volumeAvg=c.slice(Math.max(0,i-20),i).map(k=>k.volume).filter(v=>Number.isFinite(v)&&v>0);
    if(volumeAvg.length>=5){
      const av=volumeAvg.reduce((s,v)=>s+v,0)/volumeAvg.length;
      if(!(x.volume>=av*1.1))continue;
    }
    events.push({index:i,candle:x,level,levelEvidence:historicalLevel,bodyRatio:body,range:r,atrMultiple:r/a});
  }
  return events;
}

function retest(c,br,direction){
  const maxIndex=Math.min(c.length-1,br.index+8);
  const a=atr(c.slice(0,br.index+1),14)||Math.max(Math.abs(br.level)*.001,1e-9);
  const zone=a*.15;
  for(let i=br.index+1;i<=maxIndex;i++){
    const x=c[i];
    const touched=direction==='BULLISH'
      ? x.low<=br.level+zone && x.high>=br.level-zone
      : x.high>=br.level-zone && x.low<=br.level+zone;
    if(!touched)continue;
    const held=direction==='BULLISH'?x.close>br.level:x.close<br.level;
    const r=x.high-x.low;
    const quality=r>0&&bodyRatio(x)>=.35;
    if(!held)return {failed:true,index:i,candle:x};
    if(!quality)continue;
    return {index:i,candle:x,zone,held:true,bodyRatio:bodyRatio(x)};
  }
  return null;
}

function continuation(c,rt,direction){
  if(!rt||rt.failed)return null;
  for(let i=rt.index+1;i<c.length;i++){
    const x=c[i];
    const holds=direction==='BULLISH'?x.close>rt.candle.high:x.close<rt.candle.low;
    const r=x.high-x.low;
    const quality=r>0&&bodyRatio(x)>=.45&&(
      direction==='BULLISH'
        ? x.close>=x.low+r*.7
        : x.close<=x.high-r*.7
    );
    if(holds&&quality){
      return {index:i,candle:x,type:'RETEST_CONTINUATION',level:direction==='BULLISH'?rt.candle.high:rt.candle.low,bodyRatio:bodyRatio(x)};
    }
    const failed=direction==='BULLISH'?x.close<=rt.candle.low:x.close>=rt.candle.high;
    if(failed)return null;
  }
  return null;
}

// Build the pre-break range using only swings that were confirmed before
// the breakout candle. A pivot can sit visually before the breakout while its
// right-side confirmation bars close after it; that pivot is future information.
export function preBreakRangeBoundary(c,direction,selectedLevel,breakoutIndex){
  const oppositePoints=direction==='BULLISH'?confirmedSwings(c,2).lows:confirmedSwings(c,2).highs;
  const firstTouchIndex=Math.min(...(selectedLevel?.touches||[]).map(x=>x.index));
  const opposite=oppositePoints.filter(x=>
    x.index<firstTouchIndex&&x.confirmationIndex<breakoutIndex
  );
  const history=c.slice(0,Math.max(0,breakoutIndex));
  const a=atr(history,14)||Math.max(Math.abs(selectedLevel?.level||0)*.001,1e-9);
  return direction==='BULLISH'
    ?Math.min(...opposite.map(x=>x.price),selectedLevel.level-a)
    :Math.max(...opposite.map(x=>x.price),selectedLevel.level+a);
}

function target(c,direction,entry,after,rangeHeight,layers=[]){
  const a=atr(c.slice(0,after+1),14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005,rangeHeight*.75);
  return selectStructuralTarget(c,direction,entry,{layers,minDistance,asOf:after,asOfTime:c[after]?.time??null});
}
export function evaluateBreakout({candles=[],layers=[],price}){
  const failures=[];
  if(!Array.isArray(candles)||candles.length<40)return {direction:'NEUTRAL',failures:['Insufficient execution candles.'],evidence:[]};

  const direction=alignedDirection(layers);
  if(!direction){
    failures.push('Higher-timeframe directions are not aligned.');
    return {direction:'NEUTRAL',failures,evidence:[]};
  }

  const level=levelCluster(candles,direction);
  if(!level){
    failures.push('No well-defined multi-touch breakout level.');
    return {direction,failures,evidence:[]};
  }

  const breakoutCandidates=breakout(candles,direction);
  if(!breakoutCandidates.length){
    failures.push('No decisive closed breakout beyond the defined level.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level}]};
  }

  let selected=null;
  for(const candidate of breakoutCandidates){
    // Rebuild the level using information available before this breakout candle.
    // The full-series cluster is discovery only; it must not define a past event.
    const historicalLevel=candidate.levelEvidence;
    if(!historicalLevel)continue;
    const breaksHistoricalLevel=direction==='BULLISH'
      ?candidate.candle.close>historicalLevel.level
      :candidate.candle.close<historicalLevel.level;
    if(!breaksHistoricalLevel)continue;
    const br={...candidate,level:historicalLevel.level};
    const rt=retest(candles,br,direction);
    if(!rt||rt.failed)continue;
    const confirm=continuation(candles,rt,direction);
    if(!confirm)continue;
    selected={br,rt,confirm,level:historicalLevel};
    break;
  }
  if(!selected){
    failures.push('No recent breakout produced a complete retest-and-continuation sequence.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level},{type:'BREAKOUT_CANDIDATES',count:breakoutCandidates.length}]};
  }
  const {br,rt,confirm}=selected;
  const selectedLevel=selected.level;
  const entry=selectedLevel.level;
  const a=atr(candles,14)||Math.max(Math.abs(entry)*.001,1e-9);
  // Use the full retest-to-continuation structure as invalidation. A single
  // retest candle can be unusually small and is not a robust noise boundary.
  const retestSequence=candles.slice(rt.index,confirm.index+1);
  const retestLow=Math.min(...retestSequence.map(x=>x.low));
  const retestHigh=Math.max(...retestSequence.map(x=>x.high));
  const stopBuffer=Math.max(a*.5,Math.abs(entry)*.0005);
  const invalidationPrice=direction==='BULLISH'?retestLow:retestHigh;
  const stop=direction==='BULLISH'
    ?invalidationPrice-stopBuffer
    :invalidationPrice+stopBuffer;
  const risk=Math.abs(entry-stop);
  if(!(risk>0)){failures.push('Invalid structural risk.');return {direction,failures,evidence:[]};}

  const rangeBoundary=preBreakRangeBoundary(candles,direction,selectedLevel,br.index);
  const rangeHeight=Math.abs(selectedLevel.level-rangeBoundary);
  if(!(rangeHeight>0)){failures.push('No measurable pre-break range.');return {direction,failures,evidence:[]};}

  const tgt=target(candles,direction,entry,confirm.index,rangeHeight,layers);
  if(!tgt){failures.push('No meaningful continuation target.');return {direction,failures,evidence:[]};}
  const reward=Math.abs(tgt.price-entry),rr=reward/risk;
  if(!(reward>0)){failures.push('Continuation target is not beyond entry.');return {direction,failures,evidence:[{type:'BREAKOUT',...br},{type:'RETEST_HOLD',...rt},{type:'CONTINUATION',...confirm},{type:'TARGET',...tgt,rr}]};}

  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const orderType=executionOrderType({direction,entry,price:Number(price),tolerance});
  if(!orderType){failures.push('Live price is no longer executable at the broken structural level.');return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...selectedLevel},{type:'RETEST_HOLD',...rt},{type:'CONTINUATION',...confirm}]};}
  const grade=gradeSetup({
    strategy:'BREAKOUT',
    context:{aligned:true,trend:layers.at(-1)?.structure?.direction===direction},
    entry:{anchorQuality:1,executionQuality:1},
    risk:{invalidationQuality:1,geometryQuality:1},
    target:{...tgt,rr},
    confirmation:{quality:Math.min(1,.55+Math.min(1,br.atrMultiple/1.5)*.25+.2)},
    freshness:{quality:1}
  });
  return {
    direction,
    tradeReady:true,
    grade,
    trade:{
      entry,
      marketEntry:Number(price),
      stop,
      entryZone:{low:selectedLevel.level-rt.zone,high:selectedLevel.level+rt.zone,source:'BREAKOUT_RETEST_LEVEL'},
      invalidationPrice,
      target:tgt.price,
      risk,
      reward,
      rr,
      orderType,
      entryReason:'A multi-touch structural level broke decisively, held on retest, and the continuation confirmed the broken level as the structural entry.',
      invalidation:invalidationPrice,
      invalidationSource:'breakout_retest_structural_level',
      targetSource:tgt.source||'EXTERNAL_STRUCTURAL_TARGET'
    },
    orderType,entry,stopLoss:stop,takeProfit1:tgt.price,rr,failures:[],
    evidence:[
      ...grade.confidenceEvidence,
      {type:'HTF_ALIGNMENT',direction},
      {type:'BREAKOUT_LEVEL',...selectedLevel},
      {type:'BREAKOUT',...br},
      {type:'RETEST_HOLD',...rt},
      {type:'CONTINUATION',...confirm},
      {type:'TARGET',...tgt}
    ],
    breakoutRetest:{model:BREAKOUT_MODEL,direction,level:selectedLevel,breakout:br,retest:rt,confirmation:confirm,target:tgt}
  };
}
