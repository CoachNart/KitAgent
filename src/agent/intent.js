import {getToken,ZERO_ADDRESS,CHAINS} from '../chains/registry.js';

const CHAIN_KEYS=Object.keys(CHAINS);
const NAME_ALIASES={
  eth:'ethereum',ethereum:'ethereum',sepolia:'sepolia',
  base:'base',basesepolia:'baseSepolia','base sepolia':'baseSepolia',
  arbitrum:'arbitrum',arb:'arbitrum','arbitrum sepolia':'arbitrumSepolia',
  optimism:'optimism',op:'optimism','op mainnet':'optimism','optimism sepolia':'optimismSepolia',
  polygon:'polygon',matic:'polygon','polygon amoy':'polygonAmoy',
  bsc:'bsc',bnb:'bsc','bnb chain':'bsc','bnb smart chain':'bsc','bsc testnet':'bscTestnet',
  avalanche:'avalanche','avax':'avalanche',fuji:'avalancheFuji',
  gnosis:'gnosis','gnosis chain':'gnosis',celo:'celo',fantom:'fantom',cronos:'cronos',
  mantle:'mantle',linea:'linea',scroll:'scroll','zksync':'zksync','zk sync':'zksync',blast:'blast',
  mode:'mode',unichain:'unichain',berachain:'berachain',ink:'ink',soneium:'soneium',
  chiliz:'chiliz','chiliz chain':'chiliz',metis:'metis',neon:'neon',taiko:'taiko',kava:'kava',
  harmony:'harmony','harmony one':'harmony',moonbeam:'moonbeam',moonriver:'moonriver',
  'x layer':'okx',okx:'okx','zklink nova':'zklink',
  robinhood:'robinhood','robinhood chain':'robinhood','robinhood testnet':'robinhoodTestnet',
  solana:'solana','solana mainnet':'solana',devnet:'solanaDevnet','solana devnet':'solanaDevnet',
  bitcoin:'bitcoin',btc:'bitcoin','bitcoin testnet':'bitcoinTestnet',
  cosmos:'cosmos','cosmos hub':'cosmos',atom:'cosmos',osmosis:'osmosis',osmo:'osmosis',
  injective:'injective',inj:'injective',sui:'sui','sui testnet':'suiTestnet',
  aptos:'aptos',near:'near',polkadot:'polkadot',dot:'polkadot',tron:'tron',trx:'tron',
  xrp:'xrp','xrp ledger':'xrp',stellar:'stellar',xlm:'stellar',cardano:'cardano',ada:'cardano'
};
const aliases=Object.fromEntries(CHAIN_KEYS.map(k=>[k,k]));
Object.entries(NAME_ALIASES).forEach(([name,key])=>{if(CHAINS[key])aliases[name]=key});
export function resolveChain(value){const s=String(value||'').trim().toLowerCase();if(/^\d+$/.test(s)){const c=Object.values(CHAINS).find(x=>x.kind==='evm'&&x.id===Number(s));return c?.id||Number(s)}if(aliases[s])return CHAINS[aliases[s]].id;const hit=Object.keys(aliases).find(k=>s.includes(k));return hit?CHAINS[aliases[hit]].id:null}
export function parseSend(text){const m=String(text||'').match(/(?:send|transfer)\s+([\d.]+)\s*([A-Za-z0-9_-]+)?\s*(?:to)\s*(0x[a-fA-F0-9]{40})/i);return{amount:m?.[1]||'',asset:m?.[2]||'ETH',address:m?.[3]||''}}
export function parseBridge(text){const s=String(text||'');const m=s.match(/(?:bridge|move|send)\s+([\d.]+)\s*([A-Za-z0-9_-]+)\s+(?:to|onto|from\s+\S+\s+to)\s+([A-Za-z0-9 _-]+?)(?:\s+from\s+([A-Za-z0-9 _-]+))?$/i);if(!m)throw new Error('Use: Bridge 100 USDC to Base');const destination=String(m[3]).trim();const source=String(m[4]||'').trim();const toChain=resolveChain(destination);const fromChain=resolveChain(source);return{amount:m[1],asset:m[2],destination,source,toChain,fromChain}}
export function parseDefi(text){const s=String(text||'').trim();const action=(s.match(/\b(supply|deposit|withdraw|borrow|repay|stake|unstake|claim|lend)\b/i)||[])[1]?.toLowerCase();const m=s.match(/(?:supply|deposit|withdraw|borrow|repay|stake|unstake|lend)\s+([\d.]+)\s*([A-Za-z0-9_-]+)/i);return{action:action||'',amount:m?.[1]||'',asset:m?.[2]||''}}
export function classify(text){const s=String(text||'').toLowerCase();if(/portfolio|balance|holdings/.test(s))return'portfolio';if(/faucet|test eth|testnet gas/.test(s))return'faucet';if(/gas|fee|cost/.test(s))return'gas';if(/bridge|cross.?chain|move .* to /.test(s))return'bridge';if(/swap|exchange|trade/.test(s))return'swap';if(/supply|deposit|withdraw|borrow|repay|stake|unstake|lend|claim rewards/.test(s))return'defi';if(/nft|erc.?721|erc.?1155|token id/.test(s))return'nft';if(/batch|multiple calls/.test(s))return'batch';if(/approve|allowance/.test(s))return'contract';if(/contract|calldata|call 0x/.test(s))return'contract';if(/send|transfer/.test(s))return'send';return'contract'}
export function tokenFor(chainId,symbol){return getToken(chainId,symbol)||null}
export {ZERO_ADDRESS};