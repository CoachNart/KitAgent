import { adapterRegistry } from './adapters/index.js';
import { ROBINHOOD_CHAIN, rpc } from './chain/robinhood.js';
import { estimateTransaction, simulateTransaction, submitPlan, waitForReceipt } from './engine/transactionEngine.js';

const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const toWei=value=>{const text=String(value??'').trim();if(!/^\d+(?:\.\d{1,18})?$/.test(text))throw new Error('Enter a valid ETH amount.');const [whole,fraction='']=text.split('.');return BigInt(whole)*1000000000000000000n+BigInt((fraction+'000000000000000000').slice(0,18));};
const requireWallet=wallet=>{if(!ADDRESS.test(wallet||''))throw new Error('Connect a valid EVM wallet before execution.');};
const requireProvider=provider=>{if(!provider?.request)throw new Error('The connected wallet provider is unavailable. Reconnect the wallet and try again.');};

async function executePlan(plan,{wallet,provider}){
  if(!plan?.transactions?.length)throw new Error('No executable transaction plan was produced.');
  const submittedHashes=[];
  for(const tx of plan.transactions){
    const estimate=await estimateTransaction({from:wallet,to:tx.to,data:tx.data||'0x',value:tx.value||0n});
    const simulation=await simulateTransaction({from:wallet,to:tx.to,data:tx.data||'0x',value:tx.value||0n});
    if(!simulation.ok)throw new Error('Transaction simulation failed. Nothing was submitted.');
    const submitted=await submitPlan({...plan,transactions:[{...tx,gas:estimate}]},provider);
    const hash=submitted.hashes[0];
    const receipt=await waitForReceipt(hash);
    const verified=receipt?.status==='0x1'||receipt?.status===1||receipt?.status==='1';
    if(!verified)throw new Error(`Transaction ${hash} was mined but did not succeed.`);
    submittedHashes.push({hash,receipt,gasEstimate:estimate.toString()});
  }
  const last=submittedHashes.at(-1);
  return{hash:last.hash,hashes:submittedHashes,plan,receipt:last.receipt,explorerUrl:`${ROBINHOOD_CHAIN.explorer}/tx/${last.hash}`,gasEstimate:submittedHashes.map(x=>x.gasEstimate).join(', '),status:'verified'};
}

async function executeMorphoAction(execution,{wallet,provider}){
  const adapter=adapterRegistry.get('morpho');
  let plan=execution;
  if(execution?.metadata?.requiresMorphoSignatures){
    const meta=execution.metadata;
    plan=await adapter.prepare({
      provider,
      from:wallet,
      operation:meta.operation,
      vault:meta.vault || undefined,
      amount:meta.amount ?? undefined,
      market:meta.market || undefined,
      borrowAmount:meta.borrowAmount ?? undefined,
      withdrawAmount:meta.withdrawAmount ?? undefined,
      positionData:meta.positionData || undefined,
      signRequirements:true
    });
  }
  return executePlan(plan,{wallet,provider});
}

export async function executePreparedAction(action,{wallet,provider}){
  requireWallet(wallet);requireProvider(provider);
  const chainId=Number(BigInt(await provider.request({method:'eth_chainId'})));
  if(chainId!==ROBINHOOD_CHAIN.chainId)throw new Error('Your wallet is not on Robinhood Chain. Switch to Robinhood Chain and approve again.');

  if(action?.executionPlan){
    if(action.executionPlan.adapter==='lighter'){
      const adapter=adapterRegistry.get('lighter');
      const result=await adapter.execute(action.executionPlan,{from:wallet,provider});
      return{...result,protocol:'lighter',status:result.status||'verified'};
    }
    if(action.executionPlan.adapter==='morpho')return executeMorphoAction(action.executionPlan,{wallet,provider});
    return executePlan(action.executionPlan,{wallet,provider});
  }

  if(action.kind==='lighter-order'){
    const adapter=adapterRegistry.get('lighter');
    const plan=action.adapter==='lighter'?action:await adapter.prepare({provider,from:wallet,...action});
    const result=await adapter.execute(plan,{from:wallet,provider});
    return{...result,protocol:'lighter',status:result.status||'verified'};
  }

  let plan;
  if(action.kind==='native-send'){
    if(!ADDRESS.test(action.to||''))throw new Error('The recipient address is missing or invalid.');
    plan=await adapterRegistry.get('native-eth').prepare({from:wallet,to:action.to,amountWei:toWei(action.amount)});
  }else if(action.kind==='token-transfer'||action.kind==='token-approve'){
    if(!ADDRESS.test(action.token||'')||!ADDRESS.test(action.spender||action.to||''))throw new Error('Valid token and destination/spender addresses are required.');
    if(action.amount===undefined||action.amount===null||!/^\d+$/.test(String(action.amount)))throw new Error('ERC-20 amount must be provided in base units.');
    plan=await adapterRegistry.get('erc20').prepare({from:wallet,token:action.token,to:action.spender||action.to,amount:String(action.amount),mode:action.kind==='token-approve'?'approve':'transfer'});
  }else if(action.kind==='swap'){
    plan=await adapterRegistry.get('uniswap-v2').prepare({from:wallet,tokenIn:action.tokenIn,tokenOut:action.tokenOut,amountIn:action.amountIn,slippageBps:action.slippageBps??50,nativeIn:action.nativeIn,nativeOut:action.nativeOut});
  }else if(action.kind==='nft-transfer'){
    plan=await adapterRegistry.get('erc721').prepare({from:wallet,token:action.token,to:action.to,tokenId:action.tokenId});
  }else if(action.kind==='morpho'){
    plan=await adapterRegistry.get('morpho').prepare({provider,from:wallet,operation:action.operation,vault:action.vault,amount:action.amount,market:action.market,borrowAmount:action.borrowAmount,withdrawAmount:action.withdrawAmount,positionData:action.positionData});
  }else throw new Error(`No live execution adapter is enabled for ${action.kind}. I did not submit anything.`);
  return executePlan(plan,{wallet,provider});
}

export const supportedExecutionKinds=['native-send','token-transfer','token-approve','swap','nft-transfer','morpho','lighter-order'];
export const inspectChain=async()=>({chainId:Number(BigInt(await rpc('eth_chainId'))),blockNumber:Number(BigInt(await rpc('eth_blockNumber')))});
