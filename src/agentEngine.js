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

export async function executeAgent(text,{wallet='',pair='BTC/USDT',timeframe='4H'}={}){
  const input=text.trim();
  const lower=input.toLowerCase();
  if(!input) return {kind:'empty',message:'Tell me what you want KitAgent to inspect, prepare or execute.'};

  if(/\b(balance|portfolio|wallet|holdings|tokens|assets)\b/.test(lower)){
    if(!wallet) return {kind:'wallet',message:'Connect a wallet first. Then I can read its live Robinhood Chain balance, recent activity, token holdings and NFT collections.'};
    const s=await walletSnapshot(wallet);
    return {kind:'wallet',data:s,message:`Live wallet snapshot for ${short(wallet)}: ${s.balance==null?'balance unavailable':`${s.balance.toFixed(5)} ETH`} on Robinhood Chain. ${s.tokens??'Token data unavailable'} token holdings and ${s.nftCollections??'NFT'} NFT collections detected.`};
  }

  if(/\b(analy[sz]e|price|market|btc|eth|sol|xrp|signal|setup|technical)\b/.test(lower)){
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|DOT|TRX|UNI|AAVE|ARB|OP|SUI|PEPE)\s*\/?\s*USDT\b/i)?.[1]||pair.split('/')[0]).toUpperCase()+'/USDT';
    const tf=input.match(/\b(15m|30m|1h|4h|1d|1w)\b/i)?.[1]||timeframe;
    const data=await marketSnapshot(symbol,tf);
    return {kind:'market',data,message:`Live ${symbol} ${tf} analysis is ready. Bias: ${data.bias||data.signal||'available in analysis'}. ${data.confidence!=null?`Confidence: ${data.confidence}%.`:''} I have not created a transaction.`};
  }

  if(/\b(perpetual|perp|futures)\b/.test(lower)){
    const symbol=(input.match(/\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|LINK|DOT|TRX|UNI|AAVE|ARB|OP|SUI|PEPE)\s*\/?\s*USDT\b/i)?.[1]||'BTC').toUpperCase()+'/USDT';
    const tf=input.match(/\b(15m|30m|1h|4h|1d|1w)\b/i)?.[1]||timeframe;
    const data=await perpetualSnapshot(symbol,tf);
    return {kind:'perpetual',data,message:`Live perpetual data for ${symbol} ${tf} is ready. I can use it to prepare a setup, but no order is submitted without your explicit approval.`};
  }

  if(/\b(airdrop|claim|eligib)\b/.test(lower)) return {kind:'prepare',action:{kind:'airdrop-claim',title:'Prepare airdrop claim',summary:'Scan supported eligibility sources and prepare the claim.',amount:'Eligibility-dependent',risk:'Verify eligibility, contract, amount and gas before signing.'},message:'I can scan supported claim sources, identify eligibility and prepare the claim. I will stop before the wallet signature.'};
  if(/\b(faucet|gas)\b/.test(lower)) return {kind:'prepare',action:{kind:'faucet',title:'Prepare faucet request',summary:'Find a supported faucet and prepare the request for the connected wallet.',amount:'Faucet-defined',risk:'External faucet request; review destination and limits.'},message:'I can find supported faucets and prepare the request. Nothing is submitted automatically.'};
  if(/\b(swap|trade|exchange)\b/.test(lower)) return {kind:'prepare',action:{kind:'swap',title:'Prepare token swap',summary:'Build a swap workflow and review expected output, slippage and fees.',amount:'User-defined',risk:'DEX transaction; approval and slippage may be required.'},message:'I can prepare the swap, surface quote/risk information when an adapter is available, and wait for your approval.'};
  if(/\b(bridge|move.*chain|cross.?chain)\b/.test(lower)) return {kind:'prepare',action:{kind:'bridge',title:'Prepare bridge transfer',summary:'Prepare a cross-chain transfer and review destination and fees.',amount:'User-defined',risk:'Bridge transaction; destination and bridge risk require review.'},message:'I can prepare the bridge workflow and show the transaction details before asking you to sign.'};
  if(/\b(stake|staking|lend|lending|borrow|borrowing|defi|liquidity|yield)\b/.test(lower)) return {kind:'prepare',action:{kind:'defi',title:'Prepare DeFi action',summary:'Prepare the requested DeFi workflow and surface protocol, fee and approval requirements.',amount:'User-defined',risk:'Protocol interaction; review smart-contract and asset risk.'},message:'I can prepare this DeFi workflow and keep execution permission-gated.'};
  if(/\b(nft|collectible|collection|list|sell.*nft|buy.*nft|transfer.*nft)\b/.test(lower)) return {kind:'prepare',action:{kind:'nft',title:'Prepare NFT action',summary:'Inspect the NFT context and prepare a buy, sell, list or transfer workflow.',amount:'Marketplace quote required',risk:'NFT movement or sale requires explicit approval.'},message:'I can inspect NFT data and prepare the marketplace action. The asset never moves without your approval.'};
  if(/\b(send|transfer|pay)\b/.test(lower)) return {kind:'prepare',action:{kind:'native-send',title:'Prepare ETH transfer',summary:'Prepare a native ETH transfer after validating the destination and amount.',amount:'User-defined',risk:'Native asset leaves the connected wallet only after explicit approval.'},message:'I can prepare an ETH transfer. I need the destination and amount before any signature.'};

  return {kind:'help',message:'I can work with live wallet data, market and perpetual analysis, airdrops, faucets, swaps, bridges, staking, lending, borrowing, DeFi, NFTs, transfers, approvals and transaction preparation. Consequential actions always stop for your permission.'};
}
