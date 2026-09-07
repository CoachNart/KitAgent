const API='https://api.uniswap.org/v2';
const CHAIN_ID=4663;
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(payload));}
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  const apiKey=process.env.UNISWAP_API_KEY;
  if(!apiKey) return json(res,503,{ok:false,error:'Uniswap Trading API key is not configured on the server.'});
  try{
    const action=String(req.query?.action||'quote');
    const params=new URLSearchParams(req.query||{});
    params.set('tokenInChainId',String(CHAIN_ID));
    params.set('tokenOutChainId',String(CHAIN_ID));
    const path=action==='orders'?'/orders':'/quote';
    const response=await fetch(`${API}${path}?${params.toString()}`,{headers:{Accept:'application/json','x-api-key':apiKey}});
    const body=await response.json();
    if(!response.ok)return json(res,response.status,{ok:false,error:body?.message||body?.error||`Uniswap API returned ${response.status}`,details:body});
    return json(res,200,{ok:true,chainId:CHAIN_ID,data:body});
  }catch(error){return json(res,502,{ok:false,error:error?.message||'Uniswap API request failed'});}
}
