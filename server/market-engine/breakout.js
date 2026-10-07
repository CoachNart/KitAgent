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
  const dirs=layers.map(x=>x?.structure?.direction).filter(validDir);
  if(!dirs.length||dirs.some(d=>d!==dirs[0]))return null;
  return dirs[0];
}

function levelCluster(c,direction){
  const s=confirmedSwings(c,2);
  const points=direction==='BULLISH'?s.highs:s.lows;
  if(points.length<2)return null;
  const a=atr(c,14);
  if(!a)return null;
  const recent=points.slice(-8);
  const latest=recent.at(-1);
  const tolerance=a*.35;
  const cluster=recent.filter(x=>Math.abs(x.price-latest.price)<=tolerance);
  if(cluster.length<2)return null;
  const level=cluster.reduce((sum,x)=>sum+x.price,0)/cluster.length;
  return {
    direction,
    level,
    touches:cluster.map(x=>({index:x.index,price:x.price,confirmationIndex:x.confirmationIndex})),
    tolerance
  };
}

function breakout(c,level,direction){
  const a=atr(c,14),avg=rangeAverage(c,20);
  if(!a||!avg)return null;
  for(let i=c.length-1;i>=Math.max(1,c.length-12);i--){
    const x=c[i],r=x.high-x.low;
    const body=bodyRatio(x);
    const directional=direction==='BULLISH'?x.close>level&&x.close>x.open:x.close<level&&x.close<x.open;
    if(!directional||body<.55||r<a||r<avg*1.15)continue;
    const volumeAvg=c.slice(Math.max(0,i-20),i).map(k=>k.volume).filter(v=>Number.isFinite(v)&&v>0);
    if(volumeAvg.length>=5){
      const av=volumeAvg.reduce((s,v)=>s+v,0)/volumeAvg.length;
      if(!(x.volume>=av*1.1))continue;
    }
    return {index:i,candle:x,level,bodyRatio:body,range:r,atrMultiple:r/a};
  }
  return null;
}

function retest(c,br,direction){
  const maxIndex=Math.min(c.length-1,br.index+8);
  const a=atr(c,14)||Math.max(Math.abs(br.level)*.001,1e-9);
  const zone=a*.15;
  for(let i=br.index+1;i<=maxIndex;i++){
    const x=c[i];
    const touched=direction==='BULLISH'
      ? x.low<=br.level+zone && x.high>=br.level-zone
      : x.high>=br.level-zone && x.low<=br.level+zone;
    if(!touched)continue;
    const held=direction==='BULLISH'?x.close>br.level:x.close<br.level;
    if(!held)return {failed:true,index:i,candle:x};
    return {index:i,candle:x,zone,held:true};
  }
  return null;
}

function continuation(c,rt,direction){
  if(!rt||rt.failed)return null;
  for(let i=rt.index+1;i<c.length;i++){
    const x=c[i];
    const holds=direction==='BULLISH'?x.close>rt.candle.high:x.close<rt.candle.low;
    if(holds){
      return {index:i,candle:x,type:'RETEST_CONTINUATION',level:direction==='BULLISH'?rt.candle.high:rt.candle.low};
    }
    const failed=direction==='BULLISH'?x.close<=rt.candle.low:x.close>=rt.candle.high;
    if(failed)return null;
  }
  return null;
}

function target(c,direction,entry,after,rangeHeight,layers=[]){
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005,rangeHeight*.75);
  return selectStructuralTarget(c,direction,entry,{layers,minDistance});
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

  const br=breakout(candles,level.level,direction);
  if(!br){
    failures.push('No decisive closed breakout beyond the defined level.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level}]};
  }

  const rt=retest(candles,br,direction);
  if(!rt){
    failures.push('Breakout has not produced a timely retest.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level},{type:'BREAKOUT',...br}]};
  }
  if(rt.failed){
    failures.push('Retest closed back through the broken level; breakout invalidated.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level},{type:'BREAKOUT',...br},{type:'RETEST_FAILURE',...rt}]};
  }

  const confirm=continuation(candles,rt,direction);
  if(!confirm){
    failures.push('Retest held but has no closed continuation confirmation.');
    return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level},{type:'BREAKOUT',...br},{type:'RETEST_HOLD',...rt}]};
  }

  const entry=level.level;
  const a=atr(candles,14)||Math.max(Math.abs(entry)*.001,1e-9);
  const stop=direction==='BULLISH'
    ?Math.min(rt.candle.low,level.level)-a*.25
    :Math.max(rt.candle.high,level.level)+a*.25;
  const risk=Math.abs(entry-stop);
  if(!(risk>0)){failures.push('Invalid structural risk.');return {direction,failures,evidence:[]};}

  const oppositePoints=direction==='BULLISH'?confirmedSwings(candles,2).lows:confirmedSwings(candles,2).highs;
  const opposite=oppositePoints.filter(x=>x.index<level.touches[0].index);
  const rangeBoundary=direction==='BULLISH'
    ?Math.min(...opposite.map(x=>x.price),level.level-a)
    :Math.max(...opposite.map(x=>x.price),level.level+a);
  const rangeHeight=Math.abs(level.level-rangeBoundary);
  if(!(rangeHeight>0)){failures.push('No measurable pre-break range.');return {direction,failures,evidence:[]};}

  const tgt=target(candles,direction,entry,confirm.index,rangeHeight,layers);
  if(!tgt){failures.push('No meaningful continuation target.');return {direction,failures,evidence:[]};}
  const reward=Math.abs(tgt.price-entry),rr=reward/risk;
  if(!(reward>0)){failures.push('Continuation target is not beyond entry.');return {direction,failures,evidence:[{type:'BREAKOUT',...br},{type:'RETEST_HOLD',...rt},{type:'CONTINUATION',...confirm},{type:'TARGET',...tgt,rr}]};}

  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const orderType=executionOrderType({direction,entry,price:Number(price),tolerance});
  if(!orderType){failures.push('Live price is no longer executable at the broken structural level.');return {direction,failures,evidence:[{type:'BREAKOUT_LEVEL',...level},{type:'RETEST_HOLD',...rt},{type:'CONTINUATION',...confirm}]};}
  const grade=gradeSetup({
    strategy:'BREAKOUT',
    context:{aligned:true,trend:layers.at(-1)?.structure?.state?.startsWith('TRENDING_')},
    entry:{anchorQuality:1,executionQuality:1},
    risk:{invalidationQuality:1,geometryQuality:1},
    target:tgt,
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
      target:tgt.price,
      risk,
      reward,
      rr,
      orderType,
      entryReason:'A multi-touch structural level broke decisively, held on retest, and the continuation confirmed the broken level as the structural entry.',
      invalidation:direction==='BULLISH'?rt.candle.low:rt.candle.high,
      invalidationSource:'breakout_retest_structural_level',
      targetSource:tgt.source||'EXTERNAL_STRUCTURAL_TARGET'
    },
    orderType,entry,stopLoss:stop,takeProfit1:tgt.price,rr,failures:[],
    evidence:[
      ...grade.confidenceEvidence,
      {type:'HTF_ALIGNMENT',direction},
      {type:'BREAKOUT_LEVEL',...level},
      {type:'BREAKOUT',...br},
      {type:'RETEST_HOLD',...rt},
      {type:'CONTINUATION',...confirm},
      {type:'TARGET',...tgt}
    ],
    breakoutRetest:{model:BREAKOUT_MODEL,direction,level,breakout:br,retest:rt,confirmation:confirm,target:tgt}
  };
}
