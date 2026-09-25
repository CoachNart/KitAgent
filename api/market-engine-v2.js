function refinedTrade(c,bias,strategy,price){
 const a=atr(c,14)||0,maxPending=Math.max(a*2.5,price*.012);
 for(const z of strategyEntries(c,bias,strategy,price)){
  if(!Number.isFinite(z.entry)||z.entry<=0)continue;
  if(Math.abs(z.entry-price)>maxPending)continue;
  if(bias==='LONG'&&z.entry>price+a*.35)continue;
  if(bias==='SHORT'&&z.entry<price-a*.35)continue;
  const t=buildTrade(c,bias,z.entry,z.invalidation,z.target);
  if(t)return{...t,entryKind:z.kind,pending:z.pending===true};
 }
 return null
}
import { authenticate, requireActiveAccess } from '../server/access.js';
import { yahooCandles, yahooPrice, yahooInstruments } from '../server/yahooMarket.js';

const TF_ORDER=['1m','5m','15m','30m','1H','4H','1D','1W'];
const TF_MS={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000,'1W':604800000};
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
const MIN_RR=2;
const STRATEGIES={TOP_DOWN:{name:'Top-Down',short:'HTF structure first'},PULLBACK:{name:'Pullback',short:'Impulse → retracement → continuation'},BREAKOUT:{name:'Breakout',short:'Close → displacement → continuation'},SMC:{name:'SMC',short:'Liquidity → displacement → BOS → POI'},MSNR:{name:'MSNR',short:'Malaysian Support & Resistance'},PRICE_ACTION:{name:'Price Action',short:'Structure + candle confirmation'},LIQUIDITY_REVERSAL:{name:'Liquidity Reversal',short:'Sweep → reclaim → reversal'},CRT:{name:'CRT',short:'Candle range → sweep → reclaim'}};
function json(res,status,p){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(p))}
function sma(a,n){const v=(a||[]).filter(Number.isFinite);if(!v.length)return null;const x=v.slice(-Math.min(n||v.length,v.length));return x.reduce((s,z)=>s+z,0)/x.length}
function atr(c,n=14){if(!Array.isArray(c)||c.length<2)return null;const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return sma(tr,n)}
function norm(rows){const m=new Map();for(const r of rows||[]){const x={time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+(r[5]||0)};if([x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)&&x.high>=x.low)m.set(x.time,x)}return [...m.values()].sort((a,b)=>a.time-b.time)}
function closed(c,tf){if(!Array.isArray(c)||c.length<3)return[];const x=c.at(-1),iv=TF_MS[tf],age=Date.now()-x.time;return Number.isFinite(iv)&&age>=0&&age<iv?c.slice(0,-1):c}
function roundPrice(v){if(!Number.isFinite(v))return null;if(v>=1000)return+v.toFixed(2);if(v>=100)return+v.toFixed(3);if(v>=1)return+v.toFixed(5);if(v>=.1)return+v.toFixed(6);return+v.toPrecision(7)}
function pivotHigh(c,i){if(i<2||i>=c.length-2)return false;for(let j=1;j<=2;j++){if(c[i].high<=c[i-j].high||c[i].high<c[i+j].high)return false}return true}
function pivotLow(c,i){if(i<2||i>=c.length-2)return false;for(let j=1;j<=2;j++){if(c[i].low>=c[i-j].low||c[i].low>c[i+j].low)return false}return true}
function swings(c){const h=[],l=[];for(let i=2;i<c.length-2;i++){if(pivotHigh(c,i))h.push({p:c[i].high,i});if(pivotLow(c,i))l.push({p:c[i].low,i})}return{h,l}}
function trend(c){const s=swings(c),h=s.h.slice(-5),l=s.l.slice(-5);if(h.length<2||l.length<2)return'WAIT';const hh=h.at(-1).p>h.at(-2).p,hl=l.at(-1).p>l.at(-2).p,lh=h.at(-1).p<h.at(-2).p,ll=l.at(-1).p<l.at(-2).p;return hh&&hl?'LONG':lh&&ll?'SHORT':'WAIT'}
function structuralLevels(c,bias,entry,lookback=180){
 const a=atr(c,14)||Math.abs(entry)*.002,s=swings(c),src=bias==='LONG'?s.l:s.h,side=bias==='LONG'?x=>x.p<entry:x=>x.p>entry,tol=Math.max(a*.28,Math.abs(entry)*.0012),groups=[];
 for(const p of src.filter(side).filter(x=>x.i>=Math.max(0,c.length-lookback))){
  let g=groups.find(x=>Math.abs(x.level-p.p)<=tol);
  if(!g){g={level:p.p,points:[]};groups.push(g)}
  g.points.push(p);g.level=g.points.reduce((z,q)=>z+q.p,0)/g.points.length
 }
 return groups.map(g=>{
  const excursion=g.points.reduce((best,p)=>{
   const end=Math.min(c.length-1,p.i+24),ss=c.slice(p.i+1,end+1);
   const e=bias==='LONG'?Math.max(0,...ss.map(x=>x.high-p.p)):Math.max(0,...ss.map(x=>p.p-x.low));
   return Math.max(best,e)
  },0);
  const touches=g.points.length,lastIndex=Math.max(...g.points.map(x=>x.i)),age=c.length-1-lastIndex;
  const significant=excursion>=a*.55,major=touches>=2||excursion>=a*1.15;
  return {...g,touches,lastIndex,age,excursion,significant,major,
   quality:(major?4:0)+(touches>=2?2:0)+(significant?1:0)+(age<=48?1:0)}
 }).filter(g=>g.major||g.significant)
 .sort((x,y)=>y.quality-x.quality||y.excursion-x.excursion||Math.abs(entry-x.level)-Math.abs(entry-y.level)||x.age-y.age)
}
function targetLevels(c,bias,entry,lookback=220){
 const a=atr(c,14)||Math.abs(entry)*.002,s=swings(c),src=bias==='LONG'?s.h:s.l,side=bias==='LONG'?x=>x.p>entry:x=>x.p<entry,tol=Math.max(a*.28,Math.abs(entry)*.0012),groups=[];
 for(const p of src.filter(side).filter(x=>x.i>=Math.max(0,c.length-lookback))){
  let g=groups.find(x=>Math.abs(x.level-p.p)<=tol);
  if(!g){g={level:p.p,points:[]};groups.push(g)}
  g.points.push(p);g.level=g.points.reduce((z,q)=>z+q.p,0)/g.points.length
 }
 return groups.map(g=>{
  const excursion=g.points.reduce((best,p)=>{
   const end=Math.min(c.length-1,p.i+24),ss=c.slice(p.i+1,end+1);
   const e=bias==='LONG'?Math.max(0,...ss.map(x=>x.high-p.p)):Math.max(0,...ss.map(x=>p.p-x.low));
   return Math.max(best,e)
  },0);
  const touches=g.points.length,age=c.length-1-Math.max(...g.points.map(x=>x.i)),significant=excursion>=a*.55,major=touches>=2||excursion>=a*1.15;
  return {...g,touches,age,excursion,significant,major,quality:(major?4:0)+(touches>=2?2:0)+(significant?1:0)+(age<=60?1:0)}
 }).filter(g=>g.major||g.significant)
 .sort((x,y)=>y.quality-x.quality||y.excursion-x.excursion||Math.abs(entry-x.level)-Math.abs(entry-y.level))
}
function buildTrade(c,bias,entry,invalidation=null,preferredTarget=null){
 const a=atr(c,14);if(!a||!Number.isFinite(entry)||entry<=0)return null;
 const maxRisk=Math.min(a*3.2,entry*.025),minRisk=Math.max(a*.75,entry*.0012),buffer=Math.max(a*.32,entry*.0007);
 const structural=structuralLevels(c,bias,entry),stops=[];
 for(const st of structural){
  let level=st.level,source='STRUCTURAL SWING';
  if(Number.isFinite(invalidation)){
   const refinementRange=Math.max(a*.75,Math.abs(entry)*.002);
   if(Math.abs(invalidation-st.level)<=refinementRange){
    if(bias==='LONG'&&invalidation<level){level=invalidation;source='STRUCTURAL SWING + CONFIRMED INVALIDATION'}
    if(bias==='SHORT'&&invalidation>level){level=invalidation;source='STRUCTURAL SWING + CONFIRMED INVALIDATION'}
   }
  }
  stops.push({...st,level,source})
 }
 if(!stops.length)return null;
 const targets=targetLevels(c,bias,entry).map(tg=>({...tg,preferred:false}));
 if(Number.isFinite(preferredTarget))targets.push({level:preferredTarget,points:[],preferred:true,quality:0,touches:1,major:false});
 const usableTargets=targets.map(tg=>{
  const tb=Math.min(a*.12,entry*.001),target=bias==='LONG'?tg.level-tb:tg.level+tb;
  return {...tg,target,distance:Math.abs(target-entry)}
 }).filter(x=>Number.isFinite(x.target)&&x.distance>=a*1.25&&((bias==='LONG'&&x.target>entry)||(bias==='SHORT'&&x.target<entry)))
 .sort((x,y)=>y.quality-x.quality||y.excursion-x.excursion||x.distance-y.distance);
 const validStops=stops.map(st=>{
  const stop=bias==='LONG'?st.level-buffer:st.level+buffer,risk=Math.abs(entry-stop);
  return {...st,stop,risk}
 }).filter(st=>Number.isFinite(st.stop)&&st.risk>=minRisk&&st.risk<=maxRisk)
 .sort((x,y)=>y.quality-x.quality||x.risk-y.risk);
 for(const st of validStops){
  const chosen=usableTargets.find(tg=>tg.distance/st.risk>=MIN_RR);
  if(!chosen)continue;
  return {entry,stop:st.stop,target:chosen.target,risk:st.risk,rr:chosen.distance/st.risk,targetLiquidity:chosen.level,
   stopQuality:st.quality,targetTouches:chosen.points?.length||chosen.touches||1,stopSource:st.source}
 }
 return null
}
function limitAtPOI(c,bias,price){for(const z of structuralLevels(c,bias,price)){const e=z.level;if((bias==='LONG'&&e>=price)||(bias==='SHORT'&&e<=price))continue;const t=buildTrade(c,bias,e);if(t&&Math.abs(e-price)<=Math.min((atr(c,14)||price*.002)*4,price*.03))return t}return null}
function fairValueGaps(c,bias,lookback=40){const out=[];const start=Math.max(1,c.length-lookback);for(let i=start;i<c.length-1;i++){const a=c[i-1],n=c[i+1];if(bias==='LONG'&&n.low>a.high){const lo=a.high,hi=n.low;out.push({low:lo,high:hi,mid:(lo+hi)/2,index:i,kind:'BULLISH FVG'})}if(bias==='SHORT'&&n.high<a.low){const lo=n.high,hi=a.low;out.push({low:lo,high:hi,mid:(lo+hi)/2,index:i,kind:'BEARISH FVG'})}}return out.sort((x,y)=>y.index-x.index)}
function orderBlocks(c,bias,lookback=50){const out=[];const start=Math.max(2,c.length-lookback);for(let i=start;i<c.length-2;i++){const x=c[i],n=c[i+1];if(bias==='LONG'&&x.close<x.open&&n.close>n.open&&n.close>x.high)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,kind:'BULLISH ORDER BLOCK'});if(bias==='SHORT'&&x.close>x.open&&n.close<n.open&&n.close<x.low)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,kind:'BEARISH ORDER BLOCK'})}return out.sort((x,y)=>y.index-x.index)}
function recentSwing(c,bias,entry){const levels=structuralLevels(c,bias,entry,180);return levels[0]||null}
function poiState(c,bias,level,zone){
 const price=c.at(-1)?.close;
 if(!Number.isFinite(price))return'INVALID';
 if(bias==='LONG'){
  if(price>level+zone)return'PENDING';
  if(price<level-zone)return'INVALID';
 }else{
  if(price<level-zone)return'PENDING';
  if(price>level+zone)return'INVALID';
 }
 return reactionAt(c,bias,level,zone)?'CONFIRMED':'TOUCHED_NO_CONFIRMATION';
}
function reactionAt(c,bias,level,zone){
 const recent=c.slice(-4); if(!recent.length)return false;
 const x=c.at(-1),r=x.high-x.low,body=Math.abs(x.close-x.open);
 if(!r)return false;
 const touched=recent.some(k=>k.low<=level+zone&&k.high>=level-zone);
 if(!touched)return false;
 const closeAway=bias==='LONG'?x.close>level+zone*.15:x.close<level-zone*.15;
 const rejection=bias==='LONG'?(x.close>x.open||x.low<=level-zone*.6):(x.close<x.open||x.high>=level+zone*.6);
 return closeAway&&rejection&&(body/r>=.35||Math.abs(x.close-level)>=zone*.2);
}
function pullbackEntries(c,bias){
 const a=atr(c,14)||0,s=swings(c),hs=s.h.slice(-10),ls=s.l.slice(-10),out=[];
 if(hs.length<2||ls.length<2||!a)return out;
 const hi=hs.at(-1).p,lo=ls.at(-1).p,range=hi-lo;
 if(range<a*1.5)return out;
 const impulseStart=bias==='LONG'?lo:hi,impulseEnd=bias==='LONG'?hi:lo,impulse=Math.abs(impulseEnd-impulseStart);
 if(impulse<a*1.5)return out;
 const retrace=bias==='LONG'?hi-impulse*.5:lo+impulse*.5,zone=Math.max(a*.35,Math.abs(retrace)*.001),state=poiState(c,bias,retrace,zone);
 if(state==='INVALID'||state==='TOUCHED_NO_CONFIRMATION')return out;
 out.push({entry:retrace,invalidation:bias==='LONG'?lo:hi,target:bias==='LONG'?hi:lo,
  kind:state==='CONFIRMED'?'CONFIRMED PULLBACK REACTION':'PULLBACK LIMIT POI',pending:state==='PENDING'});
 return out
}
function breakoutEntries(c,bias){
 const br=rangeBreak(c,bias);if(!br)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.3,Math.abs(br.level)*.001),state=poiState(c,bias,br.level,zone);
 if(state==='INVALID'||state==='TOUCHED_NO_CONFIRMATION')return[];
 const x=c.at(-1);
 return[{entry:br.level,invalidation:bias==='LONG'?br.level-zone:br.level+zone,
  target:bias==='LONG'?br.level+a*2.8:br.level-a*2.8,
  kind:state==='CONFIRMED'?'BREAKOUT RETEST + ACCEPTANCE':'BREAKOUT RETEST LIMIT',pending:state==='PENDING'}]
}
function smcEntries(c,bias,price){
 const out=[],a=atr(c,14)||0,disp=recentDisplacement(c,bias),bosEvent=bos(c,bias);
 for(const z of [...fairValueGaps(c,bias),...orderBlocks(c,bias)]){
  if(z.index>=c.length-2)continue;
  if(bias==='LONG'&&z.mid>=price)continue;if(bias==='SHORT'&&z.mid<=price)continue;
  const zone=Math.max(a*.3,Math.abs(z.mid)*.001);
  if(!reactionAt(c,bias,z.mid,zone))continue;
  if(!disp&&!bosEvent)continue;
  out.push({entry:z.mid,invalidation:bias==='LONG'?z.low:z.high,target:targetLevels(c,bias,z.mid)[0]?.level,kind:z.kind+' + REACTION'});
 }
 return out
}
function liquidityEntries(c,bias){
 const sw=sweep(c,bias);if(!sw||sw.age>3)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.25,Math.abs(sw.level)*.001);
 const post=c.slice(sw.index+1),x=post.at(-1);if(!x||!reactionAt(post,bias,sw.level,zone))return[];
 return[{entry:sw.level,invalidation:sw.extreme,target:targetLevels(c,bias,sw.level)[0]?.level,kind:'SWEEP + CLOSED RECLAIM'}]
}
function priceActionEntries(c,bias,price){
 const level=recentSwing(c,bias,price);if(!level)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.45,Math.abs(price)*.0015);
 if(!reactionAt(c,bias,level.level,zone))return[];
 return[{entry:level.level,invalidation:bias==='LONG'?level.level-zone:level.level+zone,target:targetLevels(c,bias,level.level)[0]?.level,kind:'STRUCTURE + CONFIRMED REJECTION'}]
}
function topDownEntries(c,bias,price){
 const z=recentSwing(c,bias,price);if(!z)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.45,Math.abs(price)*.0015),state=poiState(c,bias,z.level,zone);
 if(state==='INVALID'||state==='TOUCHED_NO_CONFIRMATION')return[];
 return[{entry:z.level,invalidation:bias==='LONG'?z.level-zone:z.level+zone,target:targetLevels(c,bias,z.level)[0]?.level,
  kind:state==='CONFIRMED'?'HTF POI + REACTION':'HTF POI LIMIT',pending:state==='PENDING'}]
}function msnrEntries(c,bias,price){
 const z=recentSwing(c,bias,price);if(!z)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.4,Math.abs(price)*.0015),state=poiState(c,bias,z.level,zone);
 if(state==='INVALID'||state==='TOUCHED_NO_CONFIRMATION')return[];
 return[{entry:z.level,invalidation:bias==='LONG'?z.level-zone:z.level+zone,target:targetLevels(c,bias,z.level)[0]?.level,
  kind:state==='CONFIRMED'?'MSNR LEVEL + REJECTION':'MSNR LEVEL LIMIT',pending:state==='PENDING'}]
}
