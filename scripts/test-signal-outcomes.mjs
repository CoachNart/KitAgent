import {resolveStatus} from '../api/signals.js';
import {isCandleWithinWindow,pendingEntryDeadline} from '../server/market-engine/execution-window.js';

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
assert('Historical 1H replay accepts the final fully-contained hour of the live window',isCandleWithinWindow(pendingStart+23*60*60*1000,pendingStart,60*60*1000,24*60*60*1000));
assert('Historical 1H replay rejects an entry candle beginning at the 24-hour deadline',!isCandleWithinWindow(pendingStart+24*60*60*1000,pendingStart,60*60*1000,24*60*60*1000));
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

  globalThis.fetch=mockKlines([
    row(candleStart,100,101,99,100.5),
    row(nextCandle,100.5,100.8,97.5,98)
  ]);
  const legacyLimit={...baseSignal,limitEntry:null};
  const legacyOutcome=await resolveStatus(legacyLimit,98);
  assert('Legacy LIMIT records fall back to their recorded entry instead of treating null as price zero',
    legacyOutcome.status==='stop_hit'&&legacyOutcome.result==='loss');

  globalThis.fetch=mockKlines([
    row(candleStart,101,101.5,100.4,100.8),
    row(nextCandle,100.8,101,100.6,100.7)
  ]);
  const marketSignal={...baseSignal,orderType:'MARKET',status:'watching',entry:100,marketEntry:101,currentPrice:101,stopLoss:100.5,takeProfit1:103};
  const marketOutcome=await resolveStatus(marketSignal,100.7);
  assert('Market-order P&L is measured from executable market entry, not planned structural level',
    marketOutcome.status==='stop_hit'&&Number(marketOutcome.pnlPercent)<0);

  const alreadyAmbiguous={...baseSignal,status:'activation_ambiguous',outcomeEvidence:{event:'ENTRY_AND_EXIT_SAME_CANDLE'}};
  const unchanged=await resolveStatus(alreadyAmbiguous,97.5);
  assert('Previously ambiguous limit activation remains excluded from verified outcomes',
    unchanged.status==='activation_ambiguous'&&unchanged.closedAt==null);
}finally{
  globalThis.fetch=originalFetch;
}
