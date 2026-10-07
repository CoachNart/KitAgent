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

export {VALID_GRADES};
