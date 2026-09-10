import crypto from 'crypto';

const json=(res,status,data)=>{res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
const bodyOf=async req=>{if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const c of req)raw+=c;try{return JSON.parse(raw||'{}')}catch{return {}}};
const mexcBase='https://api.mexc.com';
const bitgetBase='https://api.bitget.com';
const b64=(s)=>crypto.createHmac('sha256',s).digest('base64');
const mexcSigned=({path,method='GET',params={},key,secret})=>{const timestamp=String(Date.now());const query=new URLSearchParams({...params,timestamp}).toString();const signature=crypto.createHmac('sha256',secret).update(query).digest('hex');return {url:`${mexcBase}${path}?${query}&signature=${signature}`,headers:{'X-MEXC-APIKEY':key}}};
const bitgetSigned=({path,method='GET',params={},body='',key,secret,passphrase})=>{const timestamp=String(Date.now());const query=Object.keys(params).length?'?'+new URLSearchParams(params).toString():'';const pre=timestamp+method.toUpperCase()+path+query+body;return {url:`${bitgetBase}${path}${query}`,headers:{'ACCESS-KEY':key,'ACCESS-SIGN':b64(pre),'ACCESS-TIMESTAMP':timestamp,'ACCESS-PASSPHRASE':passphrase,'Content-Type':'application/json','locale':'en-US'}}};
async function call(url,options={}){const r=await fetch(url,{...options,headers:{...(options.headers||{}),'User-Agent':'KitAgent/1.0'}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={message:text}}if(!r.ok)throw new Error(data?.msg||data?.message||`Exchange request failed (${r.status})`);return data;}
export default async function handler(req,res){
 try{
  const b=await bodyOf(req),exchange=String(b.exchange||'mexc').toLowerCase(),action=String(b.action||'ticker');
  if(!['mexc','bitget'].includes(exchange))return json(res,400,{error:'Unsupported exchange'});
  const symbol=String(b.symbol||'BTCUSDT').toUpperCase();
  if(action==='ticker'){
   if(exchange==='mexc')return json(res,200,await call(`${mexcBase}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`));
   return json(res,200,await call(`${bitgetBase}/api/v3/market/tickers?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`));
  }
  if(action==='connect'){
   if(!b.key||!b.secret||(exchange==='bitget'&&!b.passphrase))return json(res,400,{error:'API credentials are required'});
   if(exchange==='mexc')return json(res,200,await call(mexcSigned({path:'/api/v3/account',key:b.key,secret:b.secret}).url,{headers:mexcSigned({path:'/api/v3/account',key:b.key,secret:b.secret}).headers}));
   const s=bitgetSigned({path:'/api/v3/account/assets',key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));
  }
  if(!b.key||!b.secret||(exchange==='bitget'&&!b.passphrase))return json(res,400,{error:'Connect the exchange first'});
  if(exchange==='mexc'){
   if(action==='positions')return json(res,200,await call(mexcSigned({path:'/api/v1/private/position/open_positions',key:b.key,secret:b.secret}).url,{headers:mexcSigned({path:'/api/v1/private/position/open_positions',key:b.key,secret:b.secret}).headers}));
   if(action==='orders')return json(res,200,await call(mexcSigned({path:'/api/v1/private/order/list/open_orders',params:{symbol},key:b.key,secret:b.secret}).url,{headers:mexcSigned({path:'/api/v1/private/order/list/open_orders',params:{symbol},key:b.key,secret:b.secret}).headers}));
   if(action==='order'){const p={symbol,price:b.price,vol:b.volume,side:b.side==='buy'?1:b.side==='sell'?3:1,openType:b.marginMode==='isolated'?1:2,type:b.orderType==='market'?5:1,leverage:b.leverage};const s=mexcSigned({path:'/api/v1/private/order/submit',method:'POST',params:p,key:b.key,secret:b.secret});return json(res,200,await call(s.url,{method:'POST',headers:s.headers}));}
  }else{
   if(action==='positions'){const s=bitgetSigned({path:'/api/v3/position/all-position',params:{category:'USDT-FUTURES'},key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));}
   if(action==='orders'){const s=bitgetSigned({path:'/api/v3/trade/current-orders',params:{category:'USDT-FUTURES',symbol},key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{headers:s.headers}));}
   if(action==='order'){const payload={category:'USDT-FUTURES',symbol,side:b.side==='buy'?'buy':'sell',orderType:b.orderType==='market'?'market':'limit',qty:String(b.volume),price:b.orderType==='market'?undefined:String(b.price),marginMode:b.marginMode==='isolated'?'isolated':'crossed',tradeSide:'open'};Object.keys(payload).forEach(k=>payload[k]===undefined&&delete payload[k]);const body=JSON.stringify(payload);const s=bitgetSigned({path:'/api/v3/trade/place-order',method:'POST',body,key:b.key,secret:b.secret,passphrase:b.passphrase});return json(res,200,await call(s.url,{method:'POST',headers:s.headers,body}));}
  }
  return json(res,400,{error:'Unsupported CEX action'});
 }catch(e){return json(res,502,{error:e?.message||'CEX request failed'});}
}
