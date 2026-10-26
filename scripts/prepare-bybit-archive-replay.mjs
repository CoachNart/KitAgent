import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const root='bybit-archive-data';
const symbols=['BTCUSDT','ETHUSDT'];
await mkdir(root,{recursive:true});

function readRows(source){
  const lines=source.trim().split(/\r?\n/);
  const headers=lines.shift().split(',').map(x=>x.trim().toLowerCase());
  const ix=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const pick=(row,names)=>{for(const n of names){if(ix[n]!=null)return row[ix[n]];}return undefined;};
  return lines.map(line=>{
    const r=line.split(',');
    return {time:Number(pick(r,['timestamp','starttime','time','open_time'])),open:Number(pick(r,['open'])),high:Number(pick(r,['high'])),low:Number(pick(r,['low'])),close:Number(pick(r,['close'])),volume:Number(pick(r,['volume','vol'])??0)};
  }).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
function aggregateTwoHour(rows){
  const buckets=new Map();
  for(const r of rows){
    const start=Math.floor(r.time/(2*60*60*1000))*(2*60*60*1000);
    if(r.time!==start && r.time!==start+60*60*1000)continue;
    const b=buckets.get(start);
    if(!b)buckets.set(start,{time:start,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume,count:1});
    else if(r.time===b.time+60*60*1000){b.high=Math.max(b.high,r.high);b.low=Math.min(b.low,r.low);b.close=r.close;b.volume+=r.volume;b.count++;}
  }
  return [...buckets.values()].filter(x=>x.count===2).sort((a,b)=>a.time-b.time);
}
for(const symbol of symbols){
  const oneHour=readRows(await readFile(join(root,symbol+'_1H.csv'),'utf8'));
  const twoHour=aggregateTwoHour(oneHour);
  if(oneHour.length<80||twoHour.length<80)throw new Error(symbol+': insufficient 1H/aggregated 2H candles ('+oneHour.length+'/'+twoHour.length+')');
  const out=['timestamp,open,high,low,close,volume',...twoHour.map(x=>[x.time,x.open,x.high,x.low,x.close,x.volume].join(','))].join('\n')+'\n';
  await writeFile(join(root,symbol+'_2H.csv'),out);
  console.log(symbol+': '+oneHour.length+' 1H candles; '+twoHour.length+' complete 2H candles');
}
