import {resolveStatus,selectOutcomeBatch} from '../api/signals.js';
import {isCandleWithinWindow,pendingEntryDeadline,isCompleteCandleWindow} from '../server/market-engine/execution-window.js';

const assert=(name,condition)=>{
  if(!condition)throw new Error('FAIL: '+name);
  console.log('PASS: '+name);
};
const originalFetch=globalThis.fetch;
const pendingStart=Date.UTC(2026,0,1);
const publicationTime=pendingStart;
const oldSweepTime=publicationTime-18*60*60*1000;
const publicationDeadline=pendingEntryDeadline(publicationTime,24*60*60*1000);
assert('Pending order receives a full 24-hour window from publication, not the earlier sweep',publicationDeadline===publicationTime+24*60*60*1000&&publicationDeadline>oldSweepTime+24*60*60*1000);
assert('A limit entry remains eligible late in its publication window even when the sweep was 18 hours earlier',isCandleWithinWindow(publicationTime+23*60*60*1000,publicationTime,60*60*1000,publicationDeadline-publicationTime));
assert('Pending limit entry accepts a 30-minute candle fully inside the 24-hour window',isCandleWithinWindow(pendingStart+23.5*60*60*1000,pendingStart,30*60*1000,24*60*60*1000));
assert('Pending limit entry rejects a candle that closes after the 24-hour deadline',!isCandleWithinWindow(pendingStart+24*60*60*1000,pendingStart,30*60*1000,24*60*60*1000));
const fullPendingWindow=Array.from({length:48},(_,i)=>({time:pendingStart+i*30*60*1000}));
const gapPendingWindow=fullPendingWindow.filter((_,i)=>i!==12);
const lateStartPendingWindow=fullPendingWindow.slice(2);
assert('Pending expiry requires a complete, contiguous 24-hour 30m candle window',
  isCompleteCandleWindow(fullPendingWindow,pendingStart,pendingStart+24*60*60*1000,30*60*1000));
assert('Missing candles prevent a false pending-order expiry',
  !isCompleteCandleWindow(gapPendingWindow,pendingStart,pendingStart+24*60*60*1000,30*60*1000));
assert('A history window starting too late cannot prove that a pending order never filled',
  !isCompleteCandleWindow(lateStartPendingWindow,pendingStart,pendingStart+24*60*60*1000,30*60*1000));
assert('Historical 1H replay accepts the final fully-contained hour of the live window',isCandleWithinWindow(pendingStart+23*60*60*1000,pendingStart,60*60*1000,24*60*60*1000));
assert('Historical 1H replay rejects an entry candle beginning at the 24-hour deadline',!isCandleWithinWindow(pendingStart+24*60*60*1000,pendingStart,60*60*1000,24*60*60*1000));
const batchFixtures=Array.from({length:25},(_,i)=>({id:'signal-'+i,status:'limit_pending',generatedAt:new Date(Date.UTC(2026,0,1)+i*1000).toISOString()}));
batchFixtures.push({id:'ambiguous-terminal',status:'activation_ambiguous',generatedAt:new Date(Date.UTC(2026,0,1)).toISOString()});
batchFixtures.push({id:'open-ambiguous',status:'open',ambiguousOutcome:true,generatedAt:new Date(Date.UTC(2026,0,1)).toISOString()});
const firstOutcomeBatch=selectOutcomeBatch(batchFixtures,24,0);
const secondOutcomeBatch=selectOutcomeBatch(batchFixtures,24,1);
assert('Outcome polling rotates to older unprocessed signals instead of starving them behind the first 24',
  firstOutcomeBatch.length===24&&secondOutcomeBatch.length===1&&secondOutcomeBatch[0]==='signal-24');
assert('Terminal ambiguous trades do not consume live outcome verification slots',
  !firstOutcomeBatch.includes('ambiguous-terminal')&&!secondOutcomeBatch.includes('ambiguous-terminal')&&!firstOutcomeBatch.includes('open-ambiguous')&&!secondOutcomeBatch.includes('open-ambiguous'));
const candleStart=Math.floor((Date.now()-2*60*60*1000)/1800000)*1800000;
const nextCandle=candleStart+30*60000;
const generatedAt=new Date(candleStart).toISOString();
const baseSignal={
  id:'test-limit-signal',
  market:'perpetual',
  symbol:'BTCUSDT',
  direction:'LONG',
  orderType:'LIMIT',
  entry:100,
  limitEntry:100,
  stopLoss:98,
  takeProfit1:104,
  generatedAt,
  status:'limit_pending'
};
const row=(time,open,high,low,close)=>[String(time),String(open),String(high),String(low),String(close),'1000'];
let requestedInterval=null;
function mockKlines(candles){
  // Bybit returns newest first; marketKlines must normalize chronological order.
  return async(input)=>{requestedInterval=new URL(String(input)).searchParams.get('interval');return {ok:true,json:async()=>({retCode:0,result:{list:candles.slice().reverse()}})}};
}
try{
  globalThis.fetch=mockKlines([
    row(candleStart,100,101,97,99),
    row(nextCandle,99,100,96,97)
  ]);
  const ambiguous=await resolveStatus(baseSignal,96);
  assert('Signal outcome verification requests 30m candles',requestedInterval==='30');
  assert('Limit entry and stop in the same candle are not counted as a verified loss',
    ambiguous.status==='activation_ambiguous'&&ambiguous.closedAt==null&&ambiguous.pnlPercent==null&&ambiguous.outcomeEvidence?.event==='ENTRY_AND_EXIT_SAME_CANDLE');

  globalThis.fetch=mockKlines([
    row(candleStart,100,101,99,100.5),
    row(nextCandle,100,100.5,97,97.5)
  ]);
  const verified=await resolveStatus(baseSignal,97.5);
  assert('A clean entry candle followed by a later stop candle resolves as a loss',
    verified.status==='stop_hit'&&verified.result==='loss'&&verified.closedAt!=null&&verified.outcomeEvidence?.event==='STOP_TOUCH');
  assert('A LIMIT activation timestamp is the close of the completed 30m entry candle',
    verified.activatedAt===new Date(nextCandle).toISOString());

  const fallbackHosts=[];
  globalThis.fetch=async input=>{
    const u=new URL(String(input));
    fallbackHosts.push(u.host);
    if(u.host==='api.bybit.com')return{ok:false,status:403};
    return{ok:true,json:async()=>({retCode:0,result:{list:[
      row(candleStart,100,101,99,100.5),
      row(nextCandle,100.5,101,97,97.5)
    ].reverse()}})};
  };
  const fallbackOutcome=await resolveStatus(baseSignal,97.5);
  assert('Live outcome monitoring falls back to another Bybit API host when the primary host is blocked',
    fallbackHosts.includes('api.bybit.com')&&fallbackHosts.includes('api.bytick.com')&&fallbackOutcome.status==='stop_hit');

  globalThis.fetch=mockKlines([
    row(candleStart,100,101,99,100.5),
    row(nextCandle,100.5,100.8,97.5,98)
  ]);
  const legacyLimit={...baseSignal,limitEntry:null};
  const legacyOutcome=await resolveStatus(legacyLimit,98);
  assert('Legacy LIMIT records fall back to their recorded entry instead of treating null as price zero',
    legacyOutcome.status==='stop_hit'&&legacyOutcome.result==='loss');

  globalThis.fetch=mockKlines([
    row(candleStart,101,105,100.5,104.5)
  ]);
  const targetBeforeEntry=await resolveStatus(baseSignal,104.5);
  assert('A pending LIMIT is marked missed when TP trades before its entry fills',
    targetBeforeEntry.status==='missed_entry'&&targetBeforeEntry.result==='missed'&&targetBeforeEntry.outcomeEvidence?.event==='TARGET_REACHED_BEFORE_ENTRY');
  const stableMiss=await resolveStatus(targetBeforeEntry,104.5);
  assert('A missed LIMIT outcome remains terminal on subsequent verification polls',
    stableMiss.status==='missed_entry'&&stableMiss.outcomeEvidence?.event==='TARGET_REACHED_BEFORE_ENTRY');

  const expiredStart=Math.floor((Date.now()-26*60*60*1000)/1800000)*1800000;
  const expiredSignal={...baseSignal,generatedAt:new Date(expiredStart).toISOString()};
  const completeNoFillHistory=Array.from({length:51},(_,i)=>row(expiredStart+i*1800000,101,102,100.5,101.5));
  globalThis.fetch=mockKlines(completeNoFillHistory);
  const expired=await resolveStatus(expiredSignal,101,Date.now());
  assert('A pending LIMIT expires after 24 hours when complete closed-candle history confirms no fill',
    expired.status==='missed_entry'&&expired.result==='missed'&&expired.outcomeEvidence?.event==='LIMIT_WINDOW_EXPIRED');

  globalThis.fetch=mockKlines([]);
  const unverifiable=await resolveStatus(expiredSignal,101,Date.now());
  assert('A pending LIMIT is not falsely marked missed when market history is unavailable',
    unverifiable.status==='limit_pending'&&unverifiable.result==null);

  globalThis.fetch=mockKlines([
    row(candleStart,101,101.5,100.4,100.8),
    row(nextCandle,100.8,101,100.6,100.7)
  ]);
  const marketSignal={...baseSignal,orderType:'MARKET',status:'watching',entry:100,marketEntry:101,currentPrice:101,stopLoss:100.5,takeProfit1:103};
  const marketOutcome=await resolveStatus(marketSignal,100.7);
  assert('Market-order P&L is measured from executable market entry, not planned structural level',
    marketOutcome.status==='stop_hit'&&Number(marketOutcome.pnlPercent)<0);

  globalThis.fetch=mockKlines([
    row(candleStart,100,103,97,100)
  ]);
  const activeAmbiguous={...marketSignal,entry:100,marketEntry:100,currentPrice:100,stopLoss:98,takeProfit1:102};
  const ambiguousActiveOutcome=await resolveStatus(activeAmbiguous,100);
  assert('An active trade touching TP and SL in one closed candle remains unclassified',
    ambiguousActiveOutcome.status==='open'&&ambiguousActiveOutcome.ambiguousOutcome===true&&ambiguousActiveOutcome.closedAt==null&&ambiguousActiveOutcome.result==null);
  const stableAmbiguousActive=await resolveStatus(ambiguousActiveOutcome,100);
  assert('An intrabar-ambiguous active trade is not repeatedly reprocessed or assigned a guessed result',
    stableAmbiguousActive.ambiguousOutcome===true&&stableAmbiguousActive.result==null);

  const alreadyAmbiguous={...baseSignal,status:'activation_ambiguous',outcomeEvidence:{event:'ENTRY_AND_EXIT_SAME_CANDLE'}};
  const unchanged=await resolveStatus(alreadyAmbiguous,97.5);
  const partialCandleStart=Math.floor(Date.now()/1800000)*1800000;
  globalThis.fetch=mockKlines([
    row(partialCandleStart,101,102,99,100.5)
  ]);
  const partialCandle=await resolveStatus(baseSignal,100.5,Date.now());
  assert('An unfinished 30m candle cannot activate or resolve a pending LIMIT',
    partialCandle.status==='limit_pending'&&partialCandle.activatedAt==null);
  assert('Previously ambiguous limit activation remains excluded from verified outcomes',
    unchanged.status==='activation_ambiguous'&&unchanged.closedAt==null);
}finally{
  globalThis.fetch=originalFetch;
}
