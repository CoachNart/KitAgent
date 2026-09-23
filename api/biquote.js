const BASE='https://biquote.io/api';

async function request(path,params={}){
  const url=new URL(BASE+path);
  for(const [k,v] of Object.entries(params))if(v!=null)url.searchParams.set(k,String(v));
  const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
  const body=await r.json().catch(()=>null);
  if(!r.ok){const err=new Error(body?.message||body?.error||`Biquote request failed (${r.status})`);err.code='MARKET_DATA_REQUEST_FAILED';err.status=r.status;throw err}
  return body;
}
function compact(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function normalizeRows(bars){
  return (bars||[]).filter(x=>x&&!x.isOpen).map(x=>[Date.parse(x.openTime),Number(x.open),Number(x.high),Number(x.low),Number(x.close),Number(x.tickVolume??x.volume??0)])
    .filter(x=>x.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
}
function aggregateWeekly(rows){
  const groups=new Map();
  const weekMs=7*86400000;
  for(const r of rows){const d=new Date(r[0]);const day=(d.getUTCDay()+6)%7;const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-day*86400000;const key=start;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([t,a])=>[t,a[0][1],Math.max(...a.map(x=>x[2])),Math.min(...a.map(x=>x[3])),a.at(-1)[4],a.reduce((n,x)=>n+x[5],0)]);
}
const CFD_ALIASES={
  XAUUSD:['XAUUSD','GOLD'],XAGUSD:['XAGUSD','SILVER'],US30:['US30','DJI','DJ30','DOW30'],
  US500:['US500','SPX500','SP500','SPX'],NAS100:['NAS100','NASDAQ100','USTEC','NDX'],
  UK100:['UK100','FTSE100','FTSE'],GER40:['GER40','GER30','DAX40','DAX'],FRA40:['FRA40','CAC40','CAC'],
  JP225:['JP225','NIKKEI225','NIKKEI'],HK50:['HK50','HANGSENG','HSI'],USOIL:['USOIL','WTI','WTICOUSD'],
  UKOIL:['UKOIL','BRENT','BCOUSD']
};
let instrumentCache=null,instrumentAt=0;
export async function listBiquoteInstruments(){
  // Use Biquote's recent-quote catalogue for the picker, but never let an
  // empty/temporarily filtered catalogue make every supported instrument
  // disappear. Biquote explicitly documents /symbols?quotedWithinDays=7 as
  // the picker-safe source and /symbols as the full broker catalogue.
  if(instrumentCache&&Date.now()-instrumentAt<60000)return instrumentCache;
  let body=await request('/symbols',{quotedWithinDays:7});
  if(!Array.isArray(body)||!body.length)body=await request('/symbols');
  instrumentCache=Array.isArray(body)?body:[];instrumentAt=Date.now();return instrumentCache;
}
export async function resolveBiquoteSymbol(symbol){
  const wanted=String(symbol||'').trim().toUpperCase();
  const all=await listBiquoteInstruments();
  const aliases=CFD_ALIASES[wanted]||[wanted];
  const found=all.find(x=>String(x.name||'').toUpperCase()===wanted)
    ||all.find(x=>aliases.includes(String(x.name||'').toUpperCase()))
    ||all.find(x=>compact(x.name)===compact(wanted));
  if(found)return found;
  // The catalogue can lag a newly quoted symbol. Ask Biquote for the exact
  // canonical symbol, then each configured CFD alias before declaring it
  // unavailable. This keeps resolution source-native without Yahoo fallbacks.
  for(const candidate of [wanted,...aliases.filter(x=>x!==wanted)]){
    try{
      const direct=await request(`/symbols/${encodeURIComponent(candidate)}`);
      if(direct?.name)return direct;
    }catch{}
  }
  return null;
}
export async function biquoteCandles(symbol,timeframe){
  const instrument=await resolveBiquoteSymbol(symbol);
  if(!instrument){const e=new Error(`Market-data instrument unavailable: ${symbol}`);e.code='MARKET_DATA_INSTRUMENT_UNAVAILABLE';throw e}
  const interval=timeframe==='1H'?'1h':timeframe==='4H'?'4h':timeframe==='1D'?'1d':timeframe==='1W'?'1d':timeframe;
  const body=await request(`/${encodeURIComponent(instrument.name)}/ohlc`,{interval,limit:1000});
  let rows=normalizeRows(body?.bars);
  if(timeframe==='1W')rows=aggregateWeekly(rows);
  if(rows.length<60){const e=new Error(`Market-data provider returned insufficient completed candles for ${symbol}`);e.code='MARKET_DATA_INSUFFICIENT_CANDLES';throw e}
  return {instrument,rows};
}
export async function biquotePrice(symbol){
  const instrument=await resolveBiquoteSymbol(symbol);
  if(!instrument){const e=new Error(`Market-data instrument unavailable: ${symbol}`);e.code='MARKET_DATA_INSTRUMENT_UNAVAILABLE';throw e}
  const p=await request(`/${encodeURIComponent(instrument.name)}`,{allowStale:true});
  const bid=Number(p?.bid),ask=Number(p?.ask),mid=Number(p?.mid);
  if(![bid,ask,mid].every(Number.isFinite)){const e=new Error(`Market-data quote unavailable: ${symbol}`);e.code='MARKET_DATA_PRICE_UNAVAILABLE';throw e}
  return {instrument,bid,ask,mid,time:p.timestamp,tradeable:p.marketState==='open'&&!p.stale,spread:Number.isFinite(Number(p.spread))?Number(p.spread):ask-bid,marketState:p.marketState,stale:Boolean(p.stale)};
}
export async function biquoteInstrumentSnapshot(){
  const all=await listBiquoteInstruments();
  return all.map(x=>({name:x.name,displayName:x.description||x.name,type:x.type,exchange:x.exchange,source:x.source}));
}
