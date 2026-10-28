import {normalizeRows} from '../server/market-engine/data.js';

function splitCsvLine(line){
  const values=[];
  let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;continue;}
    if(ch==='"'){quoted=!quoted;continue;}
    if(ch===','&&!quoted){values.push(value.trim());value='';continue;}
    value+=ch;
  }
  values.push(value.trim());
  return values;
}

function timestampMs(value){
  const n=Number(value);
  if(value!==''&&Number.isFinite(n)){
    if(n>1e14)return Math.floor(n/1000); // microseconds
    if(n>1e11)return Math.floor(n); // milliseconds
    if(n>1e8)return Math.floor(n*1000); // seconds
  }
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:NaN;
}

/**
 * Parse a user-exported Bybit OHLCV CSV. Expected filename convention is
 * SYMBOL_TIMEFRAME.csv; supported header aliases cover Bybit-style startTime
 * and common timestamp/open_time/datetime exports.
 */
export function parseBybitCsv(source){
  const lines=String(source||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length<2)throw new Error('CSV must contain a header and at least one candle row');
  const headers=splitCsvLine(lines[0]).map(x=>x.toLowerCase().replace(/[ _-]/g,''));
  const index=(...names)=>headers.findIndex(x=>names.includes(x));
  const columns={
    time:index('starttime','timestamp','time','opentime','datetime','date'),
    open:index('open','o'),
    high:index('high','h'),
    low:index('low','l'),
    close:index('close','c'),
    volume:index('volume','vol','v')
  };
  for(const key of ['time','open','high','low','close']){
    if(columns[key]<0)throw new Error('CSV missing required '+key+' column');
  }
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const values=splitCsvLine(lines[i]);
    if(values.length<headers.length)continue;
    const time=timestampMs(values[columns.time]);
    const row=[time,values[columns.open],values[columns.high],values[columns.low],values[columns.close],columns.volume<0?0:values[columns.volume]];
    if(Number.isFinite(time))rows.push(row);
  }
  const normalized=normalizeRows(rows);
  if(normalized.length<80)throw new Error('CSV contains only '+normalized.length+' valid normalized candles; minimum 80 required');
  return normalized;
}
