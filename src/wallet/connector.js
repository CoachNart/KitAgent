import {CHAINS} from '../chains/registry.js';
export function hasWallet(){return typeof window!=='undefined'&&!!window.ethereum}
export async function accounts(){return hasWallet()?window.ethereum.request({method:'eth_accounts'}):[]}
export async function connect(){if(!hasWallet())throw new Error('Install an EVM wallet to continue');return window.ethereum.request({method:'eth_requestAccounts'})}
export async function ensureChain(chain){if(!hasWallet())throw new Error('No EVM wallet detected');if(!chain?.hex||!chain?.rpc)throw new Error('Invalid EVM chain configuration');try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:chain.hex}]})}catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:chain.hex,chainName:chain.name,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[chain.rpc],blockExplorerUrls:chain.explorer?[chain.explorer]:[]} ]})}}
export function watchWallet(onAccount,onChain){if(!hasWallet())return()=>{};const a=x=>onAccount?.(x?.[0]||'');const c=x=>onChain?.(Number(BigInt(x)));window.ethereum.on('accountsChanged',a);window.ethereum.on('chainChanged',c);return()=>{window.ethereum.removeListener('accountsChanged',a);window.ethereum.removeListener('chainChanged',c)}}
export async function send(tx){if(!hasWallet())throw new Error('No wallet detected');return window.ethereum.request({method:'eth_sendTransaction',params:[tx]})}
export const providerInfo=()=>hasWallet()?{name:window.ethereum.isMetaMask?'MetaMask':'EVM wallet',chainId:window.ethereum.chainId}:null;
export const availableChains=()=>Object.values(CHAINS);
