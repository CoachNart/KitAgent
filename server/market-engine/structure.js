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

export function confirmedSwings(c,k=2){
  const highs=[],lows=[];
  for(let i=k;i<c.length-k;i++){
    const p=pivot(c,i,k);
    if(!p)continue;
    const confirmationIndex=i+k;
    if(p.high)highs.push({price:c[i].high,index:i,confirmationIndex,time:c[i].time});
    if(p.low)lows.push({price:c[i].low,index:i,confirmationIndex,time:c[i].time});
  }
  return {highs,lows};
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

function breakEvents(c,highs,lows,asOf){
  const events=[];
  for(const x of highs){
    for(let i=x.confirmationIndex;i<=asOf;i++){
      if(c[i].close>x.price){
        events.push({type:'BOS',direction:'BULLISH',level:x.price,index:i,brokenSwingIndex:x.index,age:asOf-i});
        break;
      }
    }
  }
  for(const x of lows){
    for(let i=x.confirmationIndex;i<=asOf;i++){
      if(c[i].close<x.price){
        events.push({type:'BOS',direction:'BEARISH',level:x.price,index:i,brokenSwingIndex:x.index,age:asOf-i});
        break;
      }
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
  const events=breakEvents(c,eh,el,asOf);
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
        time:x.time
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
          confirmationIndex:x.confirmationIndex
        });
      }
    }
  }

  // Collapse repeated highs/lows into liquidity/structure pools. A level
  // seen more than once is materially stronger than a single isolated pivot.
  for(const candidate of candidates){
    const peers=candidates.filter(x=>Math.abs(x.price-candidate.price)<=clusterTolerance);
    candidate.clusterCount=peers.length;
    candidate.pool=peers.length>=3?'LIQUIDITY_POOL':peers.length===2?'REPEATED_STRUCTURE':'SINGLE_STRUCTURE';
    candidate.quality=candidate.strength
      +(candidate.clusterCount>=3?24:candidate.clusterCount===2?14:0)
      +(candidate.tf!=='EXECUTION'?8:0)
      +(candidate.native?20:0);
  }

  return candidates
    .filter(x=>x.quality>=90 || x.clusterCount>=2 || x.native)
    .sort((a,b)=>b.quality-a.quality||Math.abs(a.price-entry)-Math.abs(b.price-entry))
    .slice(0,12);
}

export function selectStructuralTarget(c,direction,entry,options={}){
  return rankStructuralTargets(c,direction,entry,options)[0]||null;
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
