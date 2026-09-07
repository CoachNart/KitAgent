import crypto from 'node:crypto';
const BASE='https://api.bybit.com';
const RECV_WINDOW='5000';
const ok=(res,payload,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));};
const qs=o=>new URLSearchParams(Object.entries(o||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='')).toString();
function sign(secret,timestamp,apiKey,queryOrBody){return crypto.createHmac('sha256',secret).update(`${timestamp}${apiKey}${RECV_WINDOW}${queryOrBody}`).digest('hex')}
async function publicGet(path,params){const r=await fetch(`${BASE}${path}?${qs(params)}`,{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));if(!r.ok||body.retCode!==0)throw new Error(body.retMsg||`Bybit returned ${r.status}`);return body.result}
async function privateCall({apiKey,apiSecret,path,method='GET',params={},body={}}){if(!apiKey||!apiSecret)throw new Error('Connect a Bybit API key first.');const timestamp=String(Date.now());const query=method==='GET'?qs(params):'';const payload=method==='GET'?query:JSON.stringify(body);const signature=sign(apiSecret,timestamp,apiKey,payload);const url=method==='GET'?`${BASE}${path}${query?`?${query}`:''}`:`${BASE}${path}`;const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-BAPI-API-KEY':apiKey,'X-BAPI-TIMESTAMP':timestamp,'X-BAPI-RECV-WINDOW':RECV_WINDOW,'X-BAPI-SIGN':signature,'X-BAPI-SIGN-TYPE':'2'},body:method==='GET'?undefined:JSON.stringify(body)});const out=await r.json().catch(()=>({}));if(!r.ok||out.retCode!==0)throw new Error(out.retMsg||`Bybit returned ${r.status}`);return out.result}
export default async function handler(req,res){try{const op=String(req.query?.op||'');
if(req.method==='GET'){
 if(op==='markets'){let cursor='';const all=[];do{const r=await publicGet('/v5/market/instruments-info',{category:'linear',limit:1000,cursor});all.push(...(r.list||[]));cursor=r.nextPageCursor||''}while(cursor);return ok(res,{ok:true,list:all.filter(x=>x.status==='Trading'&&x.contractType==='LinearPerpetual')})}
 if(op==='kline'){const r=await publicGet('/v5/market/kline',{category:'linear',symbol:req.query.symbol,interval:req.query.interval||'5',limit:Math.min(Number(req.query.limit||300),1000)});return ok(res,{ok:true,list:r.list||[]})}
 if(op==='ticker'){const r=await publicGet('/v5/market/tickers',{category:'linear',symbol:req.query.symbol});return ok(res,{ok:true,list:r.list||[]})}
 if(op==='orderbook'){const r=await publicGet('/v5/market/orderbook',{category:'linear',symbol:req.query.symbol,limit:50});return ok(res,{ok:true,...r})}
 if(op==='trades'){const r=await publicGet('/v5/market/recent-trade',{category:'linear',symbol:req.query.symbol,limit:50});return ok(res,{ok:true,list:r.list||[]})}
 if(op==='funding'){const r=await publicGet('/v5/market/funding/history',{category:'linear',symbol:req.query.symbol,limit:1});return ok(res,{ok:true,list:r.list||[]})}
 return ok(res,{ok:false,error:'Unknown public operation'},400)}
const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};const credentials={apiKey:b.apiKey,apiSecret:b.apiSecret};
if(op==='balance')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/account/wallet-balance',params:{accountType:'UNIFIED',coin:'USDT'}})});
if(op==='positions')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/position/list',params:{category:'linear',settleCoin:'USDT'}})});
if(op==='orders')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/order/realtime',params:{category:'linear',settleCoin:'USDT',openOnly:0,limit:50}})});
if(op==='history')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/order/history',params:{category:'linear',settleCoin:'USDT',limit:50}})});
if(op==='leverage')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/position/set-leverage',method:'POST',body:{category:'linear',symbol:b.symbol,buyLeverage:String(b.leverage),sellLeverage:String(b.leverage)}})});
if(op==='margin-mode')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/account/set-margin-mode',method:'POST',body:{setMarginMode:b.mode==='isolated'?'ISOLATED_MARGIN':'REGULAR_MARGIN'}})});
if(op==='create')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/order/create',method:'POST',body:b.order})});
if(op==='cancel')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/order/cancel',method:'POST',body:{category:'linear',symbol:b.symbol,orderId:b.orderId}})});
if(op==='cancel-all')return ok(res,{ok:true,result:await privateCall({...credentials,path:'/v5/order/cancel-all',method:'POST',body:{category:'linear',settleCoin:'USDT'}})});
return ok(res,{ok:false,error:'Unknown private operation'},400)}catch(e){return ok(res,{ok:false,error:e?.message||'Bybit request failed'},502)}}
