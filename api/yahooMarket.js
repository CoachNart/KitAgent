const BASE='https://query1.finance.yahoo.com/v8/finance/chart/';
const TF={ '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1H':'1h','4H':'1h','1D':'1d','1W':'1wk' };
const RANGE={ '1m':'5d','5m':'1mo','15m':'3mo','30m':'3mo','1H':'2y','4H':'2y','1D':'5y','1W':'10y' };
const FOREX=['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','USD/CAD','NZD/USD','EUR/GBP','EUR/JPY','GBP/JPY','EUR/CHF','AUD/JPY','CAD/JPY','CHF/JPY','NZD/JPY','AUD/CAD','AUD/NZD','GBP/CHF','GBP/CAD','EUR/AUD','EUR/CAD','NZD/CAD'];
const COMMODITIES=[
  ['GC=F','Gold'],['SI=F','Silver'],['PL=F','Platinum'],['PA=F','Palladium'],
  ['CL=F','Crude Oil WTI'],['BZ=F','Brent Crude Oil'],['NG=F','Natural Gas'],
  ['HG=F','Copper'],['ZC=F','Corn'],['ZW=F','Wheat'],['ZS=F','Soybeans']
];
const INDICES=[
  ['^GSPC','S&P 500'],['^NDX','Nasdaq 100'],['^DJI','Dow Jones'],['^RUT','Russell 2000'],
  ['^FTSE','FTSE 100'],['^GDAXI','DAX'],['^FCHI','CAC 40'],['^N225','Nikkei 225'],
  ['^HSI','Hang Seng'],['^STOXX50E','Euro Stoxx 50'],['^VIX','VIX']
];
function yahooSymbol(symbol,market){
  if(market==='forex')return String(symbol).replace('/','')+'=X';
  return String(symbol);
}
function yahooInstruments(market){
  if(market==='forex')return FOREX.map(symbol=>({symbol,name:symbol,type:'FOREX',providerSymbol:yahooSymbol(symbol,market)}));
  const rows=market==='commodities'?COMMODITIES:INDICES;
  return rows.map(([symbol,name])=>({symbol,name,type:market==='commodities'?'COMMODITY':'INDEX',providerSymbol:symbol}));
}
async function request(symbol,timeframe){
  const interval=TF[timeframe];
  const range=RANGE[timeframe];
  if(!interval||!range)throw new Error('Unsupported timeframe');
  const url=BASE+encodeURIComponent(symbol)+'?interval='+encodeURIComponent(interval)+'&range='+encodeURIComponent(range)+'&events=history&includeAdjustedClose=true';
  const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'KitSetups/1.0'},cache:'no-store'});
  const body=await r.json().catch(()=>null);
  if(!r.ok||body?.chart?.error)throw new Error(body?.chart?.error?.description||`Yahoo market data request failed (${r.status})`);
  const result=body?.chart?.result?.[0];
  if(!result?.timestamp?.length)throw new Error(`Yahoo returned no candles for ${symbol}`);
  const q=result.indicators?.quote?.[0]||{};
  const rows=result.timestamp.map((t,i)=>[Number(t)*1000,Number(q.open?.[i]),Number(q.high?.[i]),Number(q.low?.[i]),Number(q.close?.[i]),Number(q.volume?.[i]||0)]).filter(x=>[x[0],x[1],x[2],x[3],x[4]].every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
  if(rows.length<60)throw new Error(`Yahoo returned insufficient candles for ${symbol} ${timeframe}`);
  return {rows};
}
export async function yahooCandles(symbol,timeframe,market){
  const instrument=yahooInstruments(market).find(x=>x.symbol===symbol)||{symbol,name:symbol,type:market==='commodities'?'COMMODITY':'INDEX',providerSymbol:yahooSymbol(symbol,market)};
  const result=await request(instrument.providerSymbol,timeframe);
  return {instrument,rows:result.rows};
}
export async function yahooPrice(symbol,market){
  const instrument=yahooInstruments(market).find(x=>x.symbol===symbol)||{symbol,name:symbol,providerSymbol:yahooSymbol(symbol,market)};
  const result=await request(instrument.providerSymbol,'1m');
  const last=result.rows.at(-1);
  return {instrument,bid:last[4],ask:last[4],mid:last[4],time:new Date(last[0]).toISOString(),tradeable:true,spread:0,marketState:'open',stale:false};
}
export { yahooInstruments };
