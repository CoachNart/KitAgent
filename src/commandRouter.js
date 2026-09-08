import { planCommand as planRuntimeCommand, detectIntent, normalizeCommand as normalizeRuntimeCommand } from './agentRuntime.js';
import { adapterRegistry } from './adapters/index.js';
import { getActiveProvider, getConnectedAddress } from './walletConnector.js';
import { getDecimals, parseUnits } from './onchain/erc20.js';

const ADDRESS=/0x[0-9a-fA-F]{40}/g;
const NATIVE=/\b(eth|ether|native|rbh|robinhood)\b/i;
const clean=value=>String(value||'').trim().replace(/(\d)\s+\.(?=\d)/g,'$1.').replace(/\s+/g,' ');
const addresses=value=>clean(value).match(ADDRESS)||[];
const amount=value=>clean(value).match(/\b\d+(?:\.\d+)?\b/)?.[0]||null;
const actionResult=(execution,intent)=>({kind:'prepare',action:{kind:intent,title:execution.title,summary:execution.expectedChanges?.join(' • ')||execution.title,risk:execution.risk||[],executionPlan:execution},message:`Prepared ${execution.title}. I simulated the transaction plan and will wait for your explicit approval before signing.`,data:{adapter:execution.adapter,transactions:execution.transactions?.length||0,expectedChanges:execution.expectedChanges,risk:execution.risk},stages:['Understand','Discover','Prepare','Review','Ask for approval']});

async function routeDirect(command,wallet){
  const input=clean(command),lower=input.toLowerCase(),from=wallet||getConnectedAddress(),found=addresses(input),qty=amount(input);

  if(/\bmorpho\b/.test(lower)&&/\b(deposit|withdraw)\b/.test(lower)&&/\bvault\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first. Morpho vault actions require wallet approval.',stages:['Understand','Connect wallet']};
    const vault=found[0],operation=/\bdeposit\b/.test(lower)?'vault-deposit':'vault-withdraw';
    if(!vault||!qty)return{kind:'clarify',message:'Morpho vault actions need the vault address and amount in the vault token’s base units. Example: “deposit 1000000 into Morpho vault 0xVAULT”.',stages:['Understand','Missing vault or amount']};
    if(!/^\d+$/.test(qty))return{kind:'clarify',message:'For a Morpho vault action, enter the amount in base units as a whole number so KitSetups does not guess token decimals.',stages:['Understand','Invalid base-unit amount']};
    const execution=await adapterRegistry.get('morpho').prepare({provider:getActiveProvider(),from,operation,vault,amount:qty});
    return actionResult(execution,'morpho');
  }

  if(/\b(transfer|send)\b/.test(lower)&&/\b(nft|erc721)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first.',stages:['Understand','Connect wallet']};
    const id=input.match(/(?:token\s*id|#)\s*(\d+)/i)?.[1]||input.match(/\b(\d+)\b/)?.[1];
    if(found.length<2||!id)return{kind:'clarify',message:'NFT transfer needs NFT contract, numeric token ID and recipient address.',stages:['Understand','Missing NFT details']};
    const execution=await adapterRegistry.get('erc721').prepare({from,token:found[0],to:found[1],tokenId:id});
    return actionResult(execution,'nft-transfer');
  }

  if(/\b(prepare\s+)?swap\b|\bexchange\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first. Then I can quote, simulate and prepare the swap.',stages:['Understand','Connect wallet']};
    if(!qty)return{kind:'clarify',message:'Tell me the swap amount and route. Example: “swap 0.0004 ETH for 0xTOKEN_ADDRESS”.',stages:['Understand','Missing amount','Missing route']};
    const nativeIn=NATIVE.test(input)&&!/\b(for|to|into)\s+(eth|ether|native|rbh)\b/i.test(input);
    const nativeOut=/\b(for|to|into)\s+(eth|ether|native|rbh)\b/i.test(input);
    let tokenIn=found[0]||null,tokenOut=found[1]||null;
    if(nativeIn&&!tokenOut)tokenOut=found[0]||null;
    if(nativeIn&&!tokenOut)return{kind:'clarify',message:'I need the destination token contract address to prepare this ETH swap.',stages:['Understand','Missing token route']};
    if(nativeOut&&!tokenIn)return{kind:'clarify',message:'I need the input token contract address to prepare this token → ETH swap.',stages:['Understand','Missing token route']};
    if(!nativeIn&&!nativeOut&&found.length<2)return{kind:'clarify',message:'Token swaps need both token contract addresses. Example: “swap 10 0xTOKEN_IN for 0xTOKEN_OUT”.',stages:['Understand','Missing token route']};
    const amountIn=nativeIn?qty:parseUnits(qty,await getDecimals(tokenIn));
    const execution=await adapterRegistry.get('uniswap-v2').prepare({from,tokenIn,tokenOut,amountIn,slippageBps:50,nativeIn,nativeOut});
    return actionResult(execution,'swap');
  }

  if(/\b(send|transfer|pay)\b/.test(lower)&&found.length>=1&&!/\b(nft|erc721)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first. The transfer will remain permission-gated.',stages:['Understand','Connect wallet']};
    if(!qty)return{kind:'clarify',message:'Tell me the amount and recipient address.',stages:['Understand','Missing amount']};
    if(NATIVE.test(input)){
      const to=found[found.length-1],parts=qty.split('.'),fraction=(parts[1]||'').padEnd(18,'0').slice(0,18),amountWei=BigInt(parts[0]||'0')*1000000000000000000n+BigInt(fraction||'0');
      const execution=await adapterRegistry.get('native-eth').prepare({from,to,amountWei});
      return actionResult(execution,'native-send');
    }
    if(found.length<2)return{kind:'clarify',message:'Token transfer needs token contract, amount and recipient address.',stages:['Understand','Missing token route']};
    const token=found[0],to=found[found.length-1],execution=await adapterRegistry.get('erc20').prepare({from,token,to,amount:parseUnits(qty,await getDecimals(token)),mode:'transfer'});
    return actionResult(execution,'token-transfer');
  }

  if(/\b(approve|allow)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first. Token approval requires an explicit wallet signature.',stages:['Understand','Connect wallet']};
    if(found.length<2||!qty)return{kind:'clarify',message:'Approval needs token contract, amount and spender address.',stages:['Understand','Missing approval details']};
    const execution=await adapterRegistry.get('erc20').prepare({from,token:found[0],to:found[1],amount:parseUnits(qty,await getDecimals(found[0])),mode:'approve'});
    return actionResult(execution,'token-approve');
  }

  if(/\b(long|short)\b/.test(lower)&&/\b(perp|perpetual|futures)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first. Lighter requires a wallet-authorized trading key.',stages:['Understand','Connect wallet']};
    const side=/\blong\b/.test(lower)?'buy':'sell',symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ARB|OP|SUI|AVAX)\b/i)?.[1]||'BTC').toUpperCase(),size=qty;
    if(!size)return{kind:'clarify',message:'Tell me the perpetual position size, e.g. “long BTC perpetual 0.01”.',stages:['Understand','Missing position size']};
    const execution=await adapterRegistry.get('lighter').prepare({from,provider:getActiveProvider(),operation:'market-order',symbol,side,size,slippage:0.01});
    return actionResult(execution,'lighter-order');
  }

  if(/\b(cancel|close)\b/.test(lower)&&/\b(order|position)\b/.test(lower)&&/\b(lighter|perp|perpetual)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first.',stages:['Understand','Connect wallet']};
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ARB|OP|SUI|AVAX)\b/i)?.[1]||'BTC').toUpperCase(),operation=/\bclose\b/.test(lower)?'close-position':'cancel-order',orderIndex=input.match(/\b(?:order|index)\s*(?:#|:)?\s*(\d+)\b/i)?.[1];
    if(operation==='cancel-order'&&orderIndex==null)return{kind:'clarify',message:'Give me the Lighter order index to cancel.',stages:['Understand','Missing order index']};
    const execution=await adapterRegistry.get('lighter').prepare({from,provider:getActiveProvider(),operation,symbol,orderIndex});
    return actionResult(execution,'lighter-order');
  }

  if(/\bleverage\b/.test(lower)&&/\b(lighter|perp|perpetual)\b/.test(lower)){
    if(!from)return{kind:'clarify',message:'Connect your wallet first.',stages:['Understand','Connect wallet']};
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ARB|OP|SUI|AVAX)\b/i)?.[1]||'BTC').toUpperCase(),lev=input.match(/\b(\d+(?:\.\d+)?)\s*x\b/i)?.[1]||input.match(/leverage\s+(\d+(?:\.\d+)?)/i)?.[1];
    if(!lev)return{kind:'clarify',message:'Tell me the leverage, e.g. “set BTC perpetual leverage 5x”.',stages:['Understand','Missing leverage']};
    const execution=await adapterRegistry.get('lighter').prepare({from,provider:getActiveProvider(),operation:'leverage',symbol,leverage:lev});
    return actionResult(execution,'lighter-order');
  }

  return planRuntimeCommand({command:normalizeRuntimeCommand(input),wallet:from});
}

export async function executeAgent(command,context={}){return routeDirect(command,context.wallet||getConnectedAddress());}
export { detectIntent, clean as normalizeCommand };
