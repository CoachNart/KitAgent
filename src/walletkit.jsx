import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getAccount, watchAccount } from '@wagmi/core';
import { QueryClient } from '@tanstack/react-query';

const projectId=import.meta.env.VITE_REOWN_PROJECT_ID||import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const fallbackProjectId='94314a4ef9da3dd09a3b858adef781e9';
const hyperliquidChain={id:42161,caipNetworkId:'eip155:42161',chainNamespace:'eip155',name:'Arbitrum One',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://arb1.arbitrum.io/rpc']},public:{http:['https://arb1.arbitrum.io/rpc']}},blockExplorers:{default:{name:'Arbiscan',url:'https://arbiscan.io'}}};
const walletDappUrl=()=>typeof window!=='undefined'?window.location.href:'https://kitsetups.xyz';
const customWallets=[
 {id:'metamask',name:'MetaMask',homepage:'https://metamask.io',mobile_link:`https://metamask.app.link/dapp/${typeof window!=='undefined'?window.location.host:'kitsetups.xyz'}`},
 {id:'trust',name:'Trust Wallet',homepage:'https://trustwallet.com',mobile_link:`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(walletDappUrl())}`},
 {id:'coinbase',name:'Coinbase Wallet',homepage:'https://www.coinbase.com/wallet',mobile_link:`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(walletDappUrl())}`}
];
if(!projectId)console.warn('KitSetups wallet: VITE_REOWN_PROJECT_ID is not configured; using the configured fallback project.');
export const queryClient=new QueryClient();
export const networks=[hyperliquidChain];
const activeProjectId=projectId||fallbackProjectId;
export const wagmiAdapter=new WagmiAdapter({projectId:activeProjectId,networks,ssr:false});
export const appKit=createAppKit({adapters:[wagmiAdapter],networks,defaultNetwork:hyperliquidChain,projectId:activeProjectId,metadata:{name:'KitSetups',description:'The Crypto Command Center',url:typeof window!=='undefined'?window.location.origin:'https://kitsetups.xyz',icons:[typeof window!=='undefined'?`${window.location.origin}/kitsetups-logo.svg`:'https://www.kitsetups.xyz/kitsetups-logo.svg']},customWallets,allWallets:'ONLY_MOBILE',features:{analytics:false,email:false,socials:[]},themeMode:'dark',enableReconnect:true,enableNetworkSwitch:true,enableMobileFullScreen:true,experimental_preferUniversalLinks:true});
let pending=null;
const state=()=>getAccount(wagmiAdapter.wagmiConfig);
const injected=()=>typeof window!=='undefined'&&window.ethereum?.request?window.ethereum:null;
const isMobile=()=>typeof window!=='undefined'&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function connectInjected(){const ethereum=injected();if(!ethereum)return null;const accounts=await ethereum.request({method:'eth_requestAccounts'});const address=accounts?.[0];if(!address)throw new Error('No wallet account was returned.');return{address,provider:ethereum};}
function waitForConnection(timeoutMs=30000){const current=state();if(current.isConnected&&current.address)return Promise.resolve({address:current.address,provider:appKit.getWalletProvider?.()||injected()});if(pending)return pending;pending=new Promise((resolve,reject)=>{let timer;let stop;const finish=(value,error)=>{if(timer)clearTimeout(timer);stop?.();pending=null;error?reject(error):resolve(value)};try{stop=watchAccount(wagmiAdapter.wagmiConfig,{onChange:a=>{if(a.isConnected&&a.address)finish({address:a.address,provider:appKit.getWalletProvider?.()||injected()})}})}catch(error){finish(null,error);return}timer=setTimeout(()=>finish(null,new Error('Wallet connection timed out. Choose a wallet in the connection window or open KitSetups inside your wallet app.')),timeoutMs)});return pending}

export async function connectWallet(){
 if(pending)return pending;
 try{
  const direct=await connectInjected();
  if(direct)return direct;
  const current=state();
  if(current.isConnected&&current.address)return{address:current.address,provider:appKit.getWalletProvider?.()||injected()};
  // On mobile, AppKit's wallet list now exposes wallet-specific universal/deep links.
  // This avoids the old indefinite spinner while still leaving WalletConnect as the fallback.
  await appKit.open({view:'Connect',namespace:'eip155'});
  const result=await waitForConnection(isMobile()?30000:20000);
  return{address:result.address,provider:appKit.getWalletProvider?.()||result.provider||injected()};
 }catch(error){
  pending=null;
  try{await appKit.close?.()}catch{}
  const code=error?.code;
  if(code===4001||code==='ACTION_REJECTED')throw new Error('Wallet connection was cancelled.');
  if(code==='USER_REJECTED')throw new Error('Wallet connection was cancelled.');
  throw error instanceof Error?error:new Error('Wallet connection could not be completed.');
 }
}
export async function resumePendingWalletConnection(){const ethereum=injected();if(ethereum?.selectedAddress)return{address:ethereum.selectedAddress,provider:ethereum};const a=state();return a.isConnected&&a.address?{address:a.address,provider:appKit.getWalletProvider?.()||null}:null}
export function getActiveProvider(){return appKit.getWalletProvider?.()||injected()||null}
export function getConnectedAddress(){return state().address||injected()?.selectedAddress||''}
export function isWalletConnected(){const a=state();return Boolean(a.isConnected&&a.address)||Boolean(injected()?.selectedAddress)}
export async function disconnectWallet(){try{await appKit.disconnect?.()}finally{pending=null}}
