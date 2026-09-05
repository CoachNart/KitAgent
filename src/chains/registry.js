export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const evm=(id,name,native,rpc,explorer,testnet=false,extra={})=>({id,hex:`0x${id.toString(16)}`,name,native,rpc,explorer,testnet,namespace:'eip155',kind:'evm',...extra});
const nonEvm=(key,name,native,namespace,extra={})=>({key,name,native,namespace,kind:'non-evm',testnet:false,...extra});

export const CHAINS = {
  robinhood: evm(4663,'Robinhood Chain','ETH','https://rpc.mainnet.chain.robinhood.com','https://robinhoodchain.blockscout.com'),
  robinhoodTestnet: evm(46630,'Robinhood Chain Testnet','ETH','https://rpc.testnet.chain.robinhood.com','https://explorer.testnet.chain.robinhood.com',true,{faucet:'https://faucet.testnet.chain.robinhood.com'}),
  ethereum: evm(1,'Ethereum','ETH','https://ethereum-rpc.publicnode.com','https://etherscan.io'),
  sepolia: evm(11155111,'Ethereum Sepolia','ETH','https://ethereum-sepolia-rpc.publicnode.com','https://sepolia.etherscan.io',true),
  base: evm(8453,'Base','ETH','https://mainnet.base.org','https://basescan.org'),
  baseSepolia: evm(84532,'Base Sepolia','ETH','https://sepolia.base.org','https://sepolia.basescan.org',true),
  arbitrum: evm(42161,'Arbitrum One','ETH','https://arb1.arbitrum.io/rpc','https://arbiscan.io'),
  arbitrumSepolia: evm(421614,'Arbitrum Sepolia','ETH','https://sepolia-rollup.arbitrum.io/rpc','https://sepolia.arbiscan.io',true),
  optimism: evm(10,'OP Mainnet','ETH','https://mainnet.optimism.io','https://optimistic.etherscan.io'),
  optimismSepolia: evm(11155420,'OP Sepolia','ETH','https://sepolia.optimism.io','https://sepolia-optimism.etherscan.io',true),
  polygon: evm(137,'Polygon','POL','https://polygon-rpc.com','https://polygonscan.com'),
  polygonAmoy: evm(80002,'Polygon Amoy','POL','https://rpc-amoy.polygon.technology','https://amoy.polygonscan.com',true),
  bsc: evm(56,'BNB Chain','BNB','https://bsc-dataseed.bnbchain.org','https://bscscan.com'),
  bscTestnet: evm(97,'BNB Chain Testnet','tBNB','https://data-seed-prebsc-1-s1.bnbchain.org:8545','https://testnet.bscscan.com',true),
  avalanche: evm(43114,'Avalanche C-Chain','AVAX','https://api.avax.network/ext/bc/C/rpc','https://snowtrace.io'),
  avalancheFuji: evm(43113,'Avalanche Fuji','AVAX','https://api.avax-test.network/ext/bc/C/rpc','https://testnet.snowtrace.io',true),
  gnosis: evm(100,'Gnosis','xDAI','https://rpc.gnosischain.com','https://gnosisscan.io'),
  celo: evm(42220,'Celo','CELO','https://forno.celo.org','https://celoscan.io'),
  fantom: evm(250,'Fantom','FTM','https://rpcapi.fantom.network','https://ftmscan.com'),
  cronos: evm(25,'Cronos','CRO','https://evm.cronos.org','https://cronoscan.com'),
  moonriver: evm(1285,'Moonriver','MOVR','https://rpc.api.moonriver.moonbeam.network','https://moonriver.moonscan.io'),
  mantle: evm(5000,'Mantle','MNT','https://rpc.mantle.xyz','https://mantlescan.xyz'),
  linea: evm(59144,'Linea','ETH','https://rpc.linea.build','https://lineascan.build'),
  scroll: evm(534352,'Scroll','ETH','https://rpc.scroll.io','https://scrollscan.com'),
  zksync: evm(324,'zkSync Era','ETH','https://mainnet.era.zksync.io','https://explorer.zksync.io'),
  blast: evm(81457,'Blast','ETH','https://rpc.blast.io','https://blastscan.io'),
  mode: evm(34443,'Mode','ETH','https://mainnet.mode.network','https://explorer.mode.network'),
  unichain: evm(130,'Unichain','ETH','https://mainnet.unichain.org','https://uniscan.xyz'),
  berachain: evm(80094,'Berachain','BERA','https://rpc.berachain.com','https://berascan.com'),
  ink: evm(57073,'Ink','ETH','https://rpc-gel.inkonchain.com','https://explorer.inkonchain.com'),
  soneium: evm(1868,'Soneium','ETH','https://rpc.soneium.org','https://soneium.blockscout.com'),
  chiliz: evm(88888,'Chiliz Chain','CHZ','https://rpc.chiliz.com','https://chiliscan.com'),
  metis: evm(1088,'Metis','METIS','https://andromeda.metis.io/?owner=1088','https://andromeda-explorer.metisdevops.link'),
  neon: evm(245022934,'Neon EVM','NEON','https://neon-evm-rpc.publicnode.com','https://neonscan.org'),
  taiko: evm(167000,'Taiko','ETH','https://rpc.mainnet.taiko.xyz','https://taikoscan.io'),
  kava: evm(2222,'Kava EVM','KAVA','https://evm.kava.io','https://kavascan.com'),
  harmony: evm(1666600000,'Harmony','ONE','https://api.harmony.one','https://explorer.harmony.one'),
  moonbeam: evm(1284,'Moonbeam','GLMR','https://rpc.api.moonbeam.network','https://moonscan.io'),
  okx: evm(66,'X Layer','OKB','https://rpc.xlayer.tech','https://www.oklink.com/x-layer'),
  zklink: evm(810180,'zkLink Nova','ETH','https://rpc.zklink.io','https://explorer.zklink.io'),
  // Non-EVM networks are first-class catalog entries. Their namespace tells the adapter which signing protocol to use.
  solana: nonEvm('solana','Solana','SOL','solana',{chainId:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',rpc:'https://api.mainnet-beta.solana.com',explorer:'https://solscan.io'}),
  solanaDevnet: nonEvm('solanaDevnet','Solana Devnet','SOL','solana',{testnet:true,chainId:'EtWTRABZaYq6iMfeYKouRu166Q2ZfhA6P',rpc:'https://api.devnet.solana.com',explorer:'https://solscan.io/?cluster=devnet',faucet:'https://faucet.solana.com'}),
  bitcoin: nonEvm('bitcoin','Bitcoin','BTC','bip122',{chainId:'000000000019d6689c085ae165831e934ff763ae46a2e0a9c5b0c7d0c6d7d5',explorer:'https://mempool.space'}),
  bitcoinTestnet: nonEvm('bitcoinTestnet','Bitcoin Testnet','BTC','bip122',{testnet:true,chainId:'000000000933ea01ad0ee984209779baae2c7b1c9c4e1e9c3d7b2b6c3b8c9a8',explorer:'https://mempool.space/testnet'}),
  cosmos: nonEvm('cosmos','Cosmos Hub','ATOM','cosmos',{chainId:'cosmoshub-4',rpc:'https://cosmos-rpc.publicnode.com',explorer:'https://www.mintscan.io/cosmos'}),
  osmosis: nonEvm('osmosis','Osmosis','OSMO','cosmos',{chainId:'osmosis-1',rpc:'https://osmosis-rpc.publicnode.com',explorer:'https://www.mintscan.io/osmosis'}),
  injective: nonEvm('injective','Injective','INJ','cosmos',{chainId:'injective-1',rpc:'https://injective-rpc.publicnode.com',explorer:'https://www.mintscan.io/injective'}),
  sui: nonEvm('sui','Sui','SUI','sui',{chainId:'mainnet',rpc:'https://fullnode.mainnet.sui.io:443',explorer:'https://suiscan.xyz/mainnet/home'}),
  suiTestnet: nonEvm('suiTestnet','Sui Testnet','SUI','sui',{testnet:true,chainId:'testnet',rpc:'https://fullnode.testnet.sui.io:443',explorer:'https://suiscan.xyz/testnet/home'}),
  aptos: nonEvm('aptos','Aptos','APT','aptos',{chainId:'1',rpc:'https://fullnode.mainnet.aptoslabs.com/v1',explorer:'https://explorer.aptoslabs.com/?network=mainnet'}),
  near: nonEvm('near','NEAR','NEAR','near',{chainId:'mainnet',rpc:'https://rpc.mainnet.near.org',explorer:'https://nearblocks.io'}),
  polkadot: nonEvm('polkadot','Polkadot','DOT','polkadot',{chainId:'91b171bb158e2d3848fa23a9f1c25182',explorer:'https://polkadot.subscan.io'}),
  tron: nonEvm('tron','TRON','TRX','tron',{chainId:'mainnet',rpc:'https://api.trongrid.io',explorer:'https://tronscan.org'}),
  xrp: nonEvm('xrp','XRP Ledger','XRP','xrpl',{chainId:'0',rpc:'https://xrplcluster.com',explorer:'https://livenet.xrpl.org'}),
  stellar: nonEvm('stellar','Stellar','XLM','stellar',{chainId:'mainnet',rpc:'https://horizon.stellar.org',explorer:'https://stellar.expert/explorer/public'}),
  cardano: nonEvm('cardano','Cardano','ADA','cardano',{chainId:'mainnet',rpc:'https://api.koios.rest/api/v1',explorer:'https://cardanoscan.io'}),
};

export const EVM_CHAINS=Object.fromEntries(Object.entries(CHAINS).filter(([,c])=>c.kind==='evm'));
export const NON_EVM_CHAINS=Object.fromEntries(Object.entries(CHAINS).filter(([,c])=>c.kind!=='evm'));
export const getToken=(chainId,value)=>{const list=TOKENS[chainId]||{};if(!value)return null;if(/^0x[a-fA-F0-9]{40}$/.test(value))return Object.values(list).find(t=>t.address.toLowerCase()===value.toLowerCase())||{address:value,symbol:'TOKEN',decimals:18,verified:false};return list[String(value).toUpperCase()]||null};
export const chainById=id=>Object.values(CHAINS).find(c=>c.id===Number(id));
export const chainByKey=key=>CHAINS[key]||null;
export const chainList=()=>Object.entries(CHAINS).map(([key,chain])=>({key,...chain}));
export const isEvmChain=chain=>chain?.kind==='evm';

export const TOKENS={
  1:{ETH:{symbol:'ETH',name:'Ether',decimals:18,address:ZERO_ADDRESS,verified:true},USDC:{symbol:'USDC',name:'USD Coin',decimals:6,address:'0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',verified:true},USDT:{symbol:'USDT',name:'Tether USD',decimals:6,address:'0xdAC17F958D2ee523a2206206994597C13D831ec7',verified:true}},
  8453:{ETH:{symbol:'ETH',name:'Ether',decimals:18,address:ZERO_ADDRESS,verified:true},USDC:{symbol:'USDC',name:'USD Coin',decimals:6,address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',verified:true}},
  42161:{ETH:{symbol:'ETH',name:'Ether',decimals:18,address:ZERO_ADDRESS,verified:true},USDC:{symbol:'USDC',name:'USD Coin',decimals:6,address:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',verified:true}},
  137:{POL:{symbol:'POL',name:'POL',decimals:18,address:ZERO_ADDRESS,verified:true},USDC:{symbol:'USDC',name:'USD Coin',decimals:6,address:'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',verified:true}},
  56:{BNB:{symbol:'BNB',name:'BNB',decimals:18,address:ZERO_ADDRESS,verified:true},USDT:{symbol:'USDT',name:'Tether USD',decimals:18,address:'0x55d398326f99059fF775485246999027B3197955',verified:true}},
  4663:{ETH:{symbol:'ETH',name:'Ether',decimals:18,address:ZERO_ADDRESS,verified:true},WETH:{symbol:'WETH',name:'Wrapped Ether',decimals:18,address:'0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',verified:true},USDG:{symbol:'USDG',name:'USDG',decimals:18,address:'0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',verified:true}},
  46630:{ETH:{symbol:'ETH',name:'Ether',decimals:18,address:ZERO_ADDRESS,verified:true}}
};