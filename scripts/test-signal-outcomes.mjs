import {resolveStatus} from '../api/signals.js';

const assert=(name,condition)=>{
  if(!condition)throw new Error('FAIL: '+name);
  console.log('PASS: '+name);
};
const originalFetch=globalThis.fetch;
const minute=Math.floor(Date.now()/60000)*60000;
const generatedAt=new Date(minute-4*60000).toISOString();
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
function mockKlines(candles){
  // Bybit returns newest first; marketKlines must normalize chronological order.
  return async()=>({ok:true,json:async()=>({retCode:0,result:{list:candles.slice().reverse()}})});
}
try{
  globalThis.fetch=mockKlines([
    row(minute-4*60000,100,101,97,99),
    row(minute-3*60000,99,100,96,97)
  ]);
  const ambiguous=await resolveStatus(baseSignal,96);
  assert('Limit entry and stop in the same candle are not counted as a verified loss',
    ambiguous.status==='activation_ambiguous'&&ambiguous.closedAt==null&&ambiguous.pnlPercent==null&&ambiguous.outcomeEvidence?.event==='ENTRY_AND_EXIT_SAME_CANDLE');

  globalThis.fetch=mockKlines([
    row(minute-4*60000,100,101,99,100.5),
    row(minute-3*60000,100,100.5,97,97.5)
  ]);
  const verified=await resolveStatus(baseSignal,97.5);
  assert('A clean entry candle followed by a later stop candle resolves as a loss',
    verified.status==='stop_hit'&&verified.result==='loss'&&verified.closedAt!=null&&verified.outcomeEvidence?.event==='STOP_TOUCH');

  globalThis.fetch=mockKlines([
    row(minute-4*60000,100,101,99,100.5),
    row(minute-3*60000,100.5,100.8,97.5,98)
  ]);
  const legacyLimit={...baseSignal,limitEntry:null};
  const legacyOutcome=await resolveStatus(legacyLimit,98);
  assert('Legacy LIMIT records fall back to their recorded entry instead of treating null as price zero',
    legacyOutcome.status==='stop_hit'&&legacyOutcome.result==='loss');

  globalThis.fetch=mockKlines([
    row(minute-4*60000,101,101.5,100.4,100.8),
    row(minute-3*60000,100.8,101,100.6,100.7)
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
