import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arbitrum } from '@reown/appkit/networks';
import { getAccount, watchAccount } from '@wagmi/core';
import { QueryClient } from '@tanstack/react-query';
const projectId=import.meta.env.VITE_REOWN_PROJECT_ID||import.meta.env.VITE_WALLETCONNECT_PROJECT_ID||'94314a4ef9da3dd09a3b858adef781e9';
export const queryClient=new QueryClient();
export const wagmiAdapter=new WagmiAdapter({projectId,networks:[arbitrum],ssr:false});
export const appKit=createAppKit({adapters:[wagmiAdapter],networks:[arbitrum],defaultNetwork:arbitrum,projectId,metadata:{name:'KitSetups',description:'KitSetups wallet connection',url:typeof window!=='undefined'?window.location.origin:'https://kitsetups.vercel.app'},features:{analytics:false,email:false,socials:[]},themeMode:'dark'});
let pending=null;const state=()=>getAccount(wagmiAdapter.wagmiConfig);
export async function connectWallet(){const current=state();if(current.isConnected&&current.address)return{address:current.address,provider:appKit.getWalletProvider?.()||null};if(!pending){pending=new Promise((resolve,reject)=>{let timer;let stop;const finish=(v,e)=>{clearTimeout(timer);if(stop)stop();pending=null;e?reject(e):resolve(v)};stop=watchAccount(wagmiAdapter.wagmiConfig,{onChange:a=>{if(a.isConnected&&a.address)finish({address:a.address,provider:appKit.getWalletProvider?.()||null})}});timer=setTimeout(()=>finish(null,new Error('Wallet connection timed out. Please retry from your wallet.')),60000);appKit.open({view:'Connect',namespace:'eip155'}).catch(e=>finish(null,e))})}return pending}
export async function resumePendingWalletConnection(){const a=state();return a.isConnected&&a.address?{address:a.address,provider:appKit.getWalletProvider?.()||null}:null}
export function getActiveProvider(){return appKit.getWalletProvider?.()||null}
export function getConnectedAddress(){return state().address||''}
export function isWalletConnected(){const a=state();return Boolean(a.isConnected&&a.address)}
export async function disconnectWallet(){if(typeof appKit.disconnect==='function')await appKit.disconnect()}
