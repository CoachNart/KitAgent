const API='https://api.opensea.io/api/v2';
const allowed=new Set(['nfts','nft','search','account-nfts','listing-actions']);

function chainName(value='ethereum'){
  const map={robinhood:'robinhood',robinhoodTestnet:'sepolia',ethereum:'ethereum',base:'base',arbitrum:'arbitrum',optimism:'optimism',polygon:'matic',avalanche:'avalanche',zora:'zora',blast:'blast'};
  return map[value]||value;
}
function send(res,status,data){res.status(status).json(data)}

export default async function handler(req,res){
  try{
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end()}
    const key=process.env.OPENSEA_API_KEY;
    if(!key)return send(res,503,{error:'OpenSea integration is not configured. Set OPENSEA_API_KEY in Vercel environment variables.'});
    const body=req.body||{}; const action=body.action||new URL(req.url,'http://localhost').searchParams.get('action');
    if(!allowed.has(action))return send(res,400,{error:'Unsupported OpenSea action'});
    let url=''; let options={method:'GET',headers:{'x-api-key':key,accept:'application/json'}};
    if(action==='account-nfts'){
      if(!/^0x[a-fA-F0-9]{40}$/.test(body.address||''))return send(res,400,{error:'Invalid wallet address'});
      url=`${API}/chain/${encodeURIComponent(chainName(body.chain))}/account/${body.address}/nfts?limit=${Math.min(Number(body.limit)||20,200)}`;
    }else if(action==='nft'){
      if(!/^0x[a-fA-F0-9]{40}$/.test(body.contract||'')||body.tokenId===undefined)return send(res,400,{error:'NFT contract and tokenId are required'});
      url=`${API}/chain/${encodeURIComponent(chainName(body.chain))}/contract/${body.contract}/nfts/${encodeURIComponent(String(body.tokenId))}`;
    }else if(action==='search'){
      if(!body.query)return send(res,400,{error:'Search query is required'});
      url=`${API}/search?query=${encodeURIComponent(body.query)}&asset_types=nft&limit=10`;
    }else if(action==='nfts'){
      if(!body.contract)return send(res,400,{error:'Contract is required'});
      url=`${API}/chain/${encodeURIComponent(chainName(body.chain))}/contract/${body.contract}/nfts?limit=${Math.min(Number(body.limit)||20,200)}`;
    }else if(action==='listing-actions'){
      if(req.method!=='POST')return send(res,405,{error:'POST required'});
      options={method:'POST',headers:{'x-api-key':key,'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body.payload||{})};
      url=`${API}/listings/actions`;
    }
    const r=await fetch(url,options); const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}};
    return send(res,r.status,data);
  }catch(e){return send(res,500,{error:e.message||'OpenSea request failed'})}
}
