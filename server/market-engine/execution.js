import {atr} from './data.js';
import {nearestTarget} from './levels.js';

export function tradeGeometry(c,direction,entryHint,preferredTarget=null,preferredInvalidation=null){
 const directionLong=direction==='BULLISH';
 const entry=Number.isFinite(entryHint)?entryHint:c.at(-1).close;
 const inv=Number.isFinite(preferredInvalidation)?preferredInvalidation:null;
 const target=Number.isFinite(preferredTarget)?preferredTarget:nearestTarget(c,direction,entry)?.level;
 // A trade is only executable when its stop is tied to an explicit market-structure
 // invalidation supplied by the strategy. Never substitute the nearest swing just
 // to manufacture a risk distance.
 if(!Number.isFinite(inv)||!Number.isFinite(target))return null;
 if(directionLong ? !(inv < entry && target > entry) : !(inv > entry && target < entry))return null;
 const stop=inv;
 const risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=reward/risk;
 if(!(risk>0&&reward>0&&rr>=2))return null;
 return {entry,stop,target,risk,reward,rr,invalidation:inv,targetLevel:target};
}

export function executionConfirmation(c,direction){
 const x=c.at(-1),p=c.at(-2),a=atr(c);if(!x||!p||!a)return null;
 const long=direction==='BULLISH',body=Math.abs(x.close-x.open),r=x.high-x.low;
 const displacement=r>=a*1.15&&body/r>=.55&&(long?x.close>x.open:x.close<x.open);
 const continuation=long?x.close>p.high:x.close<p.low;
 return {displacement,continuation,confirmed:displacement&&continuation};
}

export function invalidationTest(c,direction,stop){
 const p=c.at(-1)?.close;
 return Number.isFinite(p)&&Number.isFinite(stop)&&(direction==='BULLISH'?p>stop:p<stop);
}
