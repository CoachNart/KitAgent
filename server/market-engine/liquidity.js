import {atr} from './data.js';
import {confirmedSwings} from './structure.js';
function equalPools(c,asOf=c.length-1){
 const s=confirmedSwings(c,2),out=[];
 // The tolerance is identical for every swing pair at this asOf index.
 // Compute ATR once, rather than recalculating it inside the O(n^2) pair loop.
 const close=c[asOf]?.close;
 if(!Number.isFinite(close))return out;
 const a=atr(c.slice(0,asOf+1),14)||close*.002;
 const tol=Math.max(a*.18,close*.0005);
 for(const side of ['highs','lows']){
  const swings=s[side].filter(x=>x.confirmationIndex<=asOf);
  for(let i=0;i<swings.length;i++)for(let j=i+1;j<swings.length;j++){
   const x=swings[i],y=swings[j];
   if(Math.abs(x.price-y.price)<=tol)out.push({type:side==='highs'?'EQUAL_HIGHS':'EQUAL_LOWS',level:(x.price+y.price)/2,first:x.index,second:y.index,age:asOf-y.index});
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
function poolsFor(arr,side){return arr.slice(-10).map(x=>({type:side==='high'?'SWING_HIGH':'SWING_LOW',level:x.price,index:x.index,age:x.confirmationIndex}));}
export function latestSweep(map,direction,maxAge=6){return map.recentSweep.find(x=>x.age<=maxAge&&(direction==='BULLISH'?x.side==='SELL_SIDE':x.side==='BUY_SIDE'))||null;}
