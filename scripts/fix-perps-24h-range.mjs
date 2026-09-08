import fs from 'node:fs';

const path='src/PerpetualsPage.jsx';
let s=fs.readFileSync(path,'utf8');
const anchor="const c=m?.[1]?.[i]||{};const mid=Number(c?.midPx||c?.markPx||0);";
if(!s.includes(anchor)) throw new Error('Hyperliquid ticker block not found.');
if(!s.includes('const dayHigh=')) s=s.replace(anchor,"const c=m?.[1]?.[i]||{};const dayRange=await info({type:'candleSnapshot',req:{coin:symbol,interval:'1h',startTime:Date.now()-86400000,endTime:Date.now()}}).catch(()=>[]);const dayHigh=dayRange.length?Math.max(...dayRange.map(x=>Number(x.h))):undefined;const dayLow=dayRange.length?Math.min(...dayRange.map(x=>Number(x.l))):undefined;const mid=Number(c?.midPx||c?.markPx||0);");
s=s.replace('highPrice24h:c?.highPx,lowPrice24h:c?.lowPx','highPrice24h:dayHigh,lowPrice24h:dayLow');
fs.writeFileSync(path,s);
console.log('Trading terminal 24h High/Low now comes from live Hyperliquid 1h candles for the last 24 hours.');
