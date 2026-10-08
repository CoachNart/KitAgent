import {atr} from './data.js';
const VALID_GRADES=['A+','A','B','C','NO-TRADE'];

export function noTrade(failures=[]){
  return {
    grade:'NO-TRADE',
    score:0,
    hardFailures:[...new Set(failures.filter(Boolean))]
  };
}

function clamp(n,min=0,max=1){return Math.max(min,Math.min(max,Number.isFinite(n)?n:0));}
function ageQuality(age,fresh=2,recent=5){
  if(!Number.isFinite(age))return 0;
  if(age<=fresh)return 1;
  if(age<=recent)return .7;
  if(age<=8)return .35;
  return 0;
}
function targetQuality(target={}){
  const source=String(target.source||'').toUpperCase();
  let q=0.55;
  if(target.native||source.includes('CRT_OPPOSITE')||source.includes('IMPULSE_EXTREME'))q=.95;
  else if(source.includes('HTF_MAJOR'))q=.95;
  else if(source.includes('MAJOR_SWING'))q=.88;
  else if(source.includes('EXTERNAL')||source.includes('MSNR'))q=.78;
  if(target.pool==='LIQUIDITY_POOL')q=Math.max(q,.96);
  else if(target.pool==='REPEATED_STRUCTURE')q=Math.max(q,.88);
  if(Number.isFinite(target.quality))q=Math.max(q,clamp((target.quality-78)/32));
  return clamp(q);
}

function opportunityQuality(target={}){
  const rr=Number(target.rr);
  if(!Number.isFinite(rr)||rr<1.8)return 0;
  if(rr<2.0)return .55;
  if(rr<2.5)return .78;
  if(rr<3.0)return .9;
  return 1;
}

// Confidence is a structural quality score, not a statistical win probability.
// Trade economics are part of the delivery decision: a setup must have a
// meaningful structural objective and at least 1.8R before it can be graded.
export function gradeSetup({strategy,context={},entry={},risk={},target={},confirmation={},freshness={}}={}){
  const contextScore=15*clamp(context.aligned?1:0)*(context.trend?1:.72);
  const entryScore=25*(clamp(entry.anchorQuality)*.65+clamp(entry.executionQuality)*.35);
  const riskScore=20*(clamp(risk.invalidationQuality)*.7+clamp(risk.geometryQuality)*.3);
  const targetScore=15*targetQuality(target)+5*opportunityQuality(target);
  const confirmationScore=10*clamp(confirmation.quality);
  const freshnessScore=10*clamp(freshness.quality ?? ageQuality(freshness.age,freshness.fresh,freshness.recent));
  const opportunity=opportunityQuality(target);
  const economicFailure=opportunity===0?'Trade opportunity is not worth delivering: the structural objective does not provide at least 1.8R from the proposed entry and invalidation.':null;
  if(economicFailure)return {grade:'NO-TRADE',score:0,hardFailures:[economicFailure],confidenceEvidence:[]};
  let score=contextScore+entryScore+riskScore+targetScore+confirmationScore+freshnessScore;
  // Keep scores honest: a completed contract starts at the mid/high 70s;
  // 90+ requires strong structural evidence across independent dimensions.
  score=Math.round(Math.max(0,Math.min(100,score)));
  const grade=score>=92?'A+':score>=84?'A':score>=75?'B':score>=65?'C':'NO-TRADE';
  const evidence=[
    {type:'CONFIDENCE_CONTEXT',score:Math.round(contextScore),max:15},
    {type:'CONFIDENCE_ENTRY',score:Math.round(entryScore),max:25},
    {type:'CONFIDENCE_RISK',score:Math.round(riskScore),max:20},
    {type:'CONFIDENCE_TARGET',score:Math.round(targetScore),max:20},
    {type:'CONFIDENCE_CONFIRMATION',score:Math.round(confirmationScore),max:10},
    {type:'CONFIDENCE_FRESHNESS',score:Math.round(freshnessScore),max:10},
    {type:'CONFIDENCE_MODEL',strategy,score,interpretation:'structural quality, not win probability'}
  ];
  return {grade,score,hardFailures:[],confidenceEvidence:evidence};
}

export function validateTradeGeometry({trade,direction,candles=[]}={}){
  const failures=[];
  if(!trade||!['BULLISH','BEARISH'].includes(direction))return {valid:false,failures:['Missing directional trade geometry.']};
  const entry=Number(trade.entry),stop=Number(trade.stop),target=Number(trade.target);
  if(![entry,stop,target].every(Number.isFinite))return {valid:false,failures:['Entry, stop, and target must be finite prices.']};
  if(direction==='BULLISH'&&(stop>=entry||target<=entry))failures.push('Bullish geometry is directionally invalid.');
  if(direction==='BEARISH'&&(stop<=entry||target>=entry))failures.push('Bearish geometry is directionally invalid.');
  const risk=Math.abs(entry-stop),reward=Math.abs(target-entry);
  const rr=risk>0?reward/risk:0;
  const a=atr(candles,14)||0;
  const zone=trade.entryZone;
  if(zone){
    const low=Number(zone.low),high=Number(zone.high);
    if(!(Number.isFinite(low)&&Number.isFinite(high)&&low<=high))
      failures.push('Entry zone is malformed; the setup has no valid execution area.');
    else{
      const zoneTolerance=Math.max(a*.35,Math.abs(entry)*.0015);
      if(entry<low-zoneTolerance||entry>high+zoneTolerance)
        failures.push('Entry is outside the strategy-defined execution zone; the planned entry is not at the structural setup area.');
    }
  }
  const invalidationPrice=Number(trade.invalidationPrice);
  if(Number.isFinite(invalidationPrice)){
    if(direction==='BULLISH'){
      if(!(invalidationPrice<entry&&stop<invalidationPrice))
        failures.push('Bullish stop is not beyond the actual structural invalidation level.');
    }else if(direction==='BEARISH'){
      if(!(invalidationPrice>entry&&stop>invalidationPrice))
        failures.push('Bearish stop is not beyond the actual structural invalidation level.');
    }
  }else if(trade.invalidationSource){
    failures.push('Trade declares an invalidation source but no numeric invalidation price.');
  }
  if(!(risk>0&&reward>0))failures.push('Trade must have positive structural risk and reward.');
  // A stop inside normal execution noise is not a structural invalidation.
  // Use ATR rather than a fixed percentage so the rule scales by instrument.
  if(a>0&&risk<a*.35)failures.push('Stop is inside normal execution noise; invalidation is too tight for the market volatility.');
  // R:R is evaluated as part of opportunity quality before a setup can receive
  // an executable grade. Geometry remains responsible only for structural validity.
  // Target distance is still validated against market volatility as a second structural check.
  if(a>0&&reward<Math.max(a,Math.abs(entry)*.0035))
    failures.push('Structural target is too close to the entry for the current market volatility.');
  // Conversely, an excessively wide stop relative to current volatility usually
  // means the strategy anchored invalidation to an unrelated structure point.
  if(a>0&&risk>a*3)failures.push('Stop is excessively wide relative to execution volatility; invalidation is likely anchored to unrelated structure.');
  return {valid:failures.length===0,failures,metrics:{atr:a,risk,reward,rr}};
}

export {VALID_GRADES};
