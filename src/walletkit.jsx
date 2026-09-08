import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getAccount, watchAccount } from '@wagmi/core';
import { QueryClient } from '@tanstack/react-query';

const projectId=import.meta.env.VITE_REOWN_PROJECT_ID||import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const hyperliquidChain={id:42161,caipNetworkId:'eip155:42161',chainNamespace:'eip155',name:'Arbitrum One',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://arb1.arbitrum.io/rpc']},public:{http:['https://arb1.arbitrum.io/rpc']}},blockExplorers:{default:{name:'Arbiscan',url:'https://arbiscan.io'}}};

if(!projectId)console.warn('KitSetups wallet: VITE_REOWN_PROJECT_ID is not configured.');
export const queryClient=new QueryClient();
export const networks=[hyperliquidChain];
export const wagmiAdapter=new WagmiAdapter({projectId:projectId||'94314a4ef9da3dd09a3b858adef781e9',networks,ssr:false});
export const appKit=createAppKit({adapters:[wagmiAdapter],networks,defaultNetwork:hyperliquidChain,projectId:projectId||'94314a4ef9da3dd09a3b858adef781e9',metadata:{name:'KitSetups',description:'The Crypto Command Center',url:typeof window!=='undefined'?window.location.origin:'https://kitsetups.xyz',icons:[typeof window!=='undefined'?`${window.location.origin}/kitsetups-logo.svg`:'https://www.kitsetups.xyz/kitsetups-logo.svg']},features:{analytics:false,email:false,socials:[]},themeMode:'dark',enableReconnect:true,enableNetworkSwitch:true,enableMobileFullScreen:true,experimental_preferUniversalLinks:true});
let pending=null;
const state=()=>getAccount(wagmiAdapter.wagmiConfig);
const injected=()=>typeof window!=='undefined'&&window.ethereum?.request?window.ethereum:null;

async function connectInjected(){const ethereum=injected();if(!ethereum)return null;const accounts=await ethereum.request({method:'eth_requestAccounts'});const address=accounts?.[0];if(!address)throw new Error('No wallet account was returned.');return{address,provider:ethereum};}
function waitForConnection(timeoutMs=18000){const current=state();if(current.isConnected&&current.address)return Promise.resolve({address:current.address,provider:appKit.getWalletProvider?.()||injected()});if(pending)return pending;pending=new Promise((resolve,reject)=>{let timer;let stop;const finish=(value,error)=>{if(timer)clearTimeout(timer);stop?.();pending=null;error?reject(error):resolve(value)};try{stop=watchAccount(wagmiAdapter.wagmiConfig,{onChange:a=>{if(a.isConnected&&a.address)finish({address:a.address,provider:appKit.getWalletProvider?.()||injected()})}})}catch(error){finish(null,error);return}timer=setTimeout(()=>finish(null,new Error('Wallet connection timed out. Open KitSetups inside your wallet app or choose a wallet from the connection window.')),timeoutMs)});return pending}

export async function connectWallet(){
 if(pending)return pending;
 try{
  const direct=await connectInjected();
  if(direct)return direct;
  const current=state();
  if(current.isConnected&&current.address)return{address:current.address,provider:appKit.getWalletProvider?.()||injected()};
  await appKit.open({view:'Connect',namespace:'eip155'});
  const result=await waitForConnection();
  return{address:result.address,provider:appKit.getWalletProvider?.()||result.provider||injected()};
 }catch(error){
  pending=null;
  try{await appKit.close?.()}catch{}
  const code=error?.code;
  if(code===4001||code==='ACTION_REJECTED')throw new Error('Wallet connection was cancelled.');
  throw error instanceof Error?error:new Error('Wallet connection could not be completed.');
 }
}
export async function resumePendingWalletConnection(){const ethereum=injected();if(ethereum?.selectedAddress)return{address:ethereum.selectedAddress,provider:ethereum};const a=state();return a.isConnected&&a.address?{address:a.address,provider:appKit.getWalletProvider?.()||null}:null}
export function getActiveProvider(){return appKit.getWalletProvider?.()||injected()||null}
export function getConnectedAddress(){return state().address||injected()?.selectedAddress||''}
export function isWalletConnected(){const a=state();return Boolean(a.isConnected&&a.address)||Boolean(injected()?.selectedAddress)}
export async function disconnectWallet(){try{await appKit.disconnect?.()}finally{pending=null}}
