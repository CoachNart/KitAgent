import {atr} from './data.js';
import {confirmedSwings} from './structure.js';

export const TOP_DOWN_MODEL='HTF_ALIGNMENT_EXECUTION_BOS_RETEST';

function nextTarget(c,direction,afterIndex,entry){
  const s=confirmedSwings(c,2);
  const xs=(direction==='BULLISH'?s.highs:s.lows)
    .filter(x=>x.confirmationIndex<=c.length-1&&x.index>afterIndex&&(direction==='BULLISH'?x.price>entry:x.price<entry));
  return xs.at(-1)||null;
}

function htfBias(layers){
  const dirs=(layers||[]).map(x=>x?.structure?.direction).filter(x=>x==='BULLISH'||x==='BEARISH');
  if(!dirs.length||dirs.some(x=>x!==dirs[0]))return null;
  return dirs[0];
}

function executionBOS(c,direction){
  const s=confirmedSwings(c,1);
  const swings=direction==='BULLISH'?s.highs:s.lows;
  for(const sw of swings.slice().reverse()){
    for(let i=c.length-1;i>sw.confirmationIndex;i--){
      if(direction==='BULLISH'&&c[i].close>sw.price)
        return{index:i,level:sw.price,swingIndex:sw.index,age:c.length-1-i};
      if(direction==='BEARISH'&&c[i].close<sw.price)
        return{index:i,level:sw.price,swingIndex:sw.index,age:c.length-1-i};
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
  if(direction==='BULLISH'){ if(price<entry&&!near)return null; return near?'MARKET':'LIMIT'; }
  if(direction==='BEARISH'){ if(price>entry&&!near)return null; return near?'MARKET':'LIMIT'; }
  return null;
}

function structuralStop(c,retestPoint,direction){
  const s=confirmedSwings(c,2);
  if(direction==='BULLISH'){
    const lows=s.lows.filter(x=>x.confirmationIndex<=retestPoint.index&&x.index<retestPoint.index);
    return lows.at(-1)||null;
  }
  const highs=s.highs.filter(x=>x.confirmationIndex<=retestPoint.index&&x.index<retestPoint.index);
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
  const rr=reward/risk;

  if(!(risk>0&&reward>0&&rr>=2))return null;

  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const orderType=executionOrderType({direction,entry,price,tolerance});
  if(!orderType)return null;

  return{
    entry,
    marketEntry:price,
    stop,
    target:targetSwing.price,
    rr,
    orderType,
    entryReason:'HTF direction aligned with a fresh execution BOS; the broken structure level was retested and held.',
    invalidation:'Beyond the latest confirmed execution swing that defines the retest structure, with a volatility buffer.',
    invalidationSource:'execution_structural_swing',
    bosLevel:bos.level,
    bosIndex:bos.index,
    retestIndex:retestPoint.index,
    stopSwingIndex:stopSwing.index
  };
}

function scoreSetup({layers,bos,retestPoint,price,entry,target,rr,candles}){
  const a=atr(candles,14)||0;
  const ageBos=bos.age;
  const ageRetest=retestPoint.age;
  const distance=Math.abs(price-entry);
  const nearTolerance=Math.max(a*.35,Math.abs(entry)*.0015);

  let score=0;
  const evidence=[];

  // Each score component is tied to an observable structural condition.
  score+=20;
  evidence.push({type:'HTF_ALIGNMENT',direction:htfBias(layers),timeframes:layers.map(x=>x.tf),score:20});

  if(ageBos<=3){score+=16;evidence.push({type:'FRESH_BOS',age:ageBos,score:16});}
  else if(ageBos<=6){score+=9;evidence.push({type:'RECENT_BOS',age:ageBos,score:9});}
  else evidence.push({type:'STALE_BOS',age:ageBos,score:0});

  if(ageRetest<=2){score+=16;evidence.push({type:'FRESH_RETEST',age:ageRetest,score:16});}
  else if(ageRetest<=4){score+=9;evidence.push({type:'RECENT_RETEST',age:ageRetest,score:9});}
  else evidence.push({type:'STALE_RETEST',age:ageRetest,score:0});

  if(distance<=nearTolerance){score+=14;evidence.push({type:'PRICE_AT_RETEST',distance,tolerance:nearTolerance,score:14});}
  else evidence.push({type:'PRICE_AWAY_FROM_RETEST',distance,tolerance:nearTolerance,score:0});

  if(rr>=3){score+=14;evidence.push({type:'STRUCTURAL_TARGET',target,rr,score:14});}
  else if(rr>=2.5){score+=9;evidence.push({type:'STRUCTURAL_TARGET',target,rr,score:9});}
  else {score+=5;evidence.push({type:'STRUCTURAL_TARGET',target,rr,score:5});}

  const execState=layers.at(-1)?.structure?.state||'';
  if(execState.startsWith('TRENDING_')){score+=10;evidence.push({type:'TRENDING_EXECUTION_STATE',state:execState,score:10});}

  return{score,evidence};
}

export function evaluateTopDown({candles,layers,price}){
  const c=candles||[],failures=[];
  if(c.length<40)return{direction:'NEUTRAL',failures:['Insufficient execution candles for Top-Down.'],evidence:[]};

  const direction=htfBias(layers);
  if(!direction)return{direction:'NEUTRAL',failures:['Higher-timeframe layers do not agree on a directional bias.'],evidence:[]};

  const bos=executionBOS(c,direction);
  if(!bos)return{direction,failures:['Execution timeframe has not confirmed a BOS in the higher-timeframe direction.'],evidence:[{type:'HTF_ALIGNMENT',direction}]};

  const rt=retest(c,bos,direction);
  if(!rt)return{direction,failures:['Execution BOS has not produced a valid retest-and-hold.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos}]};

  const a=atr(c,14);
  if(!Number.isFinite(price)||price<=0||!a)return{direction,failures:['Live price or execution volatility is unavailable.'],evidence:[]};

  // A setup is only actionable while the market is still interacting with the
  // retest level. An old retest cannot become a fresh MARKET trade later.
  const entry=bos.level;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const distance=Math.abs(price-entry);
  if(rt.age>4)return{direction,failures:['The BOS retest is stale; a later price revisit is required.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  if(distance>tolerance)return{direction,failures:['Live price is no longer at the confirmed BOS retest level.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};

  const targetSwing=nextTarget(c,direction,rt.index,entry);
  if(!targetSwing||(direction==='BULLISH'?targetSwing.price<=entry:targetSwing.price>=entry))
    return{direction,failures:['No meaningful continuation target is available beyond the retest.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};

  const tradeResult=trade({c,bos,retestPoint:rt,direction,price,targetSwing});
  if(!tradeResult)return{direction,failures:['The structural invalidation does not provide at least 2R to the next meaningful target.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt},{type:'TARGET',price:targetSwing.price}]};

  const scored=scoreSetup({layers,bos,retestPoint:rt,price,entry,target:targetSwing.price,rr:tradeResult.rr,candles:c});
  if(scored.score<78)return{direction,grade:{grade:'NO-TRADE',score:scored.score,hardFailures:['Top-Down confluence is insufficient for execution.']},failures:['Top-Down confluence is insufficient for execution.'],evidence:scored.evidence};

  return{
    direction,
    grade:{grade:scored.score>=88?'A+':'A',score:scored.score,hardFailures:[]},
    failures:[],
    trade:tradeResult,
    evidence:[...scored.evidence,{type:'TARGET',price:targetSwing.price}],
    topDown:{model:TOP_DOWN_MODEL,htfDirection:direction,executionBOS:bos,retest:rt,target:targetSwing.price,score:scored.score}
  };
}
