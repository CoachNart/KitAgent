const BASE='https://api.twelvedata.com';
const KEY=process.env.TWELVE_DATA_API_KEY;
const FOREX=['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','AUD/JPY','EUR/AUD','GBP/AUD','USD/SGD','USD/ZAR'];
const CFD=[
  ['XAUUSD','XAU/USD','Gold Spot / US Dollar'],['XAGUSD','XAG/USD','Silver Spot / US Dollar'],
  ['US30','DJI','Dow Jones Industrial Average'],['US500','SPX','S&P 500 Index'],['NAS100','NDX','Nasdaq 100 Index'],
  ['UK100','FTSE','FTSE 100'],['GER40','DAX','DAX Index'],['FRA40','CAC','CAC 40'],
  ['JP225','N225','Nikkei 225'],['HK50','HSI','Hang Seng Index'],
  ['USOIL','WTI','Crude Oil WTI'],['UKOIL','BRENT','Brent Crude Oil']
];
const TF={ '1m':'1min','5m':'5min','15m':'15min','30m':'30min','1H':'1h','4H':'4h','1D':'1day','1W':'1week' };
const cache=new Map(), inflight=new Map();

function ensureKey(){if(!KEY){const e=new Error('Twelve Data API key is not configured');e.code='MARKET_DATA_PROVIDER_CONFIG';throw e}}
async function request(path,params={}){
  ensureKey();
  const u=new URL(BASE+path);
  u.searchParams.set('apikey',KEY);
  for(const [k,v] of Object.entries(params))if(v!=null)u.searchParams.set(k,String(v));
  const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
  const b=await r.json().catch(()=>null);
  if(!r.ok||b?.status==='error'){const e=new Error(b?.message||`Twelve Data request failed (${r.status})`);e.code='MARKET_DATA_REQUEST_FAILED';e.status=r.status;throw e}
  return b;
}
function normalize(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9/]/g,'')}
function rows(values){
  return (values||[]).map(x=>[Date.parse(x.datetime+'Z'),Number(x.open),Number(x.high),Number(x.low),Number(x.close),Number(x.volume||0)])
    .filter(x=>x.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
}
function mapSymbol(symbol){
  const wanted=String(symbol||'').trim().toUpperCase();
  if(wanted.includes('/'))return wanted;
  const f=FOREX.find(x=>normalize(x)===normalize(wanted));
  if(f)return f;
  return CFD.find(x=>x[0]===wanted)?.[1]||wanted;
}
export async function resolveTwelveSymbol(symbol){
  const provider=mapSymbol(symbol);
  return {name:provider,description:(CFD.find(x=>x[0]===String(symbol).toUpperCase())?.[2]||provider)};
}
export async function twelveCandles(symbol,timeframe){
  const key=`c|${String(symbol).toUpperCase()}|${timeframe}`;
  if(inflight.has(key))return inflight.get(key);
  const cached=cache.get(key);
  if(cached&&Date.now()-cached.at<15000)return cached.value;
  const work=(async()=>{
    const instrument=await resolveTwelveSymbol(symbol);
    const interval=TF[timeframe];
    if(!interval){const e=new Error('Unsupported timeframe');e.code='MARKET_DATA_TIMEFRAME_UNSUPPORTED';throw e}
    const body=await request('/time_series',{symbol:instrument.name,interval,outputsize:5000,timezone:'UTC',order:'asc'});
    const data=rows(body?.values);
    if(data.length<60){const e=new Error(`Twelve Data returned insufficient candles for ${symbol} ${timeframe}`);e.code='MARKET_DATA_INSUFFICIENT_CANDLES';throw e}
    const value={instrument,rows:data};
    cache.set(key,{at:Date.now(),value});
    return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
}
export async function twelvePrice(symbol){
  const key=`p|${String(symbol).toUpperCase()}`;
  const cached=cache.get(key);
  if(cached&&Date.now()-cached.at<2000)return cached.value;
  if(inflight.has(key))return inflight.get(key);
  const work=(async()=>{
    const instrument=await resolveTwelveSymbol(symbol);
    const p=await request('/quote',{symbol:instrument.name});
    const mid=Number(p?.close||p?.price);
    if(!Number.isFinite(mid)){const e=new Error(`Twelve Data quote unavailable: ${symbol}`);e.code='MARKET_DATA_PRICE_UNAVAILABLE';throw e}
    const value={instrument,bid:mid,ask:mid,mid,time:p.datetime,tradeable:true,spread:0,marketState:'open',stale:false};
    cache.set(key,{at:Date.now(),value});return value;
  })();
  inflight.set(key,work);try{return await work}finally{inflight.delete(key)}
}
export async function twelveInstrumentSnapshot(){
  return [
    ...FOREX.map(x=>({name:x,displayName:x,type:'FOREX',exchange:'Twelve Data',source:'Twelve Data'})),
    ...CFD.map(x=>({name:x[1],displayName:x[2],canonical:x[0],type:'CFD',exchange:'Twelve Data',source:'Twelve Data'}))
  ];
}
