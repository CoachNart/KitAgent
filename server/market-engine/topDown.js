import {atr} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const TOP_DOWN_MODEL='HTF_ALIGNMENT_EXECUTION_BOS_RETEST';

function nextTarget(c,direction,afterIndex,entry,layers=[]){
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005);
  return selectStructuralTarget(c,direction,entry,{layers,minDistance,asOf:afterIndex,asOfTime:c[afterIndex]?.time??null});
}
function htfBias(layers){
  const dirs=(layers||[]).slice(0,-1).map(x=>x?.structure?.direction).filter(x=>x==='BULLISH'||x==='BEARISH');
  if(!dirs.length)return null;
  // Neutral intermediate structure is not a directional conflict. The most
  // senior confirmed directional layer sets the bias; a genuinely opposing
  // confirmed layer still blocks the strategy.
  const bias=dirs[0];
  if(dirs.some(x=>x!==bias))return null;
  return bias;
}

function executionBOS(c,direction){
  const s=confirmedSwings(c,1);
  const swings=direction==='BULLISH'?s.highs:s.lows;
  for(const sw of swings.slice().reverse()){
    for(let i=c.length-1;i>sw.confirmationIndex;i--){
      if(direction==='BULLISH'&&c[i].close>sw.price)return{index:i,level:sw.price,swingIndex:sw.index,age:c.length-1-i};
      if(direction==='BEARISH'&&c[i].close<sw.price)return{index:i,level:sw.price,swingIndex:sw.index,age:c.length-1-i};
    }
  }
  return null;
}

function retest(c,bos,direction){
  const points=[];
  for(let i=bos.index+1;i<c.length;i++){
    const x=c[i];
    const touched=direction==='BULLISH'?x.low<=bos.level:x.high>=bos.level;
    const held=direction==='BULLISH'?x.close>bos.level:x.close<bos.level;
    if(touched&&held)points.push({index:i,price:bos.level,low:x.low,high:x.high,age:c.length-1-i});
  }
  return points.at(-1)||null;
}

export function executionOrderType({direction,entry,price,tolerance}){
  const gap=Math.abs(price-entry);
  const near=gap<=tolerance;
  if(direction==='BULLISH'){if(price<entry&&!near)return null;return near?'MARKET':'LIMIT';}
  if(direction==='BEARISH'){if(price>entry&&!near)return null;return near?'MARKET':'LIMIT';}
  return null;
}

function structuralStop(c,retestPoint,direction){
  const s=confirmedSwings(c,3);
  if(direction==='BULLISH'){
    const lows=s.lows.filter(x=>x.confirmationIndex<=retestPoint.index&&x.index<retestPoint.index&&x.price<retestPoint.price);
    return lows.at(-1)||null;
  }
  const highs=s.highs.filter(x=>x.confirmationIndex<=retestPoint.index&&x.index<retestPoint.index&&x.price>retestPoint.price);
  return highs.at(-1)||null;
}

function trade({c,bos,retestPoint,direction,price,targetSwing}){
  const a=atr(c,14);
  if(!a)return null;
  const entry=bos.level;
  const stopSwing=structuralStop(c,retestPoint,direction);
  if(!stopSwing)return null;
  const buffer=Math.max(a*.12,Math.abs(entry)*.00025);
  const stop=direction==='BULLISH'?stopSwing.price-buffer:stopSwing.price+buffer;
  const risk=Math.abs(entry-stop);
  const reward=Math.abs(targetSwing.price-entry);
  const rr=risk>0?reward/risk:0;
  if(!(risk>0&&reward>0))return null;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const orderType=executionOrderType({direction,entry,price,tolerance});
  if(!orderType)return null;
  return{
    entry,marketEntry:price,stop,target:targetSwing.price,risk,reward,rr,orderType,
    entryReason:'HTF structure aligned; execution produced a confirmed BOS, price retested the broken structural level and held.',
    invalidation:'Beyond the confirmed structural swing that invalidates the continuation thesis, with a volatility buffer.',
    invalidationSource:'execution_structural_swing',
    targetSource:targetSwing.source||'external_confirmed_structural_swing',
    bosLevel:bos.level,bosIndex:bos.index,retestIndex:retestPoint.index,stopSwingIndex:stopSwing.index
  };
}

function scoreSetup({layers,bos,retestPoint,price,entry,target,candles}){
  const a=atr(candles,14)||0;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const distance=Math.abs(price-entry);
  return gradeSetup({
    strategy:'TOP_DOWN',
    context:{aligned:!!htfBias(layers),trend:layers.at(-1)?.structure?.state?.startsWith('TRENDING_')},
    entry:{anchorQuality:1,executionQuality:distance<=tolerance?1:.75},
    risk:{invalidationQuality:1,geometryQuality:1},
    target,
    confirmation:{quality:Math.min(1,ageQuality(bos.age,2,5)*.55+ageQuality(retestPoint.age,1,4)*.45)},
    freshness:{quality:Math.min(ageQuality(bos.age,2,5),ageQuality(retestPoint.age,1,4))}
  });
}

function ageQuality(age,fresh,recent){
  if(!Number.isFinite(age))return 0;
  if(age<=fresh)return 1;
  if(age<=recent)return .7;
  if(age<=8)return .35;
  return 0;
}
export function evaluateTopDown({candles,layers,price}){
  const c=candles||[];
  if(c.length<40)return{direction:'NEUTRAL',failures:['Insufficient execution candles for Top-Down.'],evidence:[]};
  const direction=htfBias(layers);
  if(!direction)return{direction:'NEUTRAL',failures:['Higher-timeframe layers do not agree on a directional bias.'],evidence:[]};
  const bos=executionBOS(c,direction);
  if(!bos)return{direction,failures:['Execution timeframe has not confirmed a BOS in the higher-timeframe direction.'],evidence:[{type:'HTF_ALIGNMENT',direction}]};
  const rt=retest(c,bos,direction);
  if(!rt)return{direction,failures:['Execution BOS has not produced a valid retest-and-hold.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos}]};
  const a=atr(c,14);
  if(!Number.isFinite(price)||price<=0||!a)return{direction,failures:['Live price or execution volatility is unavailable.'],evidence:[]};
  const entry=bos.level,tolerance=Math.max(a*.35,Math.abs(entry)*.0015),distance=Math.abs(price-entry);
  if(rt.age>4)return{direction,failures:['The BOS retest is stale; a later price revisit is required.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  if(distance>tolerance)return{direction,failures:['Live price is no longer at the confirmed BOS retest level.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  const targetSwing=nextTarget(c,direction,rt.index,entry,layers);
  if(!targetSwing||(direction==='BULLISH'?targetSwing.price<=entry:targetSwing.price>=entry))
    return{direction,failures:['No meaningful continuation target is available beyond the retest.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  const tradeResult=trade({c,bos,retestPoint:rt,direction,price,targetSwing});
  if(!tradeResult)return{direction,failures:['Structural entry, invalidation, or meaningful target geometry is invalid.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt},{type:'TARGET',price:targetSwing.price}]};
  const scored=scoreSetup({layers,bos,retestPoint:rt,price,entry,target:targetSwing,candles:c});
  if(scored.score<78)return{direction,grade:{grade:'NO-TRADE',score:scored.score,hardFailures:['Top-Down confluence is insufficient for execution.']},failures:['Top-Down confluence is insufficient for execution.'],evidence:scored.evidence};
  return{
    direction,
    grade:{grade:scored.grade,score:scored.score,hardFailures:[]},
    failures:[],
    trade:tradeResult,
    evidence:[...scored.confidenceEvidence,{type:'TARGET',price:targetSwing.price}],
    topDown:{model:TOP_DOWN_MODEL,htfDirection:direction,executionBOS:bos,retest:rt,target:targetSwing.price,score:scored.score}
  };
}
