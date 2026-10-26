import {parseBybitCsv} from './replay-bybit-csv.mjs';
import {executionEntry,validTradeGeometry,rMultiple} from '../server/market-engine/replay-execution.js';

let passed=0;
function assert(name,fn){
  try{
    if(!fn())throw new Error('assertion returned false');
    passed++;console.log('PASS:',name);
  }catch(error){console.error('FAIL:',name,error?.message||error);process.exitCode=1;}
}
const rows=['startTime,open,high,low,close,volume'];
for(let i=0;i<85;i++){
  const time=Date.UTC(2026,0,1,0)+i*3600000;
  rows.push([time,100,102,99,101,12].join(','));
}
const csv=rows.join('\n');
assert('Parses Bybit startTime header and millisecond timestamps',()=>parseBybitCsv(csv).length===85&&parseBybitCsv(csv)[0].time===Date.UTC(2026,0,1,0));
assert('Normalizes out-of-order rows chronologically',()=>{
  const reordered=[rows[0],rows[2],rows[1],...rows.slice(3)].join('\n');
  const parsed=parseBybitCsv(reordered);return parsed.length===85&&parsed[0].time<Date.parse('2026-01-01T01:00:00Z');
});
assert('Accepts ISO timestamps and common OHLCV header names',()=>{
  const header='timestamp,open,high,low,close,volume';
  const data=Array.from({length:80},(_,i)=>[new Date(Date.UTC(2026,0,1)+i*3600000).toISOString(),100,102,99,101,1].join(','));
  return parseBybitCsv([header,...data].join('\n')).length===80;
});
assert('Rejects missing required OHLC columns',()=>{
  try{parseBybitCsv('timestamp,open,close\n2026-01-01,1,1');return false;}catch{return true;}
});
assert('Rejects CSV with fewer than 80 valid candles',()=>{
  try{parseBybitCsv('timestamp,open,high,low,close\n'+Array.from({length:10},(_,i)=>[Date.UTC(2026,0,1)+i*3600000,100,102,99,101].join(',')).join('\n'));return false;}catch(e){return /minimum 80/.test(e.message);}
});
assert('Market-order replay uses executable marketEntry instead of planned structure level',()=>{
  const trade={entry:100,marketEntry:102,stop:99,target:108};
  return executionEntry(trade,'MARKET')===102;
});
assert('Limit-order replay preserves the planned entry',()=>{
  const trade={entry:100,marketEntry:102,stop:99,target:108};
  return executionEntry(trade,'LIMIT')===100;
});
assert('Replay validates stop and target relative to the actual market fill',()=>{
  return validTradeGeometry(102,99,108,'BULLISH')&&!validTradeGeometry(102,103,108,'BULLISH');
});
assert('Replay R multiple uses actual market fill and actual risk distance',()=>{
  const trade={entry:100,marketEntry:102,stop:99};
  return Math.abs(rMultiple(trade,'BULLISH',108,'MARKET')-2)<1e-9;
});
assert('Replay rejects a bearish market fill whose target/stop geometry is inverted',()=>{
  return !validTradeGeometry(98,97,101,'BEARISH');
});
console.log('Bybit CSV and replay execution tests:',passed,'passed');
if(passed!==10)process.exitCode=1;
