const MORPHO='https://api.morpho.org/graphql';
const CHAIN_ID=4663;

function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(payload));}
async function gql(query,variables={}){const r=await fetch(MORPHO,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({query,variables})});const body=await r.json();if(!r.ok||body?.errors?.length)throw new Error(body?.errors?.[0]?.message||`Morpho API returned ${r.status}`);return body.data;}
function pct(v){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:'—'}
function usd(v){const n=Number(v);if(!Number.isFinite(n))return '—';return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)}
function score(v){const apy=Number(v.avgNetApyExcludingRewards??v.avgNetSupplyApy??v.supplyApy??0);const tvl=Number(v.totalAssetsUsd??v.state?.supplyAssetsUsd??0);const liquidity=Number(v.liquidityUsd??v.state?.liquidityAssetsUsd??0);return apy*100+Math.log10(Math.max(tvl,1))*2+Math.log10(Math.max(liquidity,1));}

async function findDefi(){
  const query=`query Opportunities($chainId:Int!){
    vaultV2s(first:50,where:{chainId_in:[$chainId]}){items{address name symbol listed totalAssetsUsd liquidityUsd avgNetApyExcludingRewards asset{symbol} state{totalAssetsUsd liquidityUsd}}}
    markets(first:50,orderBy:SupplyAssetsUsd,orderDirection:Desc,where:{chainId_in:[$chainId]}){items{marketId loanAsset{symbol} collateralAsset{symbol} lltv state{avgNetSupplyApy avgSupplyApy supplyAssetsUsd borrowAssetsUsd liquidityAssetsUsd utilization}}}
  }`;
  const data=await gql(query,{chainId:CHAIN_ID});
  const vaults=(data.vaultV2s?.items||[]).map(v=>({...v,type:'Vault',score:score(v)})).sort((a,b)=>b.score-a.score).slice(0,5);
  const markets=(data.markets?.items||[]).map(m=>({...m,type:'Market',score:score({avgNetSupplyApy:m.state?.avgNetSupplyApy,tvl:m.state?.supplyAssetsUsd,liquidity:m.state?.liquidityAssetsUsd}),supplyApy:m.state?.avgNetSupplyApy??m.state?.avgSupplyApy,tvl:m.state?.supplyAssetsUsd,liquidity:m.state?.liquidityAssetsUsd})).sort((a,b)=>b.score-a.score).slice(0,5);
  const best=vaults[0]||markets[0]||null;
  return {best,vaults,markets,generatedAt:new Date().toISOString()};
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{ok:false,error:'Method not allowed'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const text=String(body.command||'').trim();
    if(!text)return json(res,400,{ok:false,error:'Missing command'});
    const lower=text.toLowerCase();
    if(lower.includes('defi')||lower.includes('morpho')||lower.includes('opportunit')||lower.includes('yield')||lower.includes('lend')||lower.includes('earn')){
      const result=await findDefi();
      return json(res,200,{ok:true,kind:'defi-opportunity',chainId:CHAIN_ID,result,message:result.best?`I scanned live Morpho markets and vaults on Robinhood Chain and ranked the returned opportunities using live protocol data. The top result is ${result.best.name||result.best.symbol||'the highest-ranked market'}.`:'Morpho returned no eligible opportunities on Robinhood Chain right now.'});
    }
    if(lower.includes('help')||lower.includes('what can'))return json(res,200,{ok:true,kind:'help',message:'I can currently execute read-only discovery tasks for Morpho DeFi opportunities on Robinhood Chain. Execution remains wallet-permission gated.'});
    return json(res,200,{ok:true,kind:'ack',message:`Task received: “${text}”. I can route supported DeFi discovery tasks through the live data layer; unsupported actions are not fabricated.`});
  }catch(error){return json(res,502,{ok:false,error:error?.message||'Agent task failed'});}
}
