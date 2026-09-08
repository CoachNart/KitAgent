import { readFile, writeFile } from 'node:fs/promises';

const p='src/PerpetualsPage.jsx';
let s=await readFile(p,'utf8');

s=s.replace("import {createWalletClient,custom} from 'viem';\nimport {arbitrum} from 'viem/chains';", "import {createWalletClient,custom} from 'viem';\nimport {arbitrum} from 'viem/chains';\nimport {useAppKit,useAppKitAccount,useAppKitProvider} from '@reown/appkit/react';");

s=s.replace("export default function PerpetualsPage({user}){", "export default function PerpetualsPage({user}){\n const {open}=useAppKit();\n const {address:appKitAddress,isConnected:appKitConnected}=useAppKitAccount({namespace:'eip155'});\n const {walletProvider}=useAppKitProvider('eip155');");

const oldWallet=/ const ensureWallet=async\(\)=>\{.*?return wc\};/s;
const newWallet=` const ensureWallet=async()=>{\n  if(wallet)return wallet;\n  const provider=walletProvider||window.ethereum;\n  const account=appKitAddress||address||(provider?.selectedAddress||'');\n  if(!provider||!account){\n   if(typeof open==='function'){open({view:'Connect',namespace:'eip155'});throw Error('Choose a wallet to connect to Hyperliquid.');}\n   throw Error('Wallet connection is unavailable.');\n  }\n  try{await provider.request?.({method:'wallet_switchEthereumChain',params:[{chainId:'0xa4b1'}]})}catch(e){\n   if(e?.code===4902)await provider.request?.({method:'wallet_addEthereumChain',params:[{chainId:'0xa4b1',chainName:'Arbitrum One',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://arb1.arbitrum.io/rpc'],blockExplorerUrls:['https://arbiscan.io']}]});\n   else if(e?.code!==4902)throw e;\n  }\n  const wc=createWalletClient({account,chain:arbitrum,transport:custom(provider)});\n  setWallet(wc);setAddress(account);notify('Wallet connected to Hyperliquid on Arbitrum.');\n  return wc;\n };`;
if(!oldWallet.test(s))throw Error('Wallet block not found');
s=s.replace(oldWallet,newWallet);

const legacy=/\n useEffect\(\(\)=>\{\n  let socket; let stopped=false;[\s\S]*?\n \},\[symbol,tf\]\);/;
s=s.replace(legacy,'');

const sync=`\n useEffect(()=>{\n  if(appKitConnected&&appKitAddress){setAddress(appKitAddress);setWallet(null);refresh().catch(()=>{});}\n },[appKitConnected,appKitAddress]);`;
const marker=" useEffect(()=>{const h=()=>{const a=window.ethereum?.selectedAddress||'';if(a){setAddress(a);setWallet(null)}};window.ethereum?.on?.('accountsChanged',h);if(window.ethereum?.selectedAddress)setAddress(window.ethereum.selectedAddress);return()=>window.ethereum?.removeListener?.('accountsChanged',h)},[]);";
if(!s.includes(marker))throw Error('Account listener marker not found');
s=s.replace(marker,marker+sync);

const oldConnect=" const connect=async()=>{try{await ensureWallet();const ex=await exchange();await ensureBuilder(ex);await refresh()}catch(e){notify(e?.message||'Wallet connection failed.')}};";
const newConnect=" const connect=async()=>{try{if(!appKitConnected&&!address&&!wallet){if(typeof open==='function'){open({view:'Connect',namespace:'eip155'});return;}await ensureWallet();}else{const ex=await exchange();await ensureBuilder(ex);await refresh();}}catch(e){notify(e?.message||'Wallet connection failed.')}};";
if(!s.includes(oldConnect))throw Error('Connect handler not found');
s=s.replace(oldConnect,newConnect);

await writeFile(p,s);
console.log('Wallet connection repaired: AppKit + WalletConnect/injected support enabled; legacy Bybit stream removed.');
