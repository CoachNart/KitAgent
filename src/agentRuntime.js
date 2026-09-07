import { prepareNativeTransfer, prepareTokenTransfer } from './onchain/index.js';
import { getActiveProvider, getConnectedAddress } from './walletConnector.js';

const ADDRESS=/0x[a-fA-F0-9]{40}/g;
const NATIVE=/\b(eth|native|rbh|robinhood|ether)\b/i;

function normalizeCommand(command){return String(command||'').trim().replace(/\s+/g,' ');}
function addresses(text){return String(text).match(ADDRESS)||[];}
function amount(text){const m=String(text).match(/\b\d+(?:\.\d+)?\b/);return m?.[0]||null;}
function detectIntent(command){const s=String(command).toLowerCase();if(/\b(send|transfer)\b/.test(s))return'send';if(/\b(swap|exchange)\b/.test(s))return'swap';if(/\b(bridge|cross.?chain)\b/.test(s))return'bridge';if(/\b(buy|purchase)\b/.test(s))return'buy';if(/\b(sell|dump)\b/.test(s)&&/\bnft\b/.test(s))return'nft';if(/\b(nft|erc721|erc1155|list)\b/.test(s))return'nft';if(/\b(lend|supply|deposit.*morpho|earn.*yield)\b/.test(s))return'lend';if(/\b(borrow|loan)\b/.test(s))return'borrow';if(/\b(stake|staking)\b/.test(s))return'stake';if(/\b(withdraw|unstake|redeem)\b/.test(s))return'withdraw';if(/\b(claim|airdrop)\b/.test(s))return'claim';if(/\bfaucet\b/.test(s))return'faucet';if(/\b(balance|wallet|portfolio|positions?)\b/.test(s))return'wallet';if(/\b(market|markets|apy|yield|tvl|morpho|opportunit|analy[sz]e|price)\b/.test(s))return'market';return'help';}
async function serverPlan(command,wallet){const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command,wallet})});const data=await r.json();if(!r.ok||data.ok===false)throw new Error(data.error||'Agent API failed');return data;}
async function executionQuote(operation,body){const r=await fetch('/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,...body})});const data=await r.json();if(!r.ok||data.ok===false)throw new Error(data.error||'Execution adapter failed');return data;}
function parseSend(command,wallet){const a=addresses(command);const qty=amount(command);if(!wallet)throw new Error('Connect your wallet first.');if(!a.length)throw new Error('Give me the recipient wallet address.');if(!qty)throw new Error('Give me the amount.');if(NATIVE.test(command))return prepareNativeTransfer({from:wallet,recipient:a[a.length-1],amount:qty});if(a.length<2)throw new Error('For an ERC-20 transfer, give me the token contract and recipient address.');return prepareTokenTransfer({from:wallet,token:a[0],recipient:a[a.length-1],amount:qty});}
function buildSwapInput(command,wallet){const a=addresses(command);const qty=amount(command);if(!wallet)throw new Error('Connect your wallet first.');if(a.length<2)throw new Error('Swap needs two token contract addresses: tokenIn and tokenOut.');if(!qty)throw new Error('Swap needs an amount.');return{wallet,tokenIn:a[0],tokenOut:a[1],amount:qty,slippageBps:100};}
function buildBridgeInput(command,wallet){const a=addresses(command);const qty=amount(command);const chains=String(command).match(/\b\d{2,6}\b/g)||[];if(!wallet)throw new Error('Connect your wallet first.');if(a.length<2)throw new Error('Bridge needs source and destination token contract addresses.');if(chains.length<2)throw new Error('Bridge needs source and destination chain IDs.');if(!qty)throw new Error('Bridge needs an amount.');return{wallet,tokenIn:a[0],tokenOut:a[1],amount:qty,originChain:chains[0],destinationChain:chains[1],recipient:wallet};}

export async function planCommand({command,wallet}){
  const normalized=normalizeCommand(command);const intent=detectIntent(normalized);if(!normalized)return{status:'needs-input',intent:'help',message:'Tell me what you want to execute.'};
  if(intent==='send')return{status:'ready',intent,execution:parseSend(normalized,wallet)};
  if(intent==='swap'){
    const input=buildSwapInput(normalized,wallet);const quote=await executionQuote('swap-quote',input);return{status:'ready',intent,execution:quote};
  }
  if(intent==='bridge'){
    const input=buildBridgeInput(normalized,wallet);const quote=await executionQuote('bridge-quote',input);return{status:'ready',intent,execution:quote};
  }
  return serverPlan(normalized,wallet);
}

export async function executePreparedPlan(plan){if(!plan)throw new Error('No execution plan');if(plan.execution?.execute)return plan.execution.execute();const execution=plan.execution||plan;if(!execution.transaction)throw new Error(execution.message||'This operation has no executable transaction.');const provider=getActiveProvider();if(!provider?.request)throw new Error('Connected wallet provider is unavailable.');const wallet=getConnectedAddress();if(!wallet)throw new Error('Wallet is not connected.');const tx=execution.transaction;const hash=await provider.request({method:'eth_sendTransaction',params:[{from:wallet,to:tx.to,data:tx.data||'0x',value:tx.value||'0x0',...(tx.gas?{gas:tx.gas}:{}),...(tx.gasPrice?{gasPrice:tx.gasPrice}:{})}]});return{hash,quote:execution.quote,adapter:execution.adapter,quoteId:execution.quoteId};}

export { detectIntent, normalizeCommand, addresses, amount, executionQuote };
