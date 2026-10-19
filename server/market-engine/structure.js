import {atr,bodyRatio,rangeAverage} from './data.js';

function pivot(c,i,k=2){
  if(i<k||i>=c.length-k)return null;
  let hi=true,lo=true;
  for(let j=1;j<=k;j++){
    hi&&=c[i].high>c[i-j].high&&c[i].high>=c[i+j].high;
    lo&&=c[i].low<c[i-j].low&&c[i].low<=c[i+j].low;
  }
  return {high:hi,low:lo};
}

const confirmedSwingCache=new WeakMap();

export function confirmedSwings(c,k=2){
  if(!Array.isArray(c))return {highs:[],lows:[]};
  let byStrength=confirmedSwingCache.get(c);
  if(!byStrength){
    byStrength=new Map();
    confirmedSwingCache.set(c,byStrength);
  }
  if(byStrength.has(k))return byStrength.get(k);
  const highs=[],lows=[];
  for(let i=k;i<c.length-k;i++){
    const p=pivot(c,i,k);
    if(!p)continue;
    const confirmationIndex=i+k;
    if(p.high)highs.push({price:c[i].high,index:i,confirmationIndex,time:c[i].time});
    if(p.low)lows.push({price:c[i].low,index:i,confirmationIndex,time:c[i].time});
  }
  const result={highs,lows};
  byStrength.set(k,result);
  return result;
}

function lastBefore(a,asOf){return a.filter(x=>x.confirmationIndex<=asOf);}
function emptyStructure(){
  return {
    state:'UNCLEAR',direction:'NEUTRAL',trend:'UNCLEAR',
    rawDirection:'NEUTRAL',structureBreak:null,
    swings:{highs:[],lows:[]},internal:{highs:[],lows:[]},external:{highs:[],lows:[]},
    hh:false,hl:false,lowerHigh:false,lowerLow:false,
    bos:null,choch:null,mss:null,protectedHigh:null,protectedLow:null,
    range:null,compression:false,expansion:false,atr:null
  };
}

export function structuralBreakEvents(c,highs,lows,asOf=(Array.isArray(c)?c.length-1:0)){
  if(!Array.isArray(c)||!c.length)return [];
  const end=Math.min(c.length-1,Math.max(0,Math.floor(Number(asOf))));
  if(!Number.isFinite(end))return [];
  const orderedHighs=[...(highs||[])].sort((a,b)=>a.confirmationIndex-b.confirmationIndex||a.index-b.index);
  const orderedLows=[...(lows||[])].sort((a,b)=>a.confirmationIndex-b.confirmationIndex||a.index-b.index);
  const events=[];
  let highCursor=0,lowCursor=0,activeHigh=null,activeLow=null;

  // Keep only the latest confirmed swing on each side active. Older levels are
  // superseded when a newer pivot confirms; breaking a stale level must not
  // masquerade as a fresh BOS while the current structural swing still holds.
  for(let i=0;i<=end;i++){
    while(highCursor<orderedHighs.length&&orderedHighs[highCursor].confirmationIndex<=i){
      activeHigh=orderedHighs[highCursor++];
    }
    while(lowCursor<orderedLows.length&&orderedLows[lowCursor].confirmationIndex<=i){
      activeLow=orderedLows[lowCursor++];
    }
    const close=Number(c[i]?.close);
    if(!Number.isFinite(close))continue;

    if(activeHigh&&i>=activeHigh.confirmationIndex&&close>activeHigh.price){
      events.push({
        type:'BOS',direction:'BULLISH',level:activeHigh.price,index:i,
        brokenSwingIndex:activeHigh.index,confirmationIndex:activeHigh.confirmationIndex,age:end-i
      });
      activeHigh=null;
    }
    if(activeLow&&i>=activeLow.confirmationIndex&&close<activeLow.price){
      events.push({
        type:'BOS',direction:'BEARISH',level:activeLow.price,index:i,
        brokenSwingIndex:activeLow.index,confirmationIndex:activeLow.confirmationIndex,age:end-i
      });
      activeLow=null;
    }
  }
  return events.sort((a,b)=>a.index-b.index);
}

export function structure(c,asOf=c.length-1){
  if(!Array.isArray(c)||c.length<40)return emptyStructure();
  const externalRaw=confirmedSwings(c,3);
  const internalRaw=confirmedSwings(c,1);
  const swingRaw=confirmedSwings(c,2);
  const external={
    highs:lastBefore(externalRaw.highs,asOf),
    lows:lastBefore(externalRaw.lows,asOf)
  };
  const internal={
    highs:lastBefore(internalRaw.highs,asOf),
    lows:lastBefore(internalRaw.lows,asOf)
  };
  const swings={
    highs:lastBefore(swingRaw.highs,asOf),
    lows:lastBefore(swingRaw.lows,asOf)
  };
  const eh=external.highs,el=external.lows;
  const lh=eh.at(-1),ph=eh.at(-2),ll=el.at(-1),pl=el.at(-2);
  const price=c[asOf]?.close;
  if(!lh||!ph||!ll||!pl||!Number.isFinite(price))return {
    ...emptyStructure(),swings,internal,external,
    protectedHigh:lh||null,protectedLow:ll||null
  };

  const hh=lh.price>ph.price,hl=ll.price>pl.price;
  const lowerHigh=lh.price<ph.price,lowerLow=ll.price<pl.price;
  const rawDirection=hh&&hl?'BULLISH':lowerHigh&&lowerLow?'BEARISH':'NEUTRAL';
  const events=structuralBreakEvents(c,eh,el,asOf);
  const last=events.at(-1)||null;
  const prior=events.at(-2)||null;

  // Protected structure is the swing that must hold for the current trend to remain valid.
  // Bullish: the last confirmed external low printed before the latest external high.
  // Bearish: the last confirmed external high printed before the latest external low.
  const bullishProtected=el.filter(x=>x.index<lh.index).at(-1)||ll;
  const bearishProtected=eh.filter(x=>x.index<ll.index).at(-1)||lh;
  const protectedLow=bullishProtected||null;
  const protectedHigh=bearishProtected||null;

  let direction=rawDirection;

  // When the latest confirmed swing pair is transitional, use a recent
  // structural break as the directional state instead of forcing the layer
  // to NEUTRAL. This preserves BOS/CHOCH semantics while preventing a single
  // unfinished HH/HL or LH/LL pair from starving every strategy of HTF bias.
  if(direction==='NEUTRAL'&&last&&last.age<=8){
    direction=last.direction;
  }

  if(direction==='BULLISH'&&protectedLow&&price<protectedLow.price)direction='NEUTRAL';
  if(direction==='BEARISH'&&protectedHigh&&price>protectedHigh.price)direction='NEUTRAL';

  // A break against the established trend is a CHOCH. A break in the same direction
  // is BOS. MSS is reserved for a recent CHOCH/BOS event rather than a generic trend flag.
  let bos=null,choch=null;
  if(last){
    if(rawDirection!=='NEUTRAL'&&last.direction!==rawDirection)choch={...last,type:'CHoCH'};
    else bos={...last,type:'BOS'};
  }
  const mss=(choch||bos)&&((choch||bos).age<=8)?{...(choch||bos),type:'MSS'}:null;

  const a=atr(c.slice(0,asOf+1),14)||Math.max(price*.001,1e-9);
  const avg=rangeAverage(c.slice(0,asOf+1),20)||a;
  const recentRanges=c.slice(Math.max(0,asOf-9),asOf+1).map(x=>x.high-x.low);
  const recent=recentRanges.length?recentRanges.reduce((q,v)=>q+v,0)/recentRanges.length:avg;
  const compression=recent<avg*.72,expansion=recent>avg*1.28;
  const state=direction==='BULLISH'?'TRENDING_BULLISH':direction==='BEARISH'?'TRENDING_BEARISH':(compression?'COMPRESSION':'RANGE_OR_TRANSITION');
  const rangeSlice=c.slice(Math.max(0,asOf-40),asOf+1);
  return {
    state,direction,trend:direction==='NEUTRAL'?'RANGE':direction,
    rawDirection,structureBreak:last,
    internal,external,swings,hh,hl,lowerHigh,lowerLow,
    bos,choch,mss,protectedHigh,protectedLow,
    range:{high:Math.max(...rangeSlice.map(x=>x.high)),low:Math.min(...rangeSlice.map(x=>x.low))},
    compression,expansion,atr:a,previousBreak:prior
  };
}

export function rankStructuralTargets(c,direction,entry,{layers=[],minDistance=0,nativeTargets=[],asOf=null,asOfTime=null}={}){
  if(!Array.isArray(c)||!c.length||!Number.isFinite(entry)||!['BULLISH','BEARISH'].includes(direction))return [];
  const a=atr(c,14)||Math.max(Math.abs(entry)*.001,1e-9);
  const distanceFloor=Math.max(minDistance,a*1.5,Math.abs(entry)*.005);
  const clusterTolerance=Math.max(a*.35,Math.abs(entry)*.0015);
  const candidates=[];

  const add=(price,source,index=-1,tf='EXECUTION',strength=0,meta={})=>{
    if(!Number.isFinite(price))return;
    if(asOf!==null&&tf==='EXECUTION'&&Number.isFinite(index)&&index>=0&&index>asOf)return;
    // A swing is not usable until its right-side candles confirm it. Filtering
    // by the pivot candle's timestamp alone leaks future-confirmed structure
    // into historical decisions, because the pivot itself predates confirmation.
    if(asOf!==null&&tf==='EXECUTION'&&Number.isFinite(meta?.confirmationIndex)&&meta.confirmationIndex>asOf)return;
    if(asOfTime!==null&&Number.isFinite(meta?.time)&&meta.time>asOfTime)return;
    const beyond=direction==='BULLISH'?price>entry:price<entry;
    if(!beyond||Math.abs(price-entry)<distanceFloor)return;
    candidates.push({price,source,index,tf,strength,...meta});
  };

  // Strategy-native objectives outrank generic structure when they are valid.
  for(const x of nativeTargets||[]){
    if(Number.isFinite(x?.price))add(x.price,x.source||'STRATEGY_NATIVE',x.index??-1,x.tf||'STRATEGY',120,{native:true,time:x.time});
    else if(Number.isFinite(x))add(x,'STRATEGY_NATIVE',-1,'STRATEGY',120,{native:true});
  }

  // Major external swings: k=4 is deliberately harder to form than the
  // execution pivots and therefore represents a more meaningful structural objective.
  for(const k of [4,3]){
    const s=confirmedSwings(c,k);
    const points=direction==='BULLISH'?s.highs:s.lows;
    for(const x of points){
      add(x.price,k===4?'EXECUTION_MAJOR_SWING':'EXECUTION_EXTERNAL_SWING',x.index,'EXECUTION',k===4?95:78,{
        confirmationIndex:x.confirmationIndex,
        time:c[x.confirmationIndex]?.time??x.time
      });
    }
  }

  // Higher-timeframe external structure is preferred over an isolated
  // execution wick when the same price objective is visible there.
  for(const layer of layers||[]){
    const lc=layer?.candles;
    if(!Array.isArray(lc)||lc.length<20)continue;
    for(const k of [4,3]){
      const s=confirmedSwings(lc,k);
      const points=direction==='BULLISH'?s.highs:s.lows;
      for(const x of points){
        add(x.price,k===4?'HTF_MAJOR_SWING':'HTF_EXTERNAL_SWING',x.index,layer.tf||'HTF',k===4?110:88,{
          confirmationIndex:x.confirmationIndex,
          time:lc[x.confirmationIndex]?.time??x.time
        });
      }
    }
  }

  // Collapse repeated highs/lows into liquidity/structure pools. A level
  // seen more than once is materially stronger than a single isolated pivot.
  const priceOrder=candidates.map((candidate,index)=>({price:candidate.price,index})).sort((a,b)=>a.price-b.price||a.index-b.index);
  let left=0,right=0;
  for(let i=0;i<priceOrder.length;i++){
    const current=priceOrder[i];
    while(left<priceOrder.length&&current.price-priceOrder[left].price>clusterTolerance)left++;
    if(right<i)right=i;
    while(right+1<priceOrder.length&&priceOrder[right+1].price-current.price<=clusterTolerance)right++;
    const candidate=candidates[current.index];
    candidate.clusterCount=right-left+1;
    candidate.pool=candidate.clusterCount>=3?'LIQUIDITY_POOL':candidate.clusterCount===2?'REPEATED_STRUCTURE':'SINGLE_STRUCTURE';
    candidate.quality=candidate.strength+(candidate.clusterCount>=3?24:candidate.clusterCount===2?14:0)+(candidate.tf!=='EXECUTION'?8:0)+(candidate.native?20:0);
  }

  return candidates
    .filter(x=>x.quality>=90 || x.clusterCount>=2 || x.native)
    .sort((a,b)=>b.quality-a.quality||Math.abs(a.price-entry)-Math.abs(b.price-entry))
    .slice(0,12);
}

export function selectStructuralTarget(c,direction,entry,options={}){
  const candidates=rankStructuralTargets(c,direction,entry,options);
  if(!candidates.length)return null;
  const a=atr(c,14)||Math.max(Math.abs(entry)*.001,1e-9);
  // Do not choose a distant high-scoring HTF pool merely because its quality
  // number outranks a nearer executable objective. Targets beyond this range
  // are not valid execution-timeframe take-profits.
  const maxDistance=Math.max(a*12,Math.abs(entry)*.05);
  const plausible=candidates.filter(x=>Math.abs(x.price-entry)<=maxDistance);
  if(!plausible.length)return null;
  // Preserve strategy-native objectives when they are realistically reachable;
  // otherwise choose the nearest meaningful structural objective. Quality only
  // breaks ties between similarly distant levels, not at the expense of target
  // realism or a coherent stop/target pair.
  const native=plausible.filter(x=>x.native)
    .sort((x,y)=>Math.abs(x.price-entry)-Math.abs(y.price-entry)||y.quality-x.quality)[0];
  if(native)return native;
  return plausible.sort((x,y)=>Math.abs(x.price-entry)-Math.abs(y.price-entry)||y.quality-x.quality)[0]||null;
}

export function displacement(c,direction,asOf=c.length-1){
  const a=atr(c.slice(0,asOf+1),14),avg=rangeAverage(c.slice(0,asOf+1),20);
  if(!a||!avg)return null;
  for(let i=asOf;i>=Math.max(1,asOf-10);i--){
    const x=c[i],r=x.high-x.low;
    if(r<avg*1.25||r<a||bodyRatio(x)<.55)continue;
    if(direction==='BULLISH'&&x.close>x.open&&x.close>=x.high-r*.22)return{index:i,range:r,body:Math.abs(x.close-x.open),atrMultiple:r/a};
    if(direction==='BEARISH'&&x.close<x.open&&x.close<=x.low+r*.22)return{index:i,range:r,body:Math.abs(x.close-x.open),atrMultiple:r/a};
  }
  return null;
}

export function rejection(c,level,zone,direction){
  const recent=c.slice(-4),x=c.at(-1);
  if(!x)return false;
  const touched=recent.some(k=>k.low<=level+zone&&k.high>=level-zone);
  if(!touched)return false;
  const r=x.high-x.low,wick=direction==='BULLISH'?Math.min(x.open,x.close)-x.low:x.high-Math.max(x.open,x.close);
  return r>0&&bodyRatio(x)>=.3&&wick/r>=.25&&(direction==='BULLISH'?x.close>level:x.close<level);
}
