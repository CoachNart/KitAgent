import marketEngine from './market-engine-v2.js';

function json(res,status,p){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(p))}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  if(String(req.query?.action||'')==='header'){
    try{
      const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear',{headers:{Accept:'application/json'}});
      if(!r.ok)return json(res,502,{error:'Bybit ticker provider unavailable'});
      const body=await r.json();
      if(body?.retCode!==0||!Array.isArray(body?.result?.list))return json(res,502,{error:body?.retMsg||'Bybit ticker provider unavailable'});
      const wanted=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT']);
      const result=body.result.list.filter(x=>wanted.has(x.symbol)).map(x=>({symbol:x.symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt}));
      return json(res,200,{ok:true,result});
    }catch(e){return json(res,502,{ok:false,error:e?.message||'Bybit ticker provider unavailable'})}
  }
  return marketEngine(req,res);
}
