const TF_MS={ '15m':900000,'30m':1800000,'1H':3600000,'2H':7200000,'4H':14400000,'1D':86400000,'1W':604800000 };
export const EXECUTION_TIMEFRAMES=['15m','30m','1H','2H','4H'];
export const CONTEXT_CHAIN=['4H','2H','1H','30m','15m'];
export function normalizeRows(rows){
 const byTime=new Map();
 for(const r of rows||[]){
  const x={time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+(r[5]??0)};
  if(![x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)||x.time<=0||x.high<x.low||x.open<0||x.close<0)continue;
  if(x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close))continue;
  byTime.set(x.time,x);
 }
 return [...byTime.values()].sort((a,b)=>a.time-b.time);
}
export function closedCandles(c,tf,now=Date.now()){
 if(!Array.isArray(c)||c.length<3)return[];
 const x=c.at(-1),iv=TF_MS[tf];
 return Number.isFinite(iv)&&now-x.time<iv&&now-x.time>=0?c.slice(0,-1):c;
}
export function validateCandles(c,tf){
 const failures=[];
 if(!Array.isArray(c)||c.length<80)failures.push('insufficient closed candles');
 let prev=0;
 for(let i=0;i<(c||[]).length;i++){
  const x=c[i];
  if(i&&x.time<=prev)failures.push('candles are not strictly chronological');
  if(i&&x.time-prev!==TF_MS[tf])failures.push('missing or irregular candle interval');
  if(x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close)||x.high<x.low)failures.push('invalid OHLC candle');
  prev=x.time;
 }
 return {valid:failures.length===0,failures:[...new Set(failures)]};
}
export function aggregate(rows,tf){
 const iv=TF_MS[tf]; if(!iv)return rows;
 const buckets=new Map();
 for(const x of rows||[]){
  const bucket=Math.floor(x.time/iv)*iv;
  const b=buckets.get(bucket);
  if(!b)buckets.set(bucket,{time:bucket,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume});
  else{b.high=Math.max(b.high,x.high);b.low=Math.min(b.low,x.low);b.close=x.close;b.volume+=x.volume}
 }
 return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
export function atr(c,n=14){
 if(!Array.isArray(c)||c.length<n+1)return null;
 const tr=[];for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));
 const v=tr.slice(-n);return v.reduce((a,b)=>a+b,0)/v.length;
}
export function bodyRatio(x){const r=x.high-x.low;return r>0?Math.abs(x.close-x.open)/r:0}
export function rangeAverage(c,n=20){const v=(c||[]).slice(-n).map(x=>x.high-x.low).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
export function roundPrice(v){if(!Number.isFinite(v))return null;if(v>=1000)return+v.toFixed(2);if(v>=100)return+v.toFixed(3);if(v>=1)return+v.toFixed(5);if(v>=.1)return+v.toFixed(6);return+v.toPrecision(7)}
