import {atr,bodyRatio} from './data.js';
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
  if(!swings.length||!c.length)return [];
  // Build a range-extrema tree once, then find each swing's latest qualifying
  // close in O(log n). This preserves the original backward scan's exact
  // "most recent close beyond this swing after confirmation" semantics.
  const size=1<<Math.ceil(Math.log2(c.length));
  const tree=new Float64Array(size*2);
  const bullish=direction==='BULLISH';
  const neutral=bullish?-Infinity:Infinity;
  tree.fill(neutral);
  for(let i=0;i<c.length;i++){
    const close=Number(c[i]?.close);
    tree[size+i]=Number.isFinite(close)?close:neutral;
  }
  for(let i=size-1;i>0;i--){
    tree[i]=bullish?Math.max(tree[i*2],tree[i*2+1]):Math.min(tree[i*2],tree[i*2+1]);
  }
  function rightmostBreak(node,left,right,from,threshold){
    if(right<from)return -1;
    const extreme=tree[node];
    if(bullish?extreme<=threshold:extreme>=threshold)return -1;
    if(left===right)return left<c.length?left:-1;
    const mid=(left+right)>>>1;
    const found=rightmostBreak(node*2+1,mid+1,right,from,threshold);
    return found>=0?found:rightmostBreak(node*2,left,mid,from,threshold);
  }
  const events=[];
  for(const sw of swings.slice().reverse()){
    const index=rightmostBreak(1,0,size-1,sw.confirmationIndex+1,sw.price);
    if(index<0)continue;
    events.push({index,level:sw.price,swingIndex:sw.index,age:c.length-1-index});
  }
  return events.sort((a,b)=>a.index-b.index);
}

function retestCloseExtrema(c){
  const minClose=new Float64Array(c.length);
  const maxClose=new Float64Array(c.length);
  let min=Infinity,max=-Infinity;
  for(let i=c.length-1;i>=0;i--){
    const x=c[i];
    if(x&&[x.open,x.high,x.low,x.close].every(Number.isFinite)){
      min=Math.min(min,x.close);
      max=Math.max(max,x.close);
    }
    minClose[i]=min;
    maxClose[i]=max;
  }
  return {minClose,maxClose};
}

export function findValidRetest(c,bos,direction,closeExtrema=null){
  if(!Array.isArray(c)||!bos||!Number.isInteger(bos.index)||bos.index<0||bos.index>=c.length-1)return null;
  if(!['BULLISH','BEARISH'].includes(direction)||!Number.isFinite(bos.level))return null;
  const extrema=closeExtrema||retestCloseExtrema(c);
  const from=bos.index+1;
  const extreme=direction==='BULLISH'?extrema.minClose[from]:extrema.maxClose[from];
  const invalidated=direction==='BULLISH'?extreme<bos.level:extreme>bos.level;
  if(invalidated){
    // Suffix extrema are monotonic, so binary-search the earliest candle
    // that breached the BOS instead of rescanning the entire post-BOS range.
    let lo=from,hi=c.length;
    while(hi-lo>1){
      const mid=(lo+hi)>>>1;
      const suffixExtreme=direction==='BULLISH'?extrema.minClose[mid]:extrema.maxClose[mid];
      const breached=direction==='BULLISH'?suffixExtreme<bos.level:suffixExtreme>bos.level;
      if(breached)lo=mid;
      else hi=mid;
    }
    // The last suffix containing a breach starts at the first breach candle.
    const index=lo;
    const x=c[index];
    if(index>=from&&x&&[x.open,x.high,x.low,x.close].every(Number.isFinite)){
      return {failed:true,index,level:bos.level,close:x.close};
    }
  }
  for(let i=from;i<c.length;i++){
    const x=c[i];
    if(!x||![x.open,x.high,x.low,x.close].every(Number.isFinite))continue;
    const touched=direction==='BULLISH'?x.low<=bos.level&&x.high>=bos.level:x.high>=bos.level&&x.low<=bos.level;
    const held=direction==='BULLISH'?x.close>bos.level:x.close<bos.level;
    const ratio=bodyRatio(x);
    if(touched&&held&&ratio>=.35){
      return {index:i,price:bos.level,low:x.low,high:x.high,age:c.length-1-i,bodyRatio:ratio};
    }
  }
  return null;
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
    entryZone:{low:entry-tolerance,high:entry+tolerance,source:'BOS_RETEST_LEVEL'},
    invalidationPrice:stopSwing.price,
    entryReason:'HTF structure aligned; execution produced a confirmed BOS, price retested the broken structural level and held.',
    invalidation:'Beyond the confirmed structural swing that invalidates the continuation thesis, with a volatility buffer.',
    invalidationSource:'execution_structural_swing',
    targetSource:targetSwing.source||'external_confirmed_structural_swing',
    bosLevel:bos.level,bosIndex:bos.index,retestIndex:retestPoint.index,stopSwingIndex:stopSwing.index
  };
}

export function scoreSetup({layers,bos,retestPoint,price,entry,target,rr,candles,direction}){
  const a=atr(candles,14)||0;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const distance=Math.abs(price-entry);
  return gradeSetup({
    strategy:'TOP_DOWN',
    context:{aligned:!!htfBias(layers),trend:layers.at(-1)?.structure?.direction===direction},
    entry:{anchorQuality:1,executionQuality:distance<=tolerance?1:.75},
    risk:{invalidationQuality:1,geometryQuality:1},
    target:{...target,rr},
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
  const bosCandidates=executionBOS(c,direction);
  if(!bosCandidates.length)return{direction,failures:['Execution timeframe has not confirmed a BOS in the higher-timeframe direction.'],evidence:[{type:'HTF_ALIGNMENT',direction}]};
  const a=atr(c,14);
  if(!Number.isFinite(price)||price<=0||!a)return{direction,failures:['Live price or execution volatility is unavailable.'],evidence:[]};
  let selected=null;
  const diagnostics={bosCandidates:bosCandidates.length,distanceEligible:0,retestFound:0,recentRetest:0,targetFound:0,tradeConstructed:0,scoreAtLeast78:0};
  const closeExtrema=retestCloseExtrema(c);
  for(const bos of bosCandidates.slice().reverse()){
    const entry=bos.level,tolerance=Math.max(a*.35,Math.abs(entry)*.0015),distance=Math.abs(price-entry);
    if(distance>tolerance)continue;
    diagnostics.distanceEligible++;
    const rt=findValidRetest(c,bos,direction,closeExtrema);
    if(rt&&!rt.failed)diagnostics.retestFound++;
    if(!rt||rt.failed||rt.age>4)continue;
    diagnostics.recentRetest++;
    const targetSwing=nextTarget(c,direction,rt.index,entry,layers);
    if(!targetSwing||(direction==='BULLISH'?targetSwing.price<=entry:targetSwing.price>=entry))continue;
    diagnostics.targetFound++;
    const tradeResult=trade({c,bos,retestPoint:rt,direction,price,targetSwing});
    if(!tradeResult)continue;
    diagnostics.tradeConstructed++;
    const scored=scoreSetup({layers,bos,retestPoint:rt,price,entry,target:targetSwing,rr:tradeResult.rr,candles:c,direction});
    if(scored.score>=78)diagnostics.scoreAtLeast78++;
    selected={bos,rt,entry,targetSwing,tradeResult,scored};
    break;
  }
  if(!selected){
    return{direction,failures:['No recent execution BOS produced a complete retest, executable entry, and meaningful structural target.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'TOP_DOWN_REJECTION_DIAGNOSTICS',...diagnostics}]};
  }
  const {bos,rt,entry,targetSwing,tradeResult,scored}=selected;
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
