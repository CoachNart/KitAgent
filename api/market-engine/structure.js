import {atr,bodyRatio,rangeAverage} from './data.js';
function pivot(c,i,k=2){
 if(i<k||i>=c.length-k)return null;
 let hi=true,lo=true;
 for(let j=1;j<=k;j++){hi&&=c[i].high>c[i-j].high&&c[i].high>=c[i+j].high;lo&&=c[i].low<c[i-j].low&&c[i].low<=c[i+j].low;}
 return {high:hi,low:lo};
}
export function confirmedSwings(c,k=2){
 const highs=[],lows=[];
 for(let i=k;i<c.length-k;i++){
  const p=pivot(c,i,k);if(!p)continue;
  const confirmationIndex=i+k;
  if(p.high)highs.push({price:c[i].high,index:i,confirmationIndex,time:c[i].time});
  if(p.low)lows.push({price:c[i].low,index:i,confirmationIndex,time:c[i].time});
 }
 return {highs,lows};
}
function lastBefore(a,asOf){return a.filter(x=>x.confirmationIndex<=asOf);}
export function structure(c,asOf=c.length-1){
 if(!Array.isArray(c)||c.length<20)return{state:'UNCLEAR',direction:'NEUTRAL',trend:'UNCLEAR',swings:{highs:[],lows:[]},bos:null,choch:null,mss:null,protectedHigh:null,protectedLow:null,range:null,compression:false,expansion:false};
 const s=confirmedSwings(c,2),highs=lastBefore(s.highs,asOf),lows=lastBefore(s.lows,asOf),lh=highs.at(-1),ph=highs.at(-2),ll=lows.at(-1),pl=lows.at(-2),price=c[asOf]?.close;
 if(!lh||!ph||!ll||!pl)return{state:'UNCLEAR',direction:'NEUTRAL',trend:'UNCLEAR',swings:{highs,lows},bos:null,choch:null,mss:null,protectedHigh:lh,protectedLow:ll,range:null,compression:false,expansion:false};
 const hh=lh.price>ph.price,hl=ll.price>pl.price,lowerHigh=lh.price<ph.price,lowerLow=ll.price<pl.price;
 let direction=hh&&hl?'BULLISH':lowerHigh&&lowerLow?'BEARISH':'NEUTRAL';
 const a=atr(c.slice(0,asOf+1),14)||Math.max(price*.001,1e-9),avg=rangeAverage(c.slice(0,asOf+1),20)||a;
 const events=[];
 for(const x of [...highs].reverse()){
  for(let i=x.confirmationIndex;i<=asOf;i++)if(c[i].close>x.price){events.push({type:'BOS',direction:'BULLISH',level:x.price,index:i,confirmationIndex:i,age:asOf-i});break;}
 }
 for(const x of [...lows].reverse()){
  for(let i=x.confirmationIndex;i<=asOf;i++)if(c[i].close<x.price){events.push({type:'BOS',direction:'BEARISH',level:x.price,index:i,confirmationIndex:i,age:asOf-i});break;}
 }
 events.sort((a,b)=>b.index-a.index);
 const last=events[0]||null,prev=events[1]||null;
 const choch=last&&prev&&last.direction!==prev.direction?last:null;
 const mss=last&&last.age<=8?last:null;
 const protectedLow=direction==='BULLISH'?lows.filter(x=>x.index<lh.index).at(-1)||ll:null;
 const protectedHigh=direction==='BEARISH'?highs.filter(x=>x.index<ll.index).at(-1)||lh:null;
 if(direction==='BULLISH'&&protectedLow&&price<protectedLow.price)direction='NEUTRAL';
 if(direction==='BEARISH'&&protectedHigh&&price>protectedHigh.price)direction='NEUTRAL';
 const recentRanges=c.slice(Math.max(0,asOf-9),asOf+1).map(x=>x.high-x.low),recent=recentRanges.length?recentRanges.reduce((a,b)=>a+b,0)/recentRanges.length:avg;
 const compression=recent<avg*.72,expansion=recent>avg*1.28;
 const state=direction==='BULLISH'?'TRENDING_BULLISH':direction==='BEARISH'?'TRENDING_BEARISH':(compression?'COMPRESSION':'RANGE_OR_TRANSITION');
 return {state,direction,trend:direction==='NEUTRAL'?'RANGE':direction,swings:{highs,lows},hh,hl,lowerHigh,lowerLow,bos:last,choch,mss,protectedHigh,protectedLow,range:{high:Math.max(...c.slice(Math.max(0,asOf-30),asOf+1).map(x=>x.high)),low:Math.min(...c.slice(Math.max(0,asOf-30),asOf+1).map(x=>x.low))},compression,expansion,atr:a};
}
export function displacement(c,direction,asOf=c.length-1){
 const a=atr(c.slice(0,asOf+1),14),avg=rangeAverage(c.slice(0,asOf+1),20);if(!a||!avg)return null;
 for(let i=asOf;i>=Math.max(1,asOf-10);i--){const x=c[i],r=x.high-x.low;if(r<avg*1.25||r<a||bodyRatio(x)<.55)continue;
  if(direction==='BULLISH'&&x.close>x.open&&x.close>=x.high-r*.22)return{index:i,range:r,body:Math.abs(x.close-x.open),atrMultiple:r/a};
  if(direction==='BEARISH'&&x.close<x.open&&x.close<=x.low+r*.22)return{index:i,range:r,body:Math.abs(x.close-x.open),atrMultiple:r/a};
 }
 return null;
}
export function rejection(c,level,zone,direction){
 const recent=c.slice(-4),x=c.at(-1);if(!x)return false;
 const touched=recent.some(k=>k.low<=level+zone&&k.high>=level-zone);if(!touched)return false;
 const r=x.high-x.low,wick=direction==='BULLISH'?Math.min(x.open,x.close)-x.low:x.high-Math.max(x.open,x.close);
 return r>0&&bodyRatio(x)>=.3&&wick/r>=.25&&(direction==='BULLISH'?x.close>level:x.close<level);
}
