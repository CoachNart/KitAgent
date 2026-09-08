import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const appPath = 'src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');

const replacements = [
  ["import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';", "import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';\nimport PerpetualsPage from './PerpetualsPage.jsx';"],
  ["['nft','NFT studio',Gem]", "['perps','Perpetuals',Zap]"],
  ["{page==='nft'&&<NftPage prepare={prepare}/>} ", "{page==='perps'&&<PerpetualsPage wallet={wallet} connectWallet={connectWallet}/>} "],
  ["<button className=\"capability-card\" onClick={()=>go('nft')}><span className=\"cap-icon\"><Gem size={17}/></span><span><b>NFTs</b><small>Inspect, buy, list, sell and transfer.</small></span><ArrowRight size={15}/></button>", "<button className=\"capability-card\" onClick={()=>go('perps')}><span className=\"cap-icon\"><Zap size={17}/></span><span><b>Perpetual trading</b><small>Deposit, leverage, long, short and manage positions.</small></span><ArrowRight size={15}/></button>"],
];
for (const [from, to] of replacements) if (app.includes(from)) app = app.replace(from, to);
app = app.replace(/(?:import PerpetualsPage from '\.\/PerpetualsPage\.jsx';\n?)+/g, "import PerpetualsPage from './PerpetualsPage.jsx';\n");
if (!app.includes("import PerpetualsPage from './PerpetualsPage.jsx';")) throw new Error('PerpetualsPage import missing.');
if (!app.includes("page==='perps'&&<PerpetualsPage")) throw new Error('Perpetual route missing.');
fs.writeFileSync(appPath, app);

const perpPath = 'src/PerpetualsPage.jsx';
let perp = fs.readFileSync(perpPath, 'utf8');
perp = perp.replace("import { getActiveProvider } from './walletConnector.js';", "import { getActiveProvider } from './walletConnector.js';\nimport { encodeFunctionData } from 'viem';");
perp = perp.replace("function encodeApprove(spender, amountHex) { return '0x095ea7b3' + pad32(spender) + pad32(amountHex); }\nfunction encodeDeposit(to, assetIndex, routeType, amountHex) { return '0x' + 'deposit'.split('').map(c=>c.charCodeAt(0).toString(16)).join('').padEnd(8,'0') + pad32(to) + pad32(`0x${Number(assetIndex).toString(16)}`) + pad32(`0x${Number(routeType).toString(16)}`) + pad32(amountHex); }\nfunction pad32(v) { const raw=String(v).replace(/^0x/,'').padStart(64,'0'); return raw.slice(-64); }", "function encodeApprove(spender, amountHex) { return encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, BigInt(amountHex)] }); }\nfunction encodeDeposit(to, assetIndex, routeType, amountHex) { return encodeFunctionData({ abi: ABI, functionName: 'deposit', args: [to, assetIndex, routeType, BigInt(amountHex)] }); }");
fs.writeFileSync(perpPath, perp);

execFileSync(process.execPath,['scripts/fix-hl-migration-script.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/switch-perps-to-hyperliquid.mjs'],{stdio:'inherit'});
console.log('Perpetual migration applied: exact legacy terminal UI preserved, Hyperliquid is the provider/execution layer, and Market Analysis remains untouched.');
