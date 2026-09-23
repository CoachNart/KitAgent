const BASE='https://biquote.io/api';

async function request(path,params={}){
  const url=new URL(BASE+path);
  for(const [k,v] of Object.entries(params))if(v!=null)url.searchParams.set(k,String(v));
  const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
  const body=await r.json().catch(()=>null);
  if(!r.ok){const err=new Error(body?.message||body?.error||`Biquote request failed (${r.status})`);err.code='MARKET_DATA_REQUEST_FAILED';err.status=r.status;err.retryAfterMs=Number(r.headers.get('retry-after')||0)*1000;throw err}
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
let instrumentCache=null,instrumentAt=0,instrumentPromise=null,instrumentRetryAt=0;
export async function listBiquoteInstruments(){
  const now=Date.now();
  if(instrumentCache&&now-instrumentAt<5*60*1000)return instrumentCache;
  if(instrumentPromise)return instrumentPromise;
  if(instrumentCache&&now<instrumentRetryAt)return instrumentCache;
  instrumentPromise=(async()=>{
    try{
      // One catalogue request only. Do not fan out to /symbols and /active
      // after a 429: that turns a rate-limit response into a request storm.
      const body=await request('/symbols',{quotedWithinDays:7});
      if(Array.isArray(body)&&body.length){
        instrumentCache=body;
        instrumentAt=Date.now();
        instrumentRetryAt=0;
        return body;
      }
      return instrumentCache||[];
    }catch(err){
      if(err?.status===429){
        instrumentRetryAt=Date.now()+Math.max(60000,Number(err.retryAfterMs)||60000);
      }
      if(instrumentCache)return instrumentCache;
      throw err;
    }finally{
      instrumentPromise=null;
    }
  })();
  return instrumentPromise;
}
export async function resolveBiquoteSymbol(symbol){
  const wanted=String(symbol||'').trim().toUpperCase();
  const all=await listBiquoteInstruments();
  const aliases=CFD_ALIASES[wanted]||[wanted];
  const found=all.find(x=>String(x.name||'').toUpperCase()===wanted)
    ||all.find(x=>aliases.some(a=>String(a).toUpperCase()===String(x.name||'').toUpperCase()))
    ||all.find(x=>compact(x.name)===compact(wanted));
  return found||null;
}
export async function biquoteInstrumentSnapshot(){
  const all=await listBiquoteInstruments();
  return all.map(x=>({name:x.name,displayName:x.description||x.name,type:x.type,exchange:x.exchange,source:x.source}));
}

export async function biquoteCandles(symbol,timeframe){
  const instrument=await resolveBiquoteSymbol(symbol);
  if(!instrument){const e=new Error(`Market-data instrument unavailable: ${symbol}`);e.code='MARKET_DATA_INSTRUMENT_UNAVAILABLE';throw e}
  const interval=timeframe==='1H'?'1h':timeframe==='4H'?'4h':timeframe==='1D'?'1d':timeframe==='1W'?'1d':timeframe;
  let body;
  try{
    body=await request(`/${encodeURIComponent(instrument.name)}/ohlc`,{interval,limit:1000});
  }catch(err){
    // Biquote documents M1/M5/M15/M30 explicitly. If a requested intraday
    // series is temporarily sparse, rebuild that exact timeframe from the
    // nearest available lower-resolution source rather than declaring the
    // market stale.
    if(['1m','5m','15m','30m'].includes(interval)){
      const base=interval==='1m'?'1m':interval==='5m'?'5m':interval==='15m'?'5m':'5m';
      if(base!==interval)body=await request(`/${encodeURIComponent(instrument.name)}/ohlc`,{interval:base,limit:1000});
      else throw err;
    }else throw err;
  }
  let rows=normalizeRows(body?.bars);
  if(['5m','15m','30m'].includes(interval)){
    const bucket=interval==='5m'?5*60000:interval==='15m'?15*60000:30*60000;
    rows=aggregate(rows,bucket);
  }
  // Biquote's live quote feed can be newer than its stored 4H/D1 bars.
  // Rebuild higher timeframes from current 1H candles and merge them over
  // the broker's longer historical series so HTF structure stays current.
  if(['4H','1D','1W'].includes(timeframe)){
    try{
      const hourly=normalizeRows((await request(`/${encodeURIComponent(instrument.name)}/ohlc`,{interval:'1h',limit:1000}))?.bars);
      if(hourly.length){
        const bucket=timeframe==='4H'?4*3600000:86400000;
        const recent=aggregate(hourly,bucket);
        rows=mergeRows(rows,recent,bucket);
      }
    }catch{}
  }
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
  const rows=all.map(x=>({name:x.name,displayName:x.description||x.name,type:x.type,exchange:x.exchange,source:x.source}));
  // Keep the supported Metal/CFD picker source-native even if Biquote's
  // recent catalogue temporarily omits a configured instrument.
  const existing=new Set(rows.map(x=>String(x.name||'').toUpperCase()));
  for(const aliases of Object.values(CFD_ALIASES)){
    for(const candidate of aliases){
      const key=String(candidate).toUpperCase();
      if(existing.has(key))break;
      try{
        const direct=await request(`/symbols/${encodeURIComponent(key)}`);
        if(direct?.name){
          rows.push({name:direct.name,displayName:direct.description||direct.name,type:direct.type,exchange:direct.exchange,source:direct.source});
          existing.add(String(direct.name).toUpperCase());
          break;
        }
      }catch{}
    }
  }
  return rows;
}
