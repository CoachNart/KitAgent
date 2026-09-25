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
}
function msnrEntries(c,bias,price){
 const z=recentSwing(c,bias,price);if(!z)return[];
 const a=atr(c,14)||0,zone=Math.max(a*.4,Math.abs(price)*.0015),state=poiState(c,bias,z.level,zone);
 if(state==='INVALID'||state==='TOUCHED_NO_CONFIRMATION')return[];
 return[{entry:z.level,invalidation:bias==='LONG'?z.level-zone:z.level+zone,target:targetLevels(c,bias,z.level)[0]?.level,
  kind:state==='CONFIRMED'?'MSNR LEVEL + REJECTION':'MSNR LEVEL LIMIT',pending:state==='PENDING'}]
}

function strategyEntries(c,bias,strategy,price){
 if(strategy==='TOP_DOWN')return topDownEntries(c,bias,price);
 if(strategy==='PULLBACK')return pullbackEntries(c,bias);
 if(strategy==='BREAKOUT')return breakoutEntries(c,bias);
 if(strategy==='SMC')return smcEntries(c,bias,price);
 if(strategy==='MSNR')return msnrEntries(c,bias,price);
 if(strategy==='PRICE_ACTION')return priceActionEntries(c,bias,price);
 if(strategy==='LIQUIDITY_REVERSAL')return liquidityEntries(c,bias);
 if(strategy==='CRT')return crtEntries(c,bias);
 return[];
}
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
function bos(c,bias){const s=swings(c),src=bias==='LONG'?s.h:s.l;for(const p of src.slice(-30).reverse())for(let i=p.i+1;i<c.length;i++)if(bias==='LONG'?c[i].close>p.p:c[i].close<p.p)return{level:p.p,index:i,age:c.length-1-i};return null}
function sweep(c,bias){const s=swings(c),src=bias==='LONG'?s.l:s.h;for(const p of src.slice(-30).reverse())for(let i=p.i+1;i<c.length;i++){if(bias==='LONG'&&c[i].low<p.p&&c[i].close>p.p)return{level:p.p,extreme:c[i].low,index:i,age:c.length-1-i};if(bias==='SHORT'&&c[i].high>p.p&&c[i].close<p.p)return{level:p.p,extreme:c[i].high,index:i,age:c.length-1-i}}return null}
function recentDisplacement(c,bias){for(let i=c.length-1;i>=Math.max(1,c.length-12);i--){const x=c[i],r=x.high-x.low,b=Math.abs(x.close-x.open),prior=c.slice(Math.max(0,i-6),i).map(k=>k.high-k.low),av=sma(prior,prior.length);if(r&&b/r>=.55&&av&&r>=av*1.1&&(bias==='LONG'?x.close>x.open&&x.close>=x.high-r*.25:x.close<x.open&&x.close<=x.low+r*.25))return{i,candle:x}}return null}
function candleSignal(c,bias){if(c.length<3)return false;const x=c.at(-1),p=c.at(-2),r=x.high-x.low;if(!r)return false;const engulf=bias==='LONG'?x.close>x.open&&p.close<p.open&&x.open<=p.close&&x.close>=p.open:bias==='SHORT'?x.close<x.open&&p.close>p.open&&x.open>=p.close&&x.close<=p.open:false;const wick=bias==='LONG'?Math.min(x.open,x.close)-x.low:x.high-Math.max(x.open,x.close);return engulf||wick>=Math.abs(x.close-x.open)*1.4}
function rangeBreak(c,bias){for(let i=c.length-1;i>=Math.max(20,c.length-12);i--){const prior=c.slice(i-20,i),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low)),x=c[i],body=Math.abs(x.close-x.open),r=x.high-x.low;if(!r||body/r<.55)continue;if((bias==='LONG'&&x.close>hi)||(bias==='SHORT'&&x.close<lo)){const avg=sma(prior.map(k=>k.high-k.low),20)||r;if(r>=avg*1.1)return{level:bias==='LONG'?hi:lo,index:i}}}return null}
function tfPlan(tf,s){const i=TF_ORDER.indexOf(tf);if(i<0||tf==='1W')throw Object.assign(new Error('Unsupported execution timeframe'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});const hi=TF_ORDER[Math.min(i+1,TF_ORDER.length-1)],hi2=TF_ORDER[Math.min(i+2,TF_ORDER.length-1)];if(s==='MSNR'){if(i>5)throw Object.assign(new Error('MSNR is available on 4H and lower execution timeframes'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});return{entry:tf,structure:'4H',bias:'1D',extra:['1W']}}if(s==='CRT'){if(i>5)throw Object.assign(new Error('CRT is available on 4H and lower execution timeframes'),{code:'TIMEFRAME_STRATEGY_MISMATCH'});return{entry:tf,structure:hi,bias:hi2,extra:[]}}if(s==='TOP_DOWN')return{entry:tf,structure:hi,bias:hi2,extra:[]};return{entry:tf,structure:tf,bias:hi,extra:[]}}
function normalizeStrategy(x){const s=String(x||'').toUpperCase().replace(/[-\s]/g,'_');return s==='PRICEACTION'?'PRICE_ACTION':s}
function quoteFresh(q,market){if(!q||!Number.isFinite(+q.mid))return false;if(['forex','commodities','indices'].includes(market))return true;return q.stale!==true}
function strategyPlan(data,strategy,price){const p=tfPlan(data.tf,strategy),cur=data.c[p.entry],structure=data.c[p.structure]||cur,htf=data.c[p.bias]||structure,a=atr(cur,14);if(!cur||cur.length<40||!a)return null;const candidates=[];for(const bias of ['LONG','SHORT']){const hb=trend(htf),sb=trend(structure),aligned=hb===bias||sb===bias;let trade=null,evidence=[],reason='',entryKind='';if(strategy==='TOP_DOWN'){if(hb===bias||sb===bias){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='Higher-timeframe direction and a tested execution POI align; entry is anchored to the structural retest, not the current price.';evidence=['HTF '+hb,'Structure '+sb,entryKind,'Structural invalidation stop.']}}}else if(strategy==='PULLBACK'){const br=bos(cur,bias);trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='An impulse leg is followed by a measured retracement entry with invalidation beyond the pullback zone.';evidence=[br?'Confirmed structural impulse.':'Recent directional impulse.','Measured retracement.',entryKind,'Structural invalidation stop.']}}else if(strategy==='BREAKOUT'){const br=rangeBreak(cur,bias);if(br){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='A confirmed range break is treated as a retest setup; the entry is placed at the broken boundary rather than chasing the breakout candle.';evidence=['Break level '+roundPrice(br.level)+'.','Decisive close outside range.',entryKind,'Invalidation beyond retest zone.']}}}else if(strategy==='SMC'){const sw=sweep(cur,bias),br=bos(cur,bias),disp=recentDisplacement(cur,bias);if(sw||br||disp){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='SMC entry is anchored to a recent order block or fair-value gap after liquidity/structure evidence, with the stop beyond that POI.';evidence=[sw?'Liquidity sweep/reclaim.':'Structural liquidity.',br?'BOS context.':'Structure context.',disp?'Displacement confirmed.':'POI confirmation.',entryKind,'POI invalidation stop.']}}}else if(strategy==='MSNR'){const wb=trend(data.c['1W']||[]),db=trend(data.c['1D']||[]),story=wb===bias||db===bias||hb===bias;if(story){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='MSNR storyline identifies a tested decision level; entry is staged at that level with invalidation beyond the level.';evidence=['Weekly '+wb,'Daily '+db,'MSNR decision level.',entryKind,'Structural invalidation stop.']}}}else if(strategy==='PRICE_ACTION'){if(candleSignal(cur,bias)||recentDisplacement(cur,bias)||aligned){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='Price action is confirmed at a structural level; entry is tied to the level that produced the rejection rather than an arbitrary market price.';evidence=[candleSignal(cur,bias)?'Rejection/engulfing confirmed.':'Structural price-action context.',entryKind,'Structural invalidation stop.']}}}else if(strategy==='LIQUIDITY_REVERSAL'){const sw=sweep(cur,bias);if(sw){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='Liquidity was swept and reclaimed; the entry returns to the swept level instead of chasing the reversal candle.';evidence=['Liquidity sweep '+roundPrice(sw.level)+'.','Reclaim confirmed.',entryKind,'Sweep invalidation stop.']}}}else if(strategy==='CRT'){const parent=structure.at(-1),range=parent?parent.high-parent.low:0,sw=sweep(cur,bias);if(parent&&range>0&&sw){trade=refinedTrade(cur,bias,strategy,price);if(trade){entryKind=trade.entryKind;reason='CRT uses the swept range edge as the execution reference and places invalidation beyond the sweep.';evidence=['CRT range '+roundPrice(parent.low)+' — '+roundPrice(parent.high)+'.','Range liquidity swept/reclaimed.',entryKind,'Sweep invalidation stop.']}}}if(trade&&trade.rr>=MIN_RR){const distance=Math.abs(trade.entry-price)/price,score=(hb===bias?3:0)+(sb===bias?2:0)+(trade.rr>=3?2:0)+(trade.stopQuality||0)+(trade.targetTouches||0)*.5+(trade.entryKind?1.5:0)-(distance>0.02?1:0);candidates.push({trade,bias,evidence,reason,score,entryKind,pending:trade.pending===true})}}if(!candidates.length)return{strategy,strategyName:STRATEGIES[strategy].name,strategyShort:STRATEGIES[strategy].short,marketRegime:'WAIT',strategyValid:false,strategyReady:false,strategyEvidence:[],strategyFailures:['No qualified structural opportunity passed the strategy rules and 2R validation.'],strategyReason:'No qualified setup currently meets the strategy rules and structural 2R requirement.',tradeReady:false,orderType:'NO_SETUP',entry:null,limitEntry:null,stopLoss:null,takeProfit1:null,takeProfit2:null,riskReward:'—',riskRewardValue:null,quality:'NO SETUP',setupStatus:'NO SETUP',setupReason:'No qualified setup currently meets the strategy rules and structural 2R requirement.',bias:'WAIT',directionBias:'WAIT',confidence:0,higherTimeframe:p.bias,middleTimeframe:p.structure,entryTimeframe:p.entry};const best=candidates.sort((x,y)=>y.score-x.score||y.trade.rr-x.trade.rr)[0],near=Math.abs(best.trade.entry-price)<=Math.max(a*.35,price*.0025),order=best.trade.pending?'LIMIT':(near?'MARKET':'LIMIT'),confidence=Math.min(92,Math.max(55,Math.round(55+best.score*4+Math.min(best.trade.rr,4)*3)));return{strategy,strategyName:STRATEGIES[strategy].name,strategyShort:STRATEGIES[strategy].short,marketRegime:best.bias,strategyValid:true,strategyReady:true,strategyEvidence:best.evidence,strategyFailures:[],strategyReason:best.reason,entry:roundPrice(best.trade.entry),limitEntry:order==='LIMIT'?roundPrice(best.trade.entry):null,stopLoss:roundPrice(best.trade.stop),takeProfit1:roundPrice(best.trade.target),takeProfit2:null,riskReward:'1:'+best.trade.rr.toFixed(2),riskRewardValue:+best.trade.rr.toFixed(2),orderType:order,tradeReady:true,setupStatus:'TRADE READY',setupReason:best.reason,bias:best.bias,directionBias:best.bias,confidence,riskPercent:+(best.trade.risk/best.trade.entry*100).toFixed(2),stopDistance:roundPrice(best.trade.risk),marketEntry:roundPrice(price),price:roundPrice(price),liquidityTarget:roundPrice(best.trade.targetLiquidity),liquidityType:'STRUCTURAL LIQUIDITY',structuralInvalidation:roundPrice(best.trade.stop),entryMethod:best.entryKind,higherTimeframe:p.bias,middleTimeframe:p.structure,entryTimeframe:p.entry,confirmation:{strategy,bos:['BREAKOUT','SMC','PULLBACK','TOP_DOWN'].includes(strategy),sweep:['SMC','LIQUIDITY_REVERSAL','CRT'].includes(strategy),displacement:['BREAKOUT','SMC','PULLBACK'].includes(strategy),engulfing:['PRICE_ACTION','MSNR'].includes(strategy),rejection:['PRICE_ACTION','MSNR'].includes(strategy)}}}
async function bybitInstruments(){const r=await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear&status=Trading&limit=1000',{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Bybit perpetual instrument provider unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit perpetual instrument provider unavailable');return(b.result?.list||[]).filter(x=>x.status==='Trading'&&x.contractType==='LinearPerpetual').map(x=>({symbol:x.baseCoin+'/'+x.quoteCoin,providerSymbol:x.symbol,name:x.baseCoin+' / '+x.quoteCoin,type:'PERPETUAL'})).sort((a,b)=>a.symbol.localeCompare(b.symbol))}
async function candlesFor(market,symbol,tf){if(['forex','commodities','indices'].includes(market))return norm((await yahooCandles(symbol,tf,market)).rows);const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/kline');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);u.searchParams.set('interval',BYBIT_INTERVAL[tf]);u.searchParams.set('limit','300');const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Bybit candles unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit candles unavailable');return norm(b.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function priceFor(market,symbol){if(['forex','commodities','indices'].includes(market))return yahooPrice(symbol,market);const clean=symbol.replace(/[^A-Z0-9]/gi,'');const r=await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${clean}`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Bybit live price unavailable');const b=await r.json(),x=b?.result?.list?.[0];if(b.retCode!==0||!x)throw new Error(b.retMsg||'Bybit live price unavailable');const bid=+x.bid1Price,ask=+x.ask1Price,last=+x.lastPrice,mid=bid>0&&ask>0?(bid+ask)/2:last;if(!Number.isFinite(mid)||mid<=0)throw new Error('Bybit live price unavailable');return{bid,ask,mid,time:new Date(Number(b.time||Date.now())).toISOString(),spread:Math.max(0,ask-bid),marketState:'open',stale:false,instrument:{name:symbol}}}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H'),strategy=normalizeStrategy(req.query?.strategy);if(req.query?.action==='instruments'){if(['forex','commodities','indices'].includes(market))return json(res,200,{ok:true,instruments:yahooInstruments(market)});if(['crypto','perpetual'].includes(market))return json(res,200,{ok:true,instruments:await bybitInstruments()});return json(res,400,{error:'Unsupported market'})}const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);if(!STRATEGIES[strategy])return json(res,400,{error:'Unsupported strategy'});const plan=tfPlan(timeframe,strategy);if(!symbol)return json(res,400,{error:'Missing symbol'});const needed=[...new Set([plan.entry,plan.structure,plan.bias,...(plan.extra||[])])];const pairs=await Promise.all(needed.map(async tf=>[tf,closed(await candlesFor(market,symbol,tf),tf)]));const data={c:Object.fromEntries(pairs),tf:timeframe};const quote=await priceFor(market,symbol);if(!quoteFresh(quote,market))throw new Error('Live market quote is stale. No setup was issued.');const setup=strategyPlan(data,strategy,quote.mid);const final=setup||{strategy,strategyName:STRATEGIES[strategy].name,strategyShort:STRATEGIES[strategy].short,tradeReady:false,setupStatus:'NO SETUP',setupReason:'No qualified setup.',orderType:'NO_SETUP',confidence:0,bias:'WAIT',directionBias:'WAIT',entry:null,limitEntry:null,stopLoss:null,takeProfit1:null,riskReward:'—',higherTimeframe:plan.bias,middleTimeframe:plan.structure,entryTimeframe:plan.entry};return json(res,200,{ok:true,market,symbol,timeframe,strategy,strategyInfo:STRATEGIES[strategy],setup:final,quote,confluence:[{timeframe:plan.bias,bias:trend(data.c[plan.bias]||[]),role:'CONTEXT',confidence:final.confidence},{timeframe:plan.structure,bias:trend(data.c[plan.structure]||[]),role:'STRUCTURE',confidence:final.confidence},{timeframe:plan.entry,bias:trend(data.c[plan.entry]||[]),role:'OPPORTUNITY',confidence:final.confidence}],aligned:final.tradeReady?3:0,totalTimeframes:3,source:['forex','commodities','indices'].includes(market)?'Yahoo Finance':'Bybit linear perpetuals',generatedAt:new Date().toISOString()})}catch(e){return json(res,500,{ok:false,error:e?.message||'Market analysis failed',code:e?.code||'MARKET_ERROR'})}}
