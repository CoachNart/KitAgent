const PUBLIC_RPC='https://rpc.mainnet.chain.robinhood.com';
const BLOCKSCOUT='https://robinhoodchain.blockscout.com/api/v2';
export const ROBINHOOD_CHAIN_ID=4663;

const rpcUrl=()=>import.meta.env?.VITE_ROBINHOOD_RPC_URL||PUBLIC_RPC;

export async function robinhoodRpc(method,params=[]){
  const response=await fetch(rpcUrl(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});
  if(!response.ok) throw new Error(`Robinhood RPC returned ${response.status}`);
  const body=await response.json();
  if(body.error) throw new Error(body.error.message||'Robinhood RPC request failed');
  return body.result;
}

export async function blockscout(path){
  const response=await fetch(`${BLOCKSCOUT}${path}`);
  if(!response.ok) throw new Error(`Robinhood Chain indexer returned ${response.status}`);
  return response.json();
}

export async function chainHealth(){
  const [chainId,blockNumber]=await Promise.all([robinhoodRpc('eth_chainId'),robinhoodRpc('eth_blockNumber')]);
  return {chainId:Number(BigInt(chainId)),blockNumber:Number(BigInt(blockNumber)),rpc:rpcUrl()};
}

export async function walletActivity(address){
  if(!address) throw new Error('Wallet address is required.');
  const [balance,transactions,tokens,nfts]=await Promise.allSettled([
    robinhoodRpc('eth_getBalance',[address,'latest']),
    blockscout(`/addresses/${address}/transactions?items_count=20`),
    blockscout(`/addresses/${address}/tokens?type=ERC-20&items_count=50`),
    blockscout(`/addresses/${address}/nft/collections?items_count=25`),
  ]);
  return {
    address,
    chainId:ROBINHOOD_CHAIN_ID,
    nativeBalanceWei:balance.status==='fulfilled'?balance.value:null,
    transactions:transactions.status==='fulfilled'?(transactions.value.items||[]):[],
    tokens:tokens.status==='fulfilled'?(tokens.value.items||[]):[],
    nftCollections:nfts.status==='fulfilled'?(nfts.value.items||[]):[],
  };
}

export async function transaction(hash){return blockscout(`/transactions/${hash}`);}
