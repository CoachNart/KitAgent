import {atr} from './data.js';
import {confirmedSwings} from './structure.js';
export function keyLevels(c,asOf=c.length-1){
 const s=confirmedSwings(c,2),a=atr(c.slice(0,asOf+1),14)||Math.max(c[asOf]?.close*.001,1e-9),levels=[];
 for(const x of s.highs.filter(q=>q.confirmationIndex<=asOf).slice(-20))levels.push({type:'RESISTANCE',level:x.price,index:x.index,touches:1,age:asOf-x.index});
 for(const x of s.lows.filter(q=>q.confirmationIndex<=asOf).slice(-20))levels.push({type:'SUPPORT',level:x.price,index:x.index,touches:1,age:asOf-x.index});
 const tol=a*.3;
 const groups=[];
 for(const x of levels){let g=groups.find(q=>Math.abs(q.level-x.level)<=tol);if(!g){g={level:x.level,points:[]};groups.push(g)}g.points.push(x);g.level=g.points.reduce((s,p)=>s+p.level,0)/g.points.length;}
 return groups.map(g=>({...g,touches:g.points.length,age:Math.min(...g.points.map(x=>x.age)),fresh:g.points.length<=2&&Math.min(...g.points.map(x=>x.age))<=80,consumed:g.points.length>=4})).sort((a,b)=>b.touches-a.touches||a.age-b.age);
}
export function nearestTarget(c,direction,entry){
 const lv=keyLevels(c),cands=lv.filter(x=>direction==='BULLISH'?x.level>entry:x.level<entry).sort((a,b)=>Math.abs(a.level-entry)-Math.abs(b.level-entry));
 return cands[0]||null;
}
export function nearestInvalidation(c,direction,entry){
 const lv=keyLevels(c),cands=lv.filter(x=>direction==='BULLISH'?x.level<entry:x.level>entry).sort((a,b)=>Math.abs(a.level-entry)-Math.abs(b.level-entry));
 return cands[0]||null;
}
export function fvg(c,direction,asOf=c.length-1){
 const out=[];
 for(let i=2;i<=asOf;i++){const a=c[i-2],b=c[i-1],d=c[i];if(direction==='BULLISH'&&d.low>a.high)out.push({low:a.high,high:d.low,mid:(a.high+d.low)/2,index:i-1});if(direction==='BEARISH'&&d.high<a.low)out.push({low:d.high,high:a.low,mid:(d.high+a.low)/2,index:i-1});}
 return out.filter(x=>x.index<=asOf-1).slice(-12).reverse();
}
export function orderBlocks(c,direction,asOf=c.length-1){
 const out=[];
 for(let i=1;i<asOf-1;i++){const x=c[i],n=c[i+1];if(direction==='BULLISH'&&x.close<x.open&&n.close>n.open&&n.close>x.high)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i});if(direction==='BEARISH'&&x.close>x.open&&n.close<n.open&&n.close<x.low)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i});}
 return out.slice(-12).reverse();
}
