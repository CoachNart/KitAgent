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
 const a=atr(c,14)||Math.max(Math.abs(entry)*0.001,1e-9);
 // The structural level is the invalidation reference, not the exact stop price.
 // Place the stop beyond that swing/zone by a volatility buffer so normal wick
 // noise does not invalidate the thesis. Never tighten the stop to make RR pass.
 const buffer=Math.max(a*0.25,Math.abs(entry)*0.0006);
 const stop=directionLong?inv-buffer:inv+buffer;
 const risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=reward/risk;
 const minimumRisk=Math.max(a*0.5,Math.abs(entry)*0.0015);
 if(!(risk>=minimumRisk&&reward>0&&rr>=2))return null;
 return {entry,stop,target,risk,reward,rr,invalidation:inv,targetLevel:target,stopBuffer:buffer};
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
