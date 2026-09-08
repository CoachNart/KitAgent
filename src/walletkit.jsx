import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { getAccount, watchAccount } from '@wagmi/core';
import { QueryClient } from '@tanstack/react-query';

const projectId=import.meta.env.VITE_REOWN_PROJECT_ID||import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const robinhoodChain=defineChain({
  id:4663,
  caipNetworkId:'eip155:4663',
  chainNamespace:'eip155',
  name:'Robinhood Chain',
  nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},
  rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']},public:{http:['https://rpc.mainnet.chain.robinhood.com']}},
  blockExplorers:{default:{name:'Robinhood Chain Explorer',url:'https://robinhoodchain.blockscout.com'}},
});

if(!projectId)console.warn('KitSetups wallet: VITE_REOWN_PROJECT_ID is not configured.');

export const queryClient=new QueryClient();
export const networks=[robinhoodChain];
export const wagmiAdapter=new WagmiAdapter({projectId:projectId||'94314a4ef9da3dd09a3b858adef781e9',networks,ssr:false});
export const appKit=createAppKit({adapters:[wagmiAdapter],networks,defaultNetwork:robinhoodChain,projectId:projectId||'94314a4ef9da3dd09a3b858adef781e9',metadata:{name:'KitSetups',description:'KitSetups wallet connection on Robinhood Chain',url:typeof window!=='undefined'?window.location.origin:'https://kitsetups.xyz',icons:[typeof window!=='undefined'?`${window.location.origin}/kitsetups-logo.svg`:'https://www.kitsetups.xyz/kitsetups-logo.svg']},features:{analytics:false,email:false,socials:[]},themeMode:'dark'});

let pending=null;
const state=()=>getAccount(wagmiAdapter.wagmiConfig);

export async function connectWallet(){
  const current=state();
  if(current.isConnected&&current.address)return{address:current.address,provider:appKit.getWalletProvider?.()||null};
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    let timer;
    let stop;
    const finish=(value,error)=>{clearTimeout(timer);stop?.();pending=null;error?reject(error):resolve(value)};
    stop=watchAccount(wagmiAdapter.wagmiConfig,{onChange:a=>{if(a.isConnected&&a.address)finish({address:a.address,provider:appKit.getWalletProvider?.()||null})}});
    timer=setTimeout(()=>finish(null,new Error('Wallet connection timed out. Please close the wallet prompt and try again.')),45000);
    appKit.open({view:'Connect',namespace:'eip155'}).catch(error=>finish(null,new Error(error?.message||'Wallet connection could not be opened.')));
  });
  return pending;
}

export async function resumePendingWalletConnection(){const a=state();return a.isConnected&&a.address?{address:a.address,provider:appKit.getWalletProvider?.()||null}:null}
export function getActiveProvider(){return appKit.getWalletProvider?.()||null}
export function getConnectedAddress(){return state().address||''}
export function isWalletConnected(){const a=state();return Boolean(a.isConnected&&a.address)}
export async function disconnectWallet(){if(typeof appKit.disconnect==='function')await appKit.disconnect()}
