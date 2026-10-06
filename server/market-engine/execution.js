import {atr} from './data.js';
import {nearestTarget,keyLevels} from './levels.js';

export function tradeGeometry(c,direction,entryHint,preferredTarget=null,preferredInvalidation=null){
 const directionLong=direction==='BULLISH';
 const entry=Number.isFinite(entryHint)?entryHint:c.at(-1).close;
 const inv=Number.isFinite(preferredInvalidation)?preferredInvalidation:null;
 let target=Number.isFinite(preferredTarget)?preferredTarget:nearestTarget(c,direction,entry)?.level;
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
 const risk=Math.abs(entry-stop);
 const minimumRisk=Math.max(a*0.35,Math.abs(entry)*0.0015);
 // A structural stop must have meaningful room from the entry. If the protected
 // swing is effectively at the entry, the setup is invalid rather than tightened.
 if(!(risk>=minimumRisk))return null;
 let reward=Math.abs(target-entry),rr=risk>0?reward/risk:0;
 // If the nearest structural target is too close to justify the risk,
 // advance to the next meaningful level rather than throwing away the thesis.
 if(!(reward>0&&rr>=2)){
   const alternatives=keyLevels(c)
     .map(x=>x.level)
     .filter(level=>directionLong?level>entry:level<entry)
     .sort((a,b)=>Math.abs(a-entry)-Math.abs(b-entry));
   const viable=alternatives.find(level=>Math.abs(level-entry)/risk>=2);
   if(Number.isFinite(viable)){
     target=viable;
     reward=Math.abs(target-entry);
     rr=reward/risk;
   }
 }
 if(!(reward>0&&rr>=2))return null;
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
