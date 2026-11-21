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
function buildCandleRangeIndex(c){
 let size=1;
 while(size<c.length)size*=2;
 const minLow=Array(size*2).fill(Infinity),maxHigh=Array(size*2).fill(-Infinity);
 for(let i=0;i<c.length;i++){
  minLow[size+i]=Number(c[i]?.low);
  maxHigh[size+i]=Number(c[i]?.high);
 }
 for(let i=size-1;i>0;i--){
  minLow[i]=Math.min(minLow[i*2],minLow[i*2+1]);
  maxHigh[i]=Math.max(maxHigh[i*2],maxHigh[i*2+1]);
 }
 function firstCross(tree,node,left,right,from,to,level,mode){
  if(right<from||left>to)return -1;
  if(mode==='BELOW'?tree[node]>=level:tree[node]<=level)return -1;
  if(left===right)return left<c.length?left:-1;
  const mid=(left+right)>>1;
  const first=firstCross(tree,node*2,left,mid,from,to,level,mode);
  return first>=0?first:firstCross(tree,node*2+1,mid+1,right,from,to,level,mode);
 }
 return{
  firstBelow:(from,to,level)=>from<=to?firstCross(minLow,1,0,size-1,from,to,level,'BELOW'):-1,
  firstAbove:(from,to,level)=>from<=to?firstCross(maxHigh,1,0,size-1,from,to,level,'ABOVE'):-1
 };
}

export function liquidityMap(c,asOf=c.length-1){
 const s=confirmedSwings(c,2), highs=s.highs.filter(x=>x.confirmationIndex<=asOf),lows=s.lows.filter(x=>x.confirmationIndex<=asOf),x=c[asOf],a=atr(c.slice(0,asOf+1),14)||Math.max(x.close*.001,1e-9);
 const pools=[...poolsFor(highs,'high'),...poolsFor(lows,'low'),...equalPools(c,asOf)];
 const recentSweep=[];
 const rangeIndex=buildCandleRangeIndex(c);
 const suffixMinLow=Array(asOf+2).fill(Infinity),suffixMaxHigh=Array(asOf+2).fill(-Infinity);
 for(let i=asOf;i>=0;i--){
  suffixMinLow[i]=Math.min(Number(c[i]?.low),suffixMinLow[i+1]);
  suffixMaxHigh[i]=Math.max(Number(c[i]?.high),suffixMaxHigh[i+1]);
 }
 for(const p of [...highs.map(q=>({...q,side:'BUY_SIDE'})),...lows.map(q=>({...q,side:'SELL_SIDE'}))].slice(-30)){
  let from=p.confirmationIndex;
  while(from<=asOf){
   const i=p.side==='BUY_SIDE'
    ?rangeIndex.firstAbove(from,asOf,p.price)
    :rangeIndex.firstBelow(from,asOf,p.price);
   if(i<0)break;
   const k=c[i],reclaimed=p.side==='BUY_SIDE'?k.close<p.price:k.close>p.price;
   if(reclaimed){
    const extreme=p.side==='BUY_SIDE'?k.high:k.low;
    const stillValid=p.side==='BUY_SIDE'
     ?suffixMaxHigh[i+1]<=extreme
     :suffixMinLow[i+1]>=extreme;
    if(stillValid)recentSweep.push({side:p.side,level:p.price,extreme,index:i,age:asOf-i});
   }
   from=i+1;
  }
 }
 recentSweep.sort((a,b)=>a.age-b.age);
 return {buySide:highs.slice(-8).map(x=>x.price),sellSide:lows.slice(-8).map(x=>x.price),pools,recentSweep,a};
}
function poolsFor(arr,side){return arr.slice(-10).map(x=>({type:side==='high'?'SWING_HIGH':'SWING_LOW',level:x.price,index:x.index,confirmationIndex:x.confirmationIndex,time:x.time,age:x.confirmationIndex}));}
export function latestSweep(map,direction,maxAge=6){return map.recentSweep.find(x=>x.age<=maxAge&&(direction==='BULLISH'?x.side==='SELL_SIDE':x.side==='BUY_SIDE'))||null;}
