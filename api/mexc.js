import crypto from 'crypto';

const BASE='https://contract.mexc.com';
const json=(res,status,data)=>{res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
const bodyOf=async req=>{if(req.body&&typeof req.body==='object')return req.body;let raw='';for await(const c of req)raw+=c;try{return JSON.parse(raw||'{}')}catch{return {}}};
const sym=v=>String(v||'BTCUSDT').toUpperCase().replace(/[-/]/g,'').replace('_USDT','USDT').replace('USDT','_USDT');
const sign=({path,method='GET',params={},body='',key,secret})=>{const timestamp=String(Date.now());const entries=Object.entries(params).filter(([,v])=>v!==null&&v!==undefined&&v!=='').sort(([a],[b])=>a.localeCompare(b));const parameterString=method==='POST'?(body||''):entries.map(([k,v])=>`${k}=${encodeURIComponent(String(v))}`).join('&');const signature=crypto.createHmac('sha256',secret).update(`${key}${timestamp}${parameterString}`).digest('hex');const query=method==='GET'&&parameterString?`?${parameterString}`:'';return {url:`${BASE}${path}${query}`,headers:{ApiKey:key,'Request-Time':timestamp,Signature:signature,'Recv-Window':'30000','Content-Type':'application/json','Language':'English'}}};
async function call(url,options={}){const r=await fetch(url,{...options,headers:{...(options.headers||{}),'User-Agent':'KitAgent/1.0'}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={message:text}}if(!r.ok)throw new Error(data?.msg||data?.message||`MEXC request failed (${r.status})`);if(data?.success===false)throw new Error(data?.message||data?.msg||`MEXC request failed (${data?.code??'unknown'})`);return data}
const signed=async(b,path,params={})=>{if(!b.key||!b.secret)throw new Error('Connect the MEXC Futures API first');const s=sign({path,params,key:b.key,secret:b.secret});return call(s.url,{headers:s.headers})};

export default async function handler(req,res){try{const b=await bodyOf(req);const action=String(b.action||'market');const symbol=sym(b.symbol);
if(action==='market'){const [contract,ticker,depth,funding,index,fair]=await Promise.all([
 call(`${BASE}/api/v1/contract/detail?symbol=${encodeURIComponent(symbol)}`),
 call(`${BASE}/api/v1/contract/ticker?symbol=${encodeURIComponent(symbol)}`),
 call(`${BASE}/api/v1/contract/depth/${encodeURIComponent(symbol)}?limit=50`),
 call(`${BASE}/api/v1/contract/funding_rate/${encodeURIComponent(symbol)}`),
 call(`${BASE}/api/v1/contract/index_price/${encodeURIComponent(symbol)}`),
 call(`${BASE}/api/v1/contract/fair_price/${encodeURIComponent(symbol)}`)
]);return json(res,200,{contract:contract?.data?.[0]||contract?.data||null,ticker:ticker?.data||null,depth:depth?.data||depth||null,funding:funding?.data||null,index:index?.data||null,fairPrice:fair?.data||null,timestamp:Date.now()})}
if(action==='contracts')return json(res,200,await call(`${BASE}/api/v1/contract/detail`));
if(action==='positionMode')return json(res,200,await signed(b,'/api/v1/private/position/position_mode'));
if(action==='assets')return json(res,200,await signed(b,'/api/v1/private/account/assets'));
if(action==='positions')return json(res,200,await signed(b,'/api/v1/private/position/open_positions'));
if(action==='orders')return json(res,200,await signed(b,`/api/v1/private/order/list/open_orders/${encodeURIComponent(symbol)}`,{page_num:1,page_size:100}));
if(action==='historyOrders')return json(res,200,await signed(b,'/api/v1/private/order/list/history_orders',{symbol,page_num:1,page_size:100}));
if(action==='historyPositions')return json(res,200,await signed(b,'/api/v1/private/position/list/history_positions',{symbol,page_num:1,page_size:100}));
if(action==='fundingDetails')return json(res,200,await signed(b,'/api/v1/private/position/funding_records',{symbol,page_num:1,page_size:100}));
if(action==='riskLimits')return json(res,200,await signed(b,'/api/v1/private/account/risk_limit',{symbol}));
if(action==='leverage')return json(res,200,await signed(b,'/api/v1/private/position/leverage',{symbol}));
if(action==='tradingFee')return json(res,200,await signed(b,'/api/v1/private/account/tiered_fee_rate',{symbol}));
return json(res,400,{error:'Unsupported MEXC data action'});
}catch(e){return json(res,502,{error:e?.message||'MEXC request failed'});}}
