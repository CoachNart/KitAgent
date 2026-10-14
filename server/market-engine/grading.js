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

// Quality scores describe the strength of structural evidence, not a
// statistical win probability. R:R is reported separately; publication requires
// at least 3R plus structurally meaningful, executable entry/stop/target geometry.
export function gradeSetup({strategy,context={},entry={},risk={},target={},confirmation={},freshness={}}={}){
  const contextScore=15*clamp(context.aligned?1:0)*(context.trend?1:.72);
  const entryScore=25*(clamp(entry.anchorQuality)*.65+clamp(entry.executionQuality)*.35);
  const riskScore=20*(clamp(risk.invalidationQuality)*.7+clamp(risk.geometryQuality)*.3);
  const targetScore=20*targetQuality(target);
  const confirmationScore=10*clamp(confirmation.quality);
  const freshnessScore=10*clamp(freshness.quality ?? ageQuality(freshness.age,freshness.fresh,freshness.recent));
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

export function executableTrade(trade,direction,livePrice){
  if(!trade||typeof trade!=='object')return null;
  const normalized={...trade};
  if(String(trade.orderType||'').toUpperCase()!=='MARKET')return normalized;
  const plannedEntry=Number(trade.entry);
  const entry=Number(livePrice??trade.marketEntry??trade.currentPrice);
  const stop=Number(trade.stop),target=Number(trade.target);
  if(![plannedEntry,entry,stop,target].every(Number.isFinite))return normalized;
  const risk=Math.abs(entry-stop),reward=Math.abs(target-entry);
  return {
    ...normalized,
    plannedEntry,
    entry,
    marketEntry:entry,
    risk,
    reward,
    rr:risk>0?reward/risk:0,
    executionPriceSource:'market_quote_at_signal_time'
  };
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
  if(!zone){
    failures.push('Trade has no explicit structural entry zone; an unanchored entry is not publishable.');
  }else{
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
  if(!Number.isFinite(invalidationPrice)){
    failures.push('Trade has no numeric structural invalidation anchor; arbitrary stop placement is not publishable.');
  }else if(direction==='BULLISH'){
    if(!(invalidationPrice<entry&&stop<invalidationPrice))
      failures.push('Bullish stop is not beyond the actual structural invalidation level.');
    else if(a>0&&invalidationPrice-stop<Math.max(a*.08,Math.abs(entry)*.00015))
      failures.push('Bullish stop buffer beyond structural invalidation is too small for execution noise.');
  }else{
    if(!(invalidationPrice>entry&&stop>invalidationPrice))
      failures.push('Bearish stop is not beyond the actual structural invalidation level.');
    else if(a>0&&stop-invalidationPrice<Math.max(a*.08,Math.abs(entry)*.00015))
      failures.push('Bearish stop buffer beyond structural invalidation is too small for execution noise.');
  }
  if(!String(trade.invalidationSource||'').trim())
    failures.push('Trade has no named structural invalidation source.');
  if(!(risk>0&&reward>0))failures.push('Trade must have positive structural risk and reward.');
  // KitSetups publication contract: never publish a setup below 3R. This is
  // a hard eligibility filter, not permission to move the stop or invent a
  // distant target. If genuine structure cannot offer 3R, return NO-TRADE.
  if(risk>0&&reward>0&&rr<3)
    failures.push('Projected R:R is below the 3R minimum; do not publish or distort structural levels to force a trade.');
  // Structural stops must clear ordinary candle noise by a meaningful margin.
  // This prevents tiny retest-candle stops from manufacturing enormous R:R.
  if(a>0&&risk<Math.max(a*.45,Math.abs(entry)*.001))
    failures.push('Stop is too tight relative to ATR/price; the structural invalidation is not safely executable.');
  if(a>0&&reward<Math.max(a,Math.abs(entry)*.0035))
    failures.push('Structural target is too close to the entry for the current market volatility.');
  if(a>0&&risk>a*3)
    failures.push('Stop is excessively wide relative to execution volatility; invalidation is likely anchored to unrelated structure.');
  // A target many ATRs away or a very high R multiple usually signals a
  // mismatched stop/target pair, not a realistic nearby structural objective.
  // Reject rather than publish an impressive but misleading headline R:R.
  if(a>0&&reward>a*12)
    failures.push('Target is too far from entry for this execution timeframe; select the nearest valid structural objective or return NO-TRADE.');
  if(rr>10)
    failures.push('R:R exceeds 10R; stop/target geometry is likely mismatched and must be rebuilt or rejected.');
  return {valid:failures.length===0,failures,metrics:{atr:a,risk,reward,rr}};
}

export {VALID_GRADES};
