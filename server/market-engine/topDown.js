import {atr,bodyRatio} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';
import {gradeSetup} from './grading.js';

export const TOP_DOWN_MODEL='HTF_ALIGNMENT_EXECUTION_BOS_RETEST';

export function topDownMinimumTargetDistance(c,afterIndex,entry){
  // Historical setup geometry must use volatility available at the event time;
  // later candles must not make a past target appear too close or too far.
  const history=c.slice(0,Math.min(c.length,Math.max(0,Math.floor(afterIndex)+1)));
  const a=atr(history,14)||0;
  return Math.max(a*1.5,Math.abs(entry)*.005);
}

function nextTarget(c,direction,afterIndex,entry,layers=[]){
  const minDistance=topDownMinimumTargetDistance(c,afterIndex,entry);
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
  // A BOS is the FIRST close beyond a confirmed swing after that swing
  // becomes available. Using the latest close makes the "BOS" candle itself
  // the final continuation candle, so no later candle can retest and hold the
  // level without becoming a newer BOS; that made valid retests impossible.
  // The segment tree finds the first qualifying close in O(log n).
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
  function firstBreak(node,left,right,from,threshold){
    if(right<from)return -1;
    const extreme=tree[node];
    if(bullish?extreme<=threshold:extreme>=threshold)return -1;
    if(left===right)return left<c.length?left:-1;
    const mid=(left+right)>>>1;
    const found=firstBreak(node*2,left,mid,from,threshold);
    return found>=0?found:firstBreak(node*2+1,mid+1,right,from,threshold);
  }
  const events=[];
  for(const sw of swings){
    const index=firstBreak(1,0,size-1,sw.confirmationIndex+1,sw.price);
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
    // Suffix extrema establish that a breach exists, but binary-searching
    // them locates the LAST breach, not the first. Find the first candle whose
    // close actually invalidated the BOS so chronology diagnostics are honest.
    let index=-1;
    for(let i=from;i<c.length;i++){
      const close=Number(c[i]?.close);
      if(!Number.isFinite(close))continue;
      const breached=direction==='BULLISH'?close<bos.level:close>bos.level;
      if(breached){index=i;break;}
    }
    const x=c[index];
    if(index>=from&&x&&[x.open,x.high,x.low,x.close].every(Number.isFinite)){
      // Diagnostic only: determine whether a valid retest happened before the
      // later invalidation. The setup remains rejected either way.
      let retestBeforeFailure=null;
      for(let i=from;i<index;i++){
        const candle=c[i];
        if(!candle||![candle.open,candle.high,candle.low,candle.close].every(Number.isFinite))continue;
        const touched=direction==='BULLISH'?candle.low<=bos.level&&candle.high>=bos.level:candle.high>=bos.level&&candle.low<=bos.level;
        const held=direction==='BULLISH'?candle.close>bos.level:candle.close<bos.level;
        if(touched&&held&&bodyRatio(candle)>=.35){
          retestBeforeFailure={index:i,age:c.length-1-i};
          break;
        }
      }
      return {failed:true,index,level:bos.level,close:x.close,retestBeforeFailure};
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

export function topDownPriceSideEligible({direction,entry,price,tolerance}){
  if(!['BULLISH','BEARISH'].includes(direction)||![entry,price,tolerance].every(Number.isFinite))return false;
  return direction==='BULLISH'?price>=entry-tolerance:price<=entry+tolerance;
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

export function topDownStopBuffer(c,retestIndex,entry){
  const history=c.slice(0,Math.min(c.length,Math.max(0,Math.floor(retestIndex)+1)));
  const a=atr(history,14)||0;
  return Math.max(a*.12,Math.abs(entry)*.00025);
}

function trade({c,bos,retestPoint,direction,price,targetSwing}){
  const a=atr(c.slice(0,retestPoint.index+1),14);
  if(!a)return null;
  const entry=bos.level;
  const stopSwing=structuralStop(c,retestPoint,direction);
  if(!stopSwing)return null;
  const buffer=topDownStopBuffer(c,retestPoint.index,entry);
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
  const bosStarted=Date.now();
  const bosCandidates=executionBOS(c,direction);
  const bosMs=Date.now()-bosStarted;
  if(!bosCandidates.length)return{direction,failures:['Execution timeframe has not confirmed a BOS in the higher-timeframe direction.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'TOP_DOWN_REJECTION_DIAGNOSTICS',bosCandidates:0,bosMs}]};
  const a=atr(c,14);
  if(!Number.isFinite(price)||price<=0||!a)return{direction,failures:['Live price or execution volatility is unavailable.'],evidence:[]};
  let selected=null;
  const diagnostics={bosCandidates:bosCandidates.length,bosMs,distanceEligible:0,retestFound:0,retestInvalidated:0,retestBeforeInvalidation:0,recentRetestBeforeInvalidation:0,retestBeforeInvalidationSamples:[],noRetest:0,staleRetest:0,retestMs:0,recentRetest:0,targetFound:0,tradeConstructed:0,scoreAtLeast78:0};
  const closeExtrema=retestCloseExtrema(c);
  for(const bos of bosCandidates.slice().reverse()){
    const entry=bos.level,tolerance=Math.max(a*.35,Math.abs(entry)*.0015),distance=Math.abs(price-entry);
    // A completed retest can leave price well away from the level while the
    // retest limit is still unfilled. Only reject price on the wrong side of
    // the planned entry; distance alone must not suppress a valid pending limit.
    if(!topDownPriceSideEligible({direction,entry,price,tolerance}))continue;
    diagnostics.distanceEligible++;
    const retestStarted=Date.now();
    const rt=findValidRetest(c,bos,direction,closeExtrema);
    diagnostics.retestMs+=Date.now()-retestStarted;
    if(rt?.failed){
      diagnostics.retestInvalidated++;
      if(rt.retestBeforeFailure){
        diagnostics.retestBeforeInvalidation++;
        if(rt.retestBeforeFailure.age<=4)diagnostics.recentRetestBeforeInvalidation++;
        if(diagnostics.retestBeforeInvalidationSamples.length<5){
          diagnostics.retestBeforeInvalidationSamples.push({
            bosIndex:bos.index,
            bosAge:bos.age,
            bosLevel:bos.level,
            retestIndex:rt.retestBeforeFailure.index,
            retestAge:rt.retestBeforeFailure.age,
            invalidationIndex:rt.index,
            invalidationAge:c.length-1-rt.index,
            invalidationClose:rt.close
          });
        }
      }
      continue;
    }
    if(!rt){diagnostics.noRetest++;continue;}
    diagnostics.retestFound++;
    if(rt.age>4){diagnostics.staleRetest++;continue;}
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
