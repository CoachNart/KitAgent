const OANDA_GRANULARITY={
  '1m':'M1','5m':'M5','15m':'M15','30m':'M30','1H':'H1','4H':'H4','1D':'D','1W':'W'
};
const OANDA_BASE=String(process.env.OANDA_API_URL||'').replace(/\/$/,'');
const OANDA_TOKEN=String(process.env.OANDA_API_TOKEN||'').trim();
const OANDA_ACCOUNT_ID=String(process.env.OANDA_ACCOUNT_ID||'').trim();

export function brokerConfigured(){return Boolean(OANDA_BASE&&OANDA_TOKEN&&OANDA_ACCOUNT_ID)}
export function brokerName(){return 'OANDA'}
function requireBroker(){if(!brokerConfigured()){const e=new Error('BROKER_DATA_NOT_CONFIGURED');e.code=e.message;throw e}}
async function request(path,params={}){
  requireBroker();
  const url=new URL(OANDA_BASE+path);
  for(const [k,v] of Object.entries(params))if(v!=null)url.searchParams.set(k,String(v));
  const r=await fetch(url,{headers:{Authorization:'Bearer '+OANDA_TOKEN,Accept:'application/json'},cache:'no-store'});
  const body=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(body?.errorMessage||`OANDA request failed (${r.status})`);e.code='BROKER_REQUEST_FAILED';e.status=r.status;throw e}
  return body;
}
function compact(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
const ALIASES={
  US30:['US30_USD','US30'],US500:['SPX500_USD','US500_USD','US500'],NAS100:['NAS100_USD','NAS100'],
  UK100:['UK100_GBP','UK100'],GER40:['DE30_EUR','GER30_EUR','GER40'],FRA40:['FR40_EUR','FRA40'],
  JP225:['JP225_USD','JP225Y_JPY','JP225'],HK50:['HK33_HKD','HK50'],USOIL:['WTICO_USD','USOIL'],UKOIL:['BCO_USD','UKOIL'],
  XAUUSD:['XAU_USD'],XAGUSD:['XAG_USD']
};
let instrumentsCache=null,instrumentsCacheAt=0;
export async function listBrokerInstruments(){
  requireBroker();
  if(instrumentsCache&&Date.now()-instrumentsCacheAt<300000)return instrumentsCache;
  const body=await request(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/instruments`);
  instrumentsCache=Array.isArray(body?.instruments)?body.instruments:[];instrumentsCacheAt=Date.now();
  return instrumentsCache;
}
export async function resolveBrokerInstrument(symbol){
  const wanted=String(symbol||'').trim().toUpperCase();
  const all=await listBrokerInstruments();
  const candidates=ALIASES[wanted]||[];
  return all.find(x=>x.name===wanted)||all.find(x=>candidates.includes(x.name))||all.find(x=>compact(x.name)===compact(wanted))||null;
}
export async function brokerCandles(symbol,timeframe){
  const instrument=await resolveBrokerInstrument(symbol);if(!instrument){const e=new Error(`Broker instrument unavailable: ${symbol}`);e.code='BROKER_INSTRUMENT_UNAVAILABLE';throw e}
  const granularity=OANDA_GRANULARITY[timeframe];if(!granularity)throw new Error('Unsupported broker timeframe');
  const body=await request(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/instruments/${encodeURIComponent(instrument.name)}/candles`,{granularity,count:5000,price:'M'});
  const candles=(body?.candles||[]).filter(x=>x.complete).map(x=>[Date.parse(x.time),Number(x.mid?.o),Number(x.mid?.h),Number(x.mid?.l),Number(x.mid?.c),Number(x.volume||0)]).filter(x=>x.every(Number.isFinite));
  if(candles.length<60){const e=new Error(`Broker returned insufficient completed candles for ${symbol}`);e.code='BROKER_INSUFFICIENT_CANDLES';throw e}
  return {instrument,rows:candles}
}
export async function brokerPrice(symbol){
  const instrument=await resolveBrokerInstrument(symbol);if(!instrument){const e=new Error(`Broker instrument unavailable: ${symbol}`);e.code='BROKER_INSTRUMENT_UNAVAILABLE';throw e}
  const body=await request(`/v3/accounts/${encodeURIComponent(OANDA_ACCOUNT_ID)}/pricing`,{instruments:instrument.name});
  const p=body?.prices?.[0];
  if(!p){const e=new Error(`Broker price unavailable: ${symbol}`);e.code='BROKER_PRICE_UNAVAILABLE';throw e}
  const bid=Number(p.closeoutBid??p.bids?.[0]?.price),ask=Number(p.closeoutAsk??p.asks?.[0]?.price);
  if(![bid,ask].every(Number.isFinite)){const e=new Error(`Broker bid/ask unavailable: ${symbol}`);e.code='BROKER_PRICE_UNAVAILABLE';throw e}
  return {instrument,bid,ask,mid:(bid+ask)/2,time:p.time,tradeable:p.tradeable!==false,spread:ask-bid}
}
export async function brokerInstrumentSnapshot(){
  const all=await listBrokerInstruments();
  return all.map(x=>({name:x.name,displayName:x.displayName,type:x.type,marginRate:x.marginRate,minimumTradeSize:x.minimumTradeSize,maximumOrderUnits:x.maximumOrderUnits,pipLocation:x.pipLocation,displayPrecision:x.displayPrecision}));
}
