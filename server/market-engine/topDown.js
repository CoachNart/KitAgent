import {atr} from './data.js';
import {confirmedSwings} from './structure.js';

export const TOP_DOWN_MODEL='HTF_ALIGNMENT_EXECUTION_BOS_RETEST';

function nextTarget(c,direction,afterIndex,entry){
  const s=confirmedSwings(c,2),xs=(direction==='BULLISH'?s.highs:s.lows).filter(x=>x.index>afterIndex&& (direction==='BULLISH'?x.price>entry:x.price<entry));
  return xs.at(-1)||null;
}
function priorSwing(c,direction,idx){
  const s=confirmedSwings(c,2);
  const xs=(direction==='BULLISH'?s.highs:s.lows).filter(x=>x.index<idx);
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
    for(let i=sw.confirmationIndex+1;i<c.length;i++){
      if(direction==='BULLISH'&&c[i].close>sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
      if(direction==='BEARISH'&&c[i].close<sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
    }
  }
  return null;
}
function retest(c,bos,direction){
  for(let i=bos.index+1;i<c.length;i++){
    const x=c[i];
    const touched=direction==='BULLISH'?x.low<=bos.level:x.high>=bos.level;
    const held=direction==='BULLISH'?x.close>bos.level:x.close<bos.level;
    if(touched&&held)return{index:i,price:x.close,low:x.low,high:x.high};
  }
  return null;
}
function trade({c,bos,retestPoint,direction,price,targetSwing}){
  const a=atr(c,14)||Math.abs(price)*.001,buffer=Math.max(a*.2,Math.abs(price)*.0004);
  const stop=direction==='BULLISH'?retestPoint.low-buffer:retestPoint.high+buffer;
  const entry=retestPoint.price,risk=Math.abs(entry-stop),target=targetSwing.price,reward=Math.abs(target-entry),rr=reward/risk;
  if(!(risk>0&&reward>0&&rr>=2))return null;
  return{entry,marketEntry:price,stop,target,rr,orderType:price>=Math.min(entry,bos.level)&&price<=Math.max(entry,bos.level)?'MARKET':'LIMIT',
    entryReason:'Higher-timeframe direction aligned with an execution-timeframe BOS; price retested and held the broken structure level.',
    invalidation:'Beyond the execution retest candle extreme with volatility buffer.',
    invalidationSource:'execution_retest_extreme',bosLevel:bos.level,bosIndex:bos.index,retestIndex:retestPoint.index};
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
  if(!Number.isFinite(price)||price<=0)return{direction,failures:['Live price is unavailable.'],evidence:[]};
  const targetSwing=nextTarget(c,direction,bos.index,rt.price);
  if(!targetSwing||(direction==='BULLISH'?targetSwing.price<=rt.price:targetSwing.price>=rt.price)){
    return{direction,failures:['No meaningful continuation target is available beyond the retest.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  }
  const tradeResult=trade({c,bos,retestPoint:rt,direction,price,targetSwing});
  if(!tradeResult)return{direction,failures:['The aligned BOS/retest does not provide at least 2R to the next structural target.'],evidence:[{type:'HTF_ALIGNMENT',direction},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt}]};
  const score=86+(layers.length>=3?4:0)+(rt.index>=c.length-4?4:0);
  return{direction,grade:{grade:score>=92?'A+':'A',score,hardFailures:[]},failures:[],trade:tradeResult,
    evidence:[{type:'HTF_ALIGNMENT',direction,timeframes:(layers||[]).map(x=>x.tf)},{type:'EXECUTION_BOS',...bos},{type:'RETEST',...rt},{type:'TARGET',price:targetSwing.price}],
    topDown:{model:TOP_DOWN_MODEL,htfDirection:direction,executionBOS:bos,retest:rt,target:targetSwing.price}};
}
