const API='https://api.morpho.org';
export const MORPHO_CHAIN_ID=4663;

async function request(path){
  const response=await fetch(`${API}${path}`,{headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`Morpho API returned ${response.status}`);
  return response.json();
}

export async function listMarkets({first=25,cursor}={}){
  const query=new URLSearchParams({first:String(first),chainId:String(MORPHO_CHAIN_ID)});
  if(cursor) query.set('cursor',cursor);
  return request(`/v1/blue/markets?${query}`);
}

export async function listVaults({first=25,cursor}={}){
  const query=new URLSearchParams({first:String(first),chainId:String(MORPHO_CHAIN_ID)});
  if(cursor) query.set('cursor',cursor);
  return request(`/v0/vaults-v2?${query}`);
}

export async function userVaultPositions(address){
  if(!address) throw new Error('Wallet address is required.');
  return request(`/v1/vaults-v2/users/${address}/positions?chainId=${MORPHO_CHAIN_ID}`);
}

export async function discover(){
  const [markets,vaults]=await Promise.allSettled([listMarkets(),listVaults()]);
  return {
    chainId:MORPHO_CHAIN_ID,
    markets:markets.status==='fulfilled'?markets.value:null,
    vaults:vaults.status==='fulfilled'?vaults.value:null,
  };
}
