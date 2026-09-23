const BASE='https://api.twelvedata.com';
const KEY=process.env.TWELVE_DATA_API_KEY;

const TF={ '1m':'1min','5m':'5min','15m':'15min','30m':'30min','1H':'1h','4H':'4h','1D':'1day','1W':'1week' };
const CANDLE_TTL={ '1m':20000,'5m':60000,'15m':120000,'30m':180000,'1H':300000,'4H':900000,'1D':3600000,'1W':21600000 };
const REFERENCE_TTL=21600000;
const cache=new Map(), inflight=new Map();

function ensureKey(){
  if(!KEY){
    const e=new Error('Twelve Data API key is not configured');
    e.code='MARKET_DATA_PROVIDER_CONFIG';
    throw e;
  }
}
async function request(path,params={}){
  ensureKey();
  const u=new URL(BASE+path);
  u.searchParams.set('apikey',KEY);
  for(const [k,v] of Object.entries(params))if(v!=null)u.searchParams.set(k,String(v));
  const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
  const b=await r.json().catch(()=>null);
  if(!r.ok||b?.status==='error'){
    const e=new Error(b?.message||`Twelve Data request failed (${r.status})`);
    e.code='MARKET_DATA_REQUEST_FAILED';e.status=r.status;throw e;
  }
  return b;
}
function keyFor(...parts){return parts.map(x=>String(x||'').toUpperCase()).join('|')}
function getCached(key,ttl){const x=cache.get(key);return x&&Date.now()-x.at<ttl?x.value:null}
function rows(values){
  return (values||[]).map(x=>[
    Date.parse(String(x.datetime).replace(' ','T')+'Z'),
    Number(x.open),Number(x.high),Number(x.low),Number(x.close),Number(x.volume||0)
  ]).filter(x=>x.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
}
function listBody(body){return Array.isArray(body)?body:(Array.isArray(body?.data)?body.data:Array.isArray(body?.values)?body.values:[])}
function normalizeReference(item,type){
  const symbol=String(item?.symbol||'').trim().toUpperCase();
  if(!symbol)return null;
  return {
    symbol,
    name:String(item?.name||item?.description||symbol),
    type,
    category:String(item?.category||type)
  };
}
async function reference(path,type){
  const key=keyFor('reference',path);
  const cached=getCached(key,REFERENCE_TTL);if(cached)return cached;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const body=await request(path);
    const value=listBody(body).map(x=>normalizeReference(x,type)).filter(Boolean);
    cache.set(key,{at:Date.now(),value});return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
}
export async function twelveInstrumentSnapshot(kind='all'){
  const wanted=String(kind).toLowerCase();
  const needForex=wanted==='all'||wanted==='forex';
  const needCommodities=wanted==='all'||wanted==='commodities';
  const needIndices=wanted==='all'||wanted==='indices';
  const [forex,commodities,indices]=await Promise.all([
    needForex?reference('/forex_pairs','FOREX'):[],
    needCommodities?reference('/commodities','COMMODITY'):[],
    needIndices?reference('/indices','INDEX'):[]
  ]);
  return [
    ...forex.map(x=>({...x,displayName:x.name,exchange:'Twelve Data',source:'Twelve Data'})),
    ...commodities.map(x=>({...x,displayName:x.name,exchange:'Twelve Data',source:'Twelve Data'})),
    ...indices.map(x=>({...x,displayName:x.name,exchange:'Twelve Data',source:'Twelve Data'}))
  ];
}
export async function resolveTwelveSymbol(symbol,kind='all'){
  const wanted=String(symbol||'').trim().toUpperCase();
  if(wanted.includes('/'))return {name:wanted,description:wanted,type:null};
  const all=await twelveInstrumentSnapshot(kind);
  const compact=wanted.replace(/[^A-Z0-9]/g,'');
  const exact=all.find(x=>x.symbol===wanted)||all.find(x=>x.symbol.replace(/[^A-Z0-9]/g,'')===compact);
  if(!exact){
    const e=new Error(`Twelve Data instrument is unavailable: ${symbol}`);
    e.code='MARKET_DATA_INSTRUMENT_UNAVAILABLE';throw e;
  }
  return {name:exact.symbol,description:exact.name,type:exact.type};
}
export async function twelveCandles(symbol,timeframe){
  const instrument=await resolveTwelveSymbol(symbol);
  const key=keyFor('candles',instrument.name,timeframe);
  const cached=getCached(key,CANDLE_TTL[timeframe]||60000);if(cached)return cached;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const interval=TF[timeframe];
    if(!interval){const e=new Error('Unsupported timeframe');e.code='MARKET_DATA_TIMEFRAME_UNSUPPORTED';throw e}
    const body=await request('/time_series',{symbol:instrument.name,interval,outputsize:500,timezone:'UTC',order:'asc'});
    const data=rows(body?.values);
    if(data.length<60){const e=new Error(`Twelve Data returned insufficient candles for ${instrument.name} ${timeframe}`);e.code='MARKET_DATA_INSUFFICIENT_CANDLES';throw e}
    const value={instrument,rows:data};
    cache.set(key,{at:Date.now(),value});return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
}
export async function twelvePrice(symbol){
  const instrument=await resolveTwelveSymbol(symbol);
  const key=keyFor('price',instrument.name);
  const cached=getCached(key,2000);if(cached)return cached;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const p=await request('/quote',{symbol:instrument.name});
    const mid=Number(p?.close??p?.price);
    if(!Number.isFinite(mid)){const e=new Error(`Twelve Data quote unavailable: ${instrument.name}`);e.code='MARKET_DATA_PRICE_UNAVAILABLE';throw e}
    const value={instrument,bid:mid,ask:mid,mid,time:p?.datetime||null,tradeable:true,spread:0,marketState:'open',stale:false};
    cache.set(key,{at:Date.now(),value});return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
}
