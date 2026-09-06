const FAUCETS={
  robinhoodTestnet:'https://faucet.testnet.chain.robinhood.com',
  sepolia:'https://www.alchemy.com/faucets/ethereum-sepolia',
  baseSepolia:'https://www.alchemy.com/faucets/base-sepolia',
  arbitrumSepolia:'https://www.alchemy.com/faucets/arbitrum-sepolia',
  optimismSepolia:'https://console.optimism.io/faucet',
  polygonAmoy:'https://faucet.polygon.technology/',
  bscTestnet:'https://www.bnbchain.org/en/testnet-faucet',
  avalancheFuji:'https://core.app/tools/testnet-faucet/',
  solanaDevnet:'https://faucet.solana.com/',
  suiTestnet:'https://faucet.sui.io/',
};

const ALIASES={
  ethereum:'sepolia','eth':'sepolia','base':'baseSepolia','arbitrum':'arbitrumSepolia','optimism':'optimismSepolia',
  polygon:'polygonAmoy','bsc':'bscTestnet','bnb':'bscTestnet','avalanche':'avalancheFuji','avax':'avalancheFuji',
  solana:'solanaDevnet','sui':'suiTestnet'
};

function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data))}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const {prompt='',chain=''}=req.body||{};
    const text=String(prompt).toLowerCase();
    const requested=String(chain||'').trim();
    const detected=Object.keys(FAUCETS).find(k=>text.includes(k.toLowerCase()))||Object.keys(ALIASES).find(k=>text.includes(k));
    const key=FAUCETS[requested]?requested:(detected&&FAUCETS[detected]?detected:ALIASES[detected]||null);
    if(!key||!FAUCETS[key])return json(res,404,{error:'No verified public faucet is registered for that network yet. Choose a supported testnet from the Chain Categories menu.'});
    return json(res,200,{ok:true,chain:key,url:FAUCETS[key],message:`Verified faucet found for ${key}. Opening the network faucet with your connected address.`});
  }catch(e){return json(res,500,{error:e?.message||'Faucet request failed'})}
}
