import fs from 'node:fs';

const path = 'src/App.jsx';
let s = fs.readFileSync(path, 'utf8');
const original = s;

const replacements = [
  ["import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';", "import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';\nimport PerpetualsPage from './PerpetualsPage.jsx';"],
  ["['nft','NFT studio',Gem]", "['perps','Perpetuals',Zap]"],
  ["{page==='nft'&&<NftPage prepare={prepare}/>} ", "{page==='perps'&&<PerpetualsPage wallet={wallet} connectWallet={connectWallet}/>} "],
  ["<button className=\"capability-card\" onClick={()=>go('nft')}><span className=\"cap-icon\"><Gem size={17}/></span><span><b>NFTs</b><small>Inspect, buy, list, sell and transfer.</small></span><ArrowRight size={15}/></button>", "<button className=\"capability-card\" onClick={()=>go('perps')}><span className=\"cap-icon\"><Zap size={17}/></span><span><b>Perpetual trading</b><small>Deposit, leverage, long, short and manage positions.</small></span><ArrowRight size={15}/></button>"],
];

for (const [from, to] of replacements) {
  if (!s.includes(from)) throw new Error(`Expected App.jsx fragment not found: ${from.slice(0, 90)}`);
  s = s.replace(from, to);
}

if (s.includes("page==='nft'&&<NftPage")) throw new Error('NFT route still present after migration.');
if (!s.includes("page==='perps'&&<PerpetualsPage")) throw new Error('Perpetual route missing after migration.');
if (s === original) throw new Error('No App.jsx changes were made.');

fs.writeFileSync(path, s);
console.log('Updated src/App.jsx: NFT navigation/surface replaced by Perpetuals; Market Analysis untouched.');
