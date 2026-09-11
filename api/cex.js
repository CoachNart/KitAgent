import crypto from 'crypto';
const json=(res,status,data)=>{res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
const bodyOf=async req=>{if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const c of req)raw+=c;try{return JSON.parse(raw||'{}')}catch{return {}}};
const mexcBase='https://api.mexc.com';const bitgetBase='https://api.bitget.com';
const b64=s=>crypto.createHmac('sha256',s).digest('base64');
const mexcSpotSigned=({path,params={},key,secret})=>{const timestamp=String(Date.now());const query=new URLSearchParams({...params,timestamp}).toString();const signature=crypto.createHmac('sha256',secret).update(query).digest('hex');return {url:`${mexcBase}${path}?${query}&signature=${signature}`,headers:{'X-MEXC-APIKEY':key,'Content-Type':'application/json'}}};
const mexcFuturesSigned=({path,method='GET',params={},body='',key,secret})=>{const timestamp=String(Date.now());let parameterString='';if(method.toUpperCase()==='POST'){parameterString=body||''}else{const entries=Object.entries(params).filter(([,v])=>v!==null&&v!==undefined&&v!=='').sort(([a],[b])=>a.localeCompare(b));parameterString=entries.map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&')}const target=`${key}${timestamp}${parameterString}`;const signature=crypto.createHmac('sha256',secret).update(target).digest('hex');const query=method.toUpperCase()==='GET'&&parameterString?`?${parameterString}`:'';return {url:`${mexcBase}${path}${query}`,headers:{ApiKey:key,'Request-Time':timestamp,Signature:signature,'Recv-Window':'30000','Content-Type':'application/json','Language':'English'}}};
const bitgetSigned=({path,method='GET',params={},body='',key,secret,passphrase})=>{const query=Object.keys(params).length?'?'+new URLSearchParams(params).toString():'';const timestamp=String(Date.now());const pre=timestamp+method.toUpperCase()+path+query+body;return {url:`${bitgetBase}${path}${query}`,headers:{'ACCESS-KEY':key,'ACCESS-SIGN':b64(pre),'ACCESS-TIMESTAMP':timestamp,'ACCESS-PASSPHRASE':passphrase,'Content-Type':'application/json','locale':'en-US'}}};
async function call(url,options={}){const r=await fetch(url,{...options,headers:{...(options.headers||{}),'User-Agent':'KitAgent/1.0'}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={message:text}}if(!r.ok)throw new Error(data?.msg||data?.message||`Exchange request failed (${r.status})`);if(data?.success===false)throw new Error(data?.message||data?.msg||`Exchange request failed (${data?.code??'unknown'})`);return data;}
const mexcSym=s=>String(s||'BTCUSDT').toUpperCase().replace(/[-/]/g,'').replace('USDT','_USDT');
const mexcInterval=i=>({'1m':'Min1','5m':'Min5','15m':'Min15','30m':'Min30','1h':'Min60','4h':'Hour4','1d':'Day1'}[String(i).toLowerCase()]||'Min5');
const bitgetInterval=i=>({'1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D'}[String(i).toLowerCase()]||'5m');
const asArray=v=>Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:(v?.data&&typeof v.data==='object'?[v.data]:(v&&typeof v==='object'?[v]:[])));
const normalizeMexcSpot=v=>(Array.isArray(v?.balances)?v.balances:[]).map(x=>{const available=Number(x.free??x.available??0);const locked=Number(x.locked??x.freeze??0);const total=Number(x.total??available+locked);return {currency:String(x.asset||x.currency||''),availableBalance:available,available,cashBalance:total,frozenBalance:locked,equity:total,balance:total,source:'spot'}}).filter(x=>x.currency);
const normalizeMexcFutures=v=>asArray(v).map(x=>{const currency=String(x.currency||x.coin||x.asset||x.marginCoin||'');const wallet=Number(x.walletBalance??x.equity??x.balance??x.wallet??0);const available=Number(x.availableBalance??x.available??x.availableMargin??wallet);const equity=Number(x.equity??x.walletBalance??x.balance??wallet);return {...x,currency,availableBalance:available,available,equity,balance:wallet,cashBalance:wallet,frozenBalance:Math.max(wallet-available,0),source:'futures'}}).filter(x=>x.currency);
export default async function handler(req,res){try{
 const b=await bodyOf(req),exchange=String(b.exchange||'mexc').toLowerCase(),action=String(b.action||'ticker'),symbol=String(b.symbol||'BTCUSDT').toUpperCase(),interval=String(b.interval||'5m');
 if(!['mexc','bitget'].includes(exchange))return json(res,400,{error:'Unsupported exchange'});
 if(exchange==='mexc'){
  const sym=mexcSym(symbol);
  if(action==='pairs')return json(res,200,await call(`${mexcBase}/api/v1/contract/detail`));
  if(action==='ticker')return json(res,200,await call(`${mexcBase}/api/v1/contract/ticker?symbol=${encodeURIComponent(sym)}`));
  if(action==='book')return json(res,200,await call(`${mexcBase}/api/v1/contract/depth/${encodeURIComponent(sym)}?limit=50`));
  if(action==='candles'){const end=Math.floor(Date.now()/1000),start=end-7*86400;return json(res,200,await call(`${mexcBase}/api/v1/contract/kline/${encodeURIComponent(sym)}?interval=${mexcInterval(interval)}&start=${start}&end=${end}`));}
  if(!b.key||!b.secret)return json(res,400,{error:'Connect the MEXC Futures API first'});
  const spotSigned=(path,params={})=>mexcSpotSigned({path,params,key:b.key,secret:b.secret});
  const futuresSigned=(path,params={},method='GET',body='')=>mexcFuturesSigned({path,params,key:b.key,secret:b.secret,method,body});
  const run=async(s,opts={})=>call(s.url,{...opts,headers:s.headers});
  if(action==='connect'||action==='balance'){
   const futuresResult=await run(futuresSigned('/api/v1/private/account/assets')).then(data=>({ok:true,data})).catch(error=>({ok:false,error}));
   const spotResult=await run(spotSigned('/api/v3/account')).then(data=>({ok:true,data})).catch(error=>({ok:false,error}));
   if(action==='connect'){
    if(!futuresResult.ok&&!spotResult.ok){const f=futuresResult.error?.message||'unavailable';const s=spotResult.error?.message||'unavailable';return json(res,502,{error:`MEXC API credentials were rejected or account access is unavailable. Futures: ${f}. Spot: ${s}.`});}
    return json(res,200,{connected:true,spot:spotResult.ok,futures:futuresResult.ok});
   }
   if(!futuresResult.ok&&!spotResult.ok){const f=futuresResult.error?.message||'unavailable';const s=spotResult.error?.message||'unavailable';return json(res,502,{error:`MEXC balance access failed. Futures: ${f}. Spot: ${s}.`});}
   const futuresAssets=normalizeMexcFutures(futuresResult.data);const spotAssets=normalizeMexcSpot(spotResult.data);const byCurrency=new Map();
   for(const x of futuresAssets)byCurrency.set(x.currency,x);
   for(const x of spotAssets){const existing=byCurrency.get(x.currency);if(!existing||Number(existing.balance||existing.equity||existing.availableBalance||0)===0)byCurrency.set(x.currency,x);}
   return json(res,200,Array.from(byCurrency.values()));
  }
  if(action==='positions'){const s=futuresSigned('/api/v1/private/position/open_positions');return json(res,200,await run(s));}
  if(action==='orders'){const s=futuresSigned(`/api/v1/private/order/list/open_orders/${encodeURIComponent(sym)}`);return json(res,200,await run(s));}
  if(action==='history'){const s=futuresSigned('/api/v1/private/order/list/history_orders',{symbol:sym,page_num:1,page_size:50});return json(res,200,await run(s));}
  if(action==='positionHistory'){const s=futuresSigned('/api/v1/private/position/list/history_positions',{symbol:sym,page_num:1,page_size:50});return json(res,200,await run(s));}
  if(action==='cancel'){const body=JSON.stringify(b.orderIds||[]);const s=futuresSigned('/api/v1/private/order/cancel',{},'POST',body);return json(res,200,await run(s,{method:'POST',body}));}
  if(action==='changeLeverage'){const p={positionId:Number(b.positionId||0),leverage:Number(b.leverage),openType:b.marginMode==='isolated'?1:2,symbol:sym,positionType:Number(b.positionType||1)};const body=JSON.stringify(p);const s=futuresSigned('/api/v1/private/position/change_leverage',{},'POST',body);return json(res,200,await run(s,{method:'POST',body}));}
  if(action==='order'){
   const opening=b.intent!=='close';const side=opening?(b.side==='buy'?1:3):(b.side==='buy'?4:2);const p={symbol:sym,price:Number(b.price||0),vol:Number(b.volume),side,openType:b.marginMode==='isolated'?1:2,type:b.orderType==='market'?5:1,leverage:Number(b.leverage||5)};
   if(b.positionId)p.positionId=Number(b.positionId);if(b.takeProfit)p.takeProfitPrice=Number(b.takeProfit);if(b.stopLoss)p.stopLossPrice=Number(b.stopLoss);
   const body=JSON.stringify(p);const s=futuresSigned('/api/v1/private/order/submit',{},'POST',body);return json(res,200,await run(s,{method:'POST',body}));
  }
  return json(res,400,{error:'Unsupported MEXC action'});
 }
 if(action==='pairs')return json(res,200,await call(`${bitgetBase}/api/v3/market/contracts?category=USDT-FUTURES`));
 if(action==='ticker')return json(res,200,await call(`${bitgetBase}/api/v3/market/tickers?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`));
 if(action==='book')return json(res,200,await call(`${bitgetBase}/api/v3/market/orderbook?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&limit=50`));
 if(action==='candles')return json(res,200,await call(`${bitgetBase}/api/v3/market/candles?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&interval=${bitgetInterval(interval)}&limit=500`));
 if(!b.key||!b.secret||!b.passphrase)return json(res,400,{error:'Connect the Bitget Futures API first'});
 if(action==='connect'||action==='balance'){const s=bitgetSigned({path:'/api/v3/account/assets',key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));}
 if(action==='positions'){const s=bitgetSigned({path:'/api/v3/position/all-position',params:{category:'USDT-FUTURES'},key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));}
 if(action==='orders'){const s=bitgetSigned({path:'/api/v3/trade/current-orders',params:{category:'USDT-FUTURES',symbol},key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));}
 if(action==='order'){const payload={category:'USDT-FUTURES',symbol,side:b.side==='buy'?'buy':'sell',orderType:b.orderType==='market'?'market':'limit',qty:String(b.volume),marginMode:b.marginMode==='isolated'?'isolated':'crossed',tradeSide:b.intent==='close'?'close':'open'};if(b.orderType==='limit')payload.price=String(b.price);const body=JSON.stringify(payload);const s=bitgetSigned({path:'/api/v3/trade/place-order',method:'POST',body,key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{method:'POST',headers:s.headers,body}));}
 return json(res,400,{error:'Unsupported Bitget action'});
}catch(e){return json(res,502,{error:e?.message||'CEX request failed'});}}
