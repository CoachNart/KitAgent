import {atr} from './data.js';
import {keyLevels,nearestTarget,nearestInvalidation} from './levels.js';
export function tradeGeometry(c,direction,entryHint,preferredTarget=null,preferredInvalidation=null){
 const a=atr(c);if(!a)return null;
 const directionLong=direction==='BULLISH';
 const entry=Number.isFinite(entryHint)?entryHint:c.at(-1).close;
 const inv=Number.isFinite(preferredInvalidation)?preferredInvalidation:nearestInvalidation(c,direction,entry)?.level;
 const target=Number.isFinite(preferredTarget)?preferredTarget:nearestTarget(c,direction,entry)?.level;
 if(!Number.isFinite(inv)||!Number.isFinite(target))return null;
 // Directional trade geometry is a hard invariant: LONG stops must be below entry and targets above; SHORT is the inverse.
 if(directionLong ? !(inv < entry && target > entry) : !(inv > entry && target < entry))return null;
 const buffer=Math.max(a*.22,entry*.0004),stop=directionLong?inv-buffer:inv+buffer,risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=reward/risk;
 if(directionLong ? !(stop < entry && target > entry) : !(stop > entry && target < entry))return null;
 if(!(risk>=a*.45&&risk<=a*3.8&&reward>=a*1.1&&rr>=2))return null;
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
 const p=c.at(-1)?.close;return Number.isFinite(p)&&Number.isFinite(stop)&&(direction==='BULLISH'?p>stop:p<stop);
}
