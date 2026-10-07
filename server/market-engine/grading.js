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

// Confidence is a structural quality score, not a statistical win probability.
// A-D (setup, entry, risk, target) are prerequisites. Only E-quality/confluence
// differentiates a setup after those contracts pass. R:R is deliberately absent.
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
  if(!(risk>0&&reward>0))failures.push('Trade must have positive structural risk and reward.');
  // A stop inside normal execution noise is not a structural invalidation.
  // Use ATR rather than a fixed percentage so the rule scales by instrument.
  if(a>0&&risk<a*.35)failures.push('Stop is inside normal execution noise; invalidation is too tight for the market volatility.');
  // A target that cannot at least pay for the structural risk is not an
  // executable continuation objective. This is deliberately 1R, not a 2R gate.
  if(rr<1)failures.push('Structural objective does not cover the defined risk; trade geometry is inefficient.');
  // Conversely, an excessively wide stop relative to current volatility usually
  // means the strategy anchored invalidation to an unrelated structure point.
  if(a>0&&risk>a*3)failures.push('Stop is excessively wide relative to execution volatility; invalidation is likely anchored to unrelated structure.');
  return {valid:failures.length===0,failures,metrics:{atr:a,risk,reward,rr}};
}

export {VALID_GRADES};
