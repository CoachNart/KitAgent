import {atr} from './data.js';
import {confirmedSwings} from './structure.js';
function equalPools(c,asOf=c.length-1){
 const s=confirmedSwings(c,2),out=[];
 const close=c[asOf]?.close;
 if(!Number.isFinite(close))return out;
 const a=atr(c.slice(0,asOf+1),14)||close*.002;
 const tol=Math.max(a*.18,close*.0005);
 for(const side of ['highs','lows']){
  const swings=s[side]
   .filter(x=>x.confirmationIndex<=asOf)
   .slice()
   .sort((x,y)=>x.price-y.price||x.index-y.index);
  // Adjacent price-sorted pairs represent the same equal-level evidence as
  // the old all-pairs scan without emitting every combination in a crowded
  // cluster. This bounds work and prevents one liquidity pool from producing
  // a quadratic number of duplicate target candidates.
  for(let i=1;i<swings.length;i++){
   const a=swings[i-1],b=swings[i];
   if(Math.abs(a.price-b.price)>tol)continue;
   const [first,second]=a.index<=b.index?[a,b]:[b,a];
   const confirmationIndex=Math.max(first.confirmationIndex,second.confirmationIndex);
   out.push({
    type:side==='highs'?'EQUAL_HIGHS':'EQUAL_LOWS',
    level:(a.price+b.price)/2,
    first:first.index,second:second.index,
    confirmationIndex,time:c[confirmationIndex]?.time??null,
    age:asOf-second.index
   });
  }
 }
 return out;
}
export function liquidityMap(c,asOf=c.length-1){
 const s=confirmedSwings(c,2), highs=s.highs.filter(x=>x.confirmationIndex<=asOf),lows=s.lows.filter(x=>x.confirmationIndex<=asOf),x=c[asOf],a=atr(c.slice(0,asOf+1),14)||Math.max(x.close*.001,1e-9);
 const pools=[...poolsFor(highs,'high'),...poolsFor(lows,'low'),...equalPools(c,asOf)];
 const recentSweep=[];
 for(const p of [...highs.map(q=>({...q,side:'BUY_SIDE'})),...lows.map(q=>({...q,side:'SELL_SIDE'}))].slice(-30)){
  for(let i=p.confirmationIndex;i<=asOf;i++){
   const k=c[i];
   const swept=p.side==='BUY_SIDE'?k.high>p.price:k.low<p.price;
   const reclaimed=p.side==='BUY_SIDE'?k.close<p.price:k.close>p.price;
   if(swept&&reclaimed){
    const extreme=p.side==='BUY_SIDE'?k.high:k.low;
    const later=c.slice(i+1,asOf+1);
    const stillValid=later.every(z=>p.side==='BUY_SIDE'?z.high<=extreme:z.low>=extreme);
    if(stillValid)recentSweep.push({side:p.side,level:p.price,extreme,index:i,age:asOf-i});
   }
  }
 }
 recentSweep.sort((a,b)=>a.age-b.age);
 return {buySide:highs.slice(-8).map(x=>x.price),sellSide:lows.slice(-8).map(x=>x.price),pools,recentSweep,a};
}
function poolsFor(arr,side){return arr.slice(-10).map(x=>({type:side==='high'?'SWING_HIGH':'SWING_LOW',level:x.price,index:x.index,confirmationIndex:x.confirmationIndex,time:x.time,age:x.confirmationIndex}));}
export function latestSweep(map,direction,maxAge=6){return map.recentSweep.find(x=>x.age<=maxAge&&(direction==='BULLISH'?x.side==='SELL_SIDE':x.side==='BUY_SIDE'))||null;}
