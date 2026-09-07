const RPC_URL='https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_API='https://robinhoodchain.blockscout.com/api/v2';

const short=(a)=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'';
const weiToEth=(v)=>Number(BigInt(v||'0'))/1e18;

async function rpc(method,params=[]){
  const r=await fetch(RPC_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});
  if(!r.ok) throw new Error(`Robinhood RPC returned ${r.status}`);
  const j=await r.json();
  if(j.error) throw new Error(j.error.message||'RPC request failed');
  return j.result;
}

async function explorer(path){
  const r=await fetch(`${EXPLORER_API}${path}`);
  if(!r.ok) throw new Error(`Explorer returned ${r.status}`);
  return r.json();
}

async function walletSnapshot(address){
  const [balance,txs,tokens,nfts]=await Promise.allSettled([
    rpc('eth_getBalance',[address,'latest']),
    explorer(`/addresses/${address}/transactions?items_count=5`),
    explorer(`/addresses/${address}/tokens?type=ERC-20&items_count=20`),
    explorer(`/addresses/${address}/nft/collections?items_count=10`)
  ]);
  return {
    address,
    balance:balance.status==='fulfilled'?weiToEth(balance.value):null,
    transactions:txs.status==='fulfilled'?(txs.value.items||[]).length:null,
    tokens:tokens.status==='fulfilled'?(tokens.value.items||[]).filter(x=>x.token?.type==='ERC-20').length:null,
    nftCollections:nfts.status==='fulfilled'?(nfts.value.items||[]).length:null
  };
}

async function marketSnapshot(symbol='BTC/USDT',timeframe='4H'){
  const q=new URLSearchParams({symbol,timeframe});
  const r=await fetch(`/api/market?${q}`);
  if(!r.ok) throw new Error(`Market adapter returned ${r.status}`);
  return r.json();
}

async function perpetualSnapshot(symbol='BTC/USDT',timeframe='4H'){
  const q=new URLSearchParams({symbol,timeframe});
  const r=await fetch(`/api/perpetual?${q}`);
  if(!r.ok) throw new Error(`Perpetual adapter returned ${r.status}`);
  return r.json();
}

const workflow=(action,message)=>({kind:'prepare',action,message,stages:['Discover','Prepare','Review','Ask for approval','Execute','Verify']});

export async function executeAgent(text,{wallet='',pair='BTC/USDT',timeframe='4H'}={}){
  const input=text.trim();
  const lower=input.toLowerCase();
  if(!input) return {kind:'empty',message:'Tell me the outcome you want. I will inspect the live context, prepare the exact action, show the details, ask for approval, then execute and verify it.',stages:['Discover','Prepare','Review','Ask for approval','Execute','Verify']};

  if(/\b(what can you do|help|capabilit|how do you work|what are you)\b/.test(lower)){
    return {kind:'help',message:'Tell me what you want done in plain language. I can inspect live wallet state and markets, find airdrops and faucets, analyze spot and perpetual markets, and prepare swaps, bridges, staking, lending, borrowing, liquidity, NFT actions, transfers and approvals. For consequential actions I show the exact transaction, assets, fees and risk first, ask for your approval, execute through your wallet only after approval, then verify the result on-chain.',stages:['Discover','Prepare','Review','Ask for approval','Execute','Verify']};
  }

  if(/\b(balance|portfolio|wallet|holdings|tokens|assets|positions|approvals|transactions|recent activity)\b/.test(lower)){
    if(!wallet) return {kind:'wallet',message:'Connect a wallet and I can inspect its live Robinhood Chain balance, recent transactions, token holdings, NFT collections and supported on-chain state. Nothing is signed or moved by inspection.',stages:['Connect wallet','Inspect live state','Display results']};
    const s=await walletSnapshot(wallet);
    return {kind:'wallet',data:s,message:`Live wallet state for ${short(wallet)} on Robinhood Chain: ${s.balance==null?'balance unavailable':`${s.balance.toFixed(5)} ETH`}, ${s.tokens??'token data unavailable'} token holdings, ${s.nftCollections??'NFT'} NFT collections, and ${s.transactions??'transaction'} recent transactions indexed. This inspection is read-only.`,stages:['Inspect live wallet','Display results','Ready for next action']};
  }

  if(/\b(analy[sz]e|price|market|btc|eth|sol|xrp|signal|setup|technical)\b/.test(lower)){
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|DOT|TRX|UNI|AAVE|ARB|OP|SUI|PEPE)\s*\/?\s*USDT\b/i)?.[1]||pair.split('/')[0]).toUpperCase()+'/USDT';
    const tf=input.match(/\b(15m|30m|1h|4h|1d|1w)\b/i)?.[1]||timeframe;
    const data=await marketSnapshot(symbol,tf);
    return {kind:'market',data,message:`Live ${symbol} ${tf} market analysis is ready. I will display the current structure, indicators, bias, confidence and setup levels in the terminal. Analysis is read-only unless you explicitly ask me to prepare an action.`,stages:['Fetch live market','Analyze structure','Display thesis']};
  }

  if(/\b(perpetual|perp|futures)\b/.test(lower)){
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|DOT|TRX|UNI|AAVE|ARB|OP|SUI|PEPE)\s*\/?\s*USDT\b/i)?.[1]||'BTC').toUpperCase()+'/USDT';
    const tf=input.match(/\b(15m|30m|1h|4h|1d|1w)\b/i)?.[1]||timeframe;
    const data=await perpetualSnapshot(symbol,tf);
    return {kind:'perpetual',data,message:`Live perpetual data for ${symbol} ${tf} is ready. I will show the market thesis and risk context before any order workflow. No order is submitted without your explicit approval.`,stages:['Fetch live perpetual','Analyze setup','Display thesis','Await action request']};
  }

  if(/\b(airdrop|claim|eligib)\b/.test(lower)) return workflow({kind:'airdrop-claim',title:'Prepare airdrop claim',summary:'Scan supported eligibility sources, verify the claim target and prepare the wallet action.',amount:'Eligibility-dependent',risk:'Verify eligibility, contract, amount and gas before signing.'},'I will discover supported claims, verify the eligibility context, show the claim details and gas, then ask you to approve before anything is signed.');
  if(/\b(faucet|gas)\b/.test(lower)) return workflow({kind:'faucet',title:'Prepare faucet request',summary:'Find a supported faucet and prepare the request for the connected wallet.',amount:'Faucet-defined',risk:'External faucet request; review destination and limits.'},'I will find a supported faucet, show the destination and limits, and ask before submitting the request.');
  if(/\b(swap|trade|exchange)\b/.test(lower)) return workflow({kind:'swap',title:'Prepare token swap',summary:'Build the swap workflow and show quote, expected output, slippage, approvals and fees.',amount:'User-defined',risk:'DEX transaction; approval and slippage may be required.'},'I will build the swap, surface the live quote when an adapter is available, show expected output, slippage, fees and approvals, then ask for approval before the wallet signs.');
  if(/\b(bridge|move.*chain|cross.?chain)\b/.test(lower)) return workflow({kind:'bridge',title:'Prepare bridge transfer',summary:'Prepare the cross-chain transfer and show source, destination, amount, bridge, fees and estimated output.',amount:'User-defined',risk:'Bridge transaction; destination and bridge risk require review.'},'I will prepare the bridge route, display the exact transfer details and fees, ask for approval, then verify the resulting transaction.');
  if(/\b(stake|staking|lend|lending|borrow|borrowing|defi|liquidity|yield)\b/.test(lower)) return workflow({kind:'defi',title:'Prepare DeFi action',summary:'Prepare the requested DeFi workflow and surface protocol, asset, fee, approval and risk details.',amount:'User-defined',risk:'Protocol interaction; review smart-contract and asset risk.'},'I will inspect the requested DeFi workflow, show the protocol, assets, approvals, fees and expected result, then stop for your explicit approval.');
  if(/\b(nft|collectible|collection|list|sell.*nft|buy.*nft|transfer.*nft)\b/.test(lower)) return workflow({kind:'nft',title:'Prepare NFT action',summary:'Inspect the NFT context and prepare a buy, sell, list or transfer workflow with the relevant marketplace details.',amount:'Marketplace quote required',risk:'NFT movement or sale requires explicit approval.'},'I will inspect the NFT and marketplace context, display the asset, price or proceeds, fees and destination, then ask before listing, selling, buying or transferring it.');
  if(/\b(send|transfer|pay)\b/.test(lower)) return workflow({kind:'native-send',title:'Prepare ETH transfer',summary:'Validate the destination and amount, calculate gas and prepare the native ETH transaction.',amount:'User-defined',risk:'Native asset leaves the connected wallet only after explicit approval.'},'I will validate the destination and amount, display the exact transaction and gas, ask for approval, send only after you approve, then verify the transaction on-chain.');

  return {kind:'help',message:'I understand natural-language requests. Tell me the outcome you want, for example: “show my wallet”, “analyze ETH/USDT”, “find airdrops I qualify for”, “prepare a swap”, “sell my NFT”, or “send 0.1 ETH to this address”. I will inspect first, show the result, ask before consequential execution, then execute and verify.',stages:['Understand request','Discover context','Prepare when needed','Ask before execution','Execute','Verify']};
}
