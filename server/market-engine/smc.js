import {atr,bodyRatio} from './data.js';
import {confirmedSwings,selectStructuralTarget} from './structure.js';

export const SMC_MODEL='LIQUIDITY_SWEEP_MSS_DISPLACEMENT_FVG';

export {fvgAt, meaningfulDisplacement, findSweeps};

function fvgAt(c,i){
  if(i<2||!c[i-2]||!c[i-1]||!c[i])return null;
  const a=c[i-2],d=c[i];
  if(a.high<d.low)return{direction:'BULLISH',index:i,createdBy:i-1,low:a.high,high:d.low,size:d.low-a.high,midpoint:(a.high+d.low)/2};
  if(a.low>d.high)return{direction:'BEARISH',index:i,createdBy:i-1,low:d.high,high:a.low,size:a.low-d.high,midpoint:(d.high+a.low)/2};
  return null;
}
function meaningfulDisplacement(c,i,direction){
  const x=c[i],a=atr(c.slice(0,i+1),14),r=x?.high-x?.low,body=x?Math.abs(x.close-x.open):0;
  if(!x||!a||!r||body/r<.6||r<a*1.05)return null;
  if(direction==='BULLISH'&&(x.close<=x.open||x.close<x.high-r*.25))return null;
  if(direction==='BEARISH'&&(x.close>=x.open||x.close>x.low+r*.25))return null;
  return{index:i,range:r,body,atrMultiple:r/a,bodyRatio:body/r};
}
function swingBreakAfter(c,start,end,direction){
  const s=confirmedSwings(c,1);
  if(direction==='BULLISH'){
    const candidates=s.highs.filter(x=>x.index>start&&x.confirmationIndex<=end);
    for(const sw of candidates.slice().reverse())for(let i=Math.max(sw.confirmationIndex,start+1);i<=end;i++)if(c[i].close>sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
  }else{
    const candidates=s.lows.filter(x=>x.index>start&&x.confirmationIndex<=end);
    for(const sw of candidates.slice().reverse())for(let i=Math.max(sw.confirmationIndex,start+1);i<=end;i++)if(c[i].close<sw.price)return{index:i,level:sw.price,swingIndex:sw.index};
  }
  return null;
}
function findSweeps(c,direction){
  const s=confirmedSwings(c,2),pools=direction==='BULLISH'?s.lows:s.highs,out=[];
  for(const p of pools)for(let i=p.confirmationIndex;i<c.length;i++){
    const x=c[i],swept=direction==='BULLISH'?x.low<p.price:x.high>p.price,reclaimed=direction==='BULLISH'?x.close>p.price:x.close<p.price;
    if(swept&&reclaimed)out.push({direction,index:i,level:p.price,extreme:direction==='BULLISH'?x.low:x.high,swingIndex:p.index,age:c.length-1-i});
  }
  return out.sort((a,b)=>a.index-b.index);
}
function dealingRange(c,asOf){
  const xs=c.slice(Math.max(0,asOf-40),asOf+1); if(!xs.length)return null;
  const high=Math.max(...xs.map(x=>x.high)),low=Math.min(...xs.map(x=>x.low));
  return{high,low,equilibrium:(high+low)/2};
}
function freshFvg(c,fvg,asOf){
  if(!fvg)return false;
  for(let i=fvg.index+1;i<=asOf;i++){const x=c[i];if(fvg.direction==='BULLISH'&&x.low<=fvg.low)return false;if(fvg.direction==='BEARISH'&&x.high>=fvg.high)return false;}
  return true;
}
function nextLiquidityTarget(c,direction,entry,sweepIndex,layers=[]){
  const a=atr(c,14)||0;
  const minDistance=Math.max(a*1.5,Math.abs(entry)*.005);
  return selectStructuralTarget(c,direction,entry,{layers,minDistance})||null;
}
function buildTrade({c,price,direction,sweep,mss,displacement,fvg,target}){
  const a=atr(c,14)||Math.max(Math.abs(price)*.001,1e-9),buffer=Math.max(a*.15,Math.abs(price)*.00035);
  const stop=direction==='BULLISH'?sweep.extreme-buffer:sweep.extreme+buffer,entry=fvg.midpoint,risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=risk>0?reward/risk:0;
  if(!Number.isFinite(rr)||rr<=0)return null;
  if(direction==='BULLISH'&&price<sweep.extreme)return null;
  if(direction==='BEARISH'&&price>sweep.extreme)return null;
  const tolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const near=Math.abs(price-entry)<=tolerance;
  const orderType=near?'MARKET':direction==='BULLISH'?(price>entry?'LIMIT':null):(price<entry?'LIMIT':null);
  if(!orderType)return null;
  return{entry,marketEntry:price,stop,target,rr,orderType,entryReason:'Retrace into the unmitigated FVG created by the displacement that caused the MSS.',invalidation:'Beyond the liquidity-sweep extreme with volatility buffer.',invalidationSource:'liquidity_sweep_extreme',sweepLevel:sweep.level,sweepExtreme:sweep.extreme,mssLevel:mss.level,displacementIndex:displacement.index,fvg:{low:fvg.low,high:fvg.high,midpoint:fvg.midpoint,index:fvg.index}};
}
export function evaluateSMC({candles,layers,price}){
  const c=candles||[],failures=[];
  if(c.length<40)return{direction:'NEUTRAL',failures:['Insufficient execution candles for SMC.'],evidence:[]};
  const ordered=(layers||[]).filter(Boolean),htf=ordered[0]?.structure,htfDirection=htf?.direction||'NEUTRAL';
  if(!['BULLISH','BEARISH'].includes(htfDirection)){failures.push('Higher-timeframe structure is not directional.');return{direction:'NEUTRAL',failures,evidence:[]};}
  const direction=htfDirection,sweeps=findSweeps(c,direction).filter(x=>x.age<=16);
  if(!sweeps.length){failures.push(direction==='BULLISH'?'No valid sell-side liquidity sweep.':'No valid buy-side liquidity sweep.');return{direction,failures,evidence:[]};}
  const sweep=sweeps.at(-1),mss=swingBreakAfter(c,sweep.index,c.length-1,direction);
  if(!mss){failures.push('Liquidity was swept, but no post-sweep market-structure shift was confirmed.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep}]};}
  if(mss.index-sweep.index>10){failures.push('Market-structure shift occurred too late after the liquidity sweep.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep}]};}
  const displacement=meaningfulDisplacement(c,mss.index,direction);
  if(!displacement){failures.push('MSS was not produced by meaningful displacement.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss}]};}
  const fvg=fvgAt(c,mss.index+1)?.direction===direction?fvgAt(c,mss.index+1):fvgAt(c,mss.index)?.direction===direction?fvgAt(c,mss.index):null;
  if(!fvg||fvg.createdBy!==mss.index||!freshFvg(c,fvg,c.length-1)){failures.push('The MSS displacement did not leave a fresh FVG for retracement.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement}]};}
  const range=dealingRange(c,mss.index);
  if(!range||(direction==='BULLISH'?fvg.midpoint>range.equilibrium:fvg.midpoint<range.equilibrium)){failures.push(direction==='BULLISH'?'Bullish FVG is not in discount.':'Bearish FVG is not in premium.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg}]};}
  if(!Number.isFinite(price)||price<=0){failures.push('Live price is unavailable.');return{direction,failures,evidence:[]};}
  const target=nextLiquidityTarget(c,direction,fvg.midpoint,sweep.index,ordered);
  if(!target||!Number.isFinite(target.price)){failures.push('No opposing liquidity objective is available.');return{direction,failures,evidence:[]};}
  const trade=buildTrade({c,price,direction,sweep,mss,displacement,fvg,target:target.price});
  if(!trade){failures.push('FVG entry, structural invalidation, or meaningful liquidity objective is invalid.');return{direction,failures,evidence:[{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg}]};}
  const score=88+(displacement.atrMultiple>=1.35?3:0)+(sweep.age<=6?3:0),grade=score>=92?'A+':'A';
  return{direction,grade:{grade,score,hardFailures:[]},failures:[],trade,evidence:[{type:'HTF_BIAS',direction,timeframe:ordered[0]?.tf||null},{type:'LIQUIDITY_SWEEP',...sweep},{type:'MSS',...mss},{type:'DISPLACEMENT',...displacement},{type:'FVG',...fvg},{type:'PREMIUM_DISCOUNT',zone:direction==='BULLISH'?'DISCOUNT':'PREMIUM',equilibrium:range.equilibrium}],smc:{model:SMC_MODEL,htfBias:direction,sweep,mss,displacement,fvg,dealingRange:range,target}};
}
