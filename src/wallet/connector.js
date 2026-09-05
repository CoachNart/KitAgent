import {CHAINS} from '../chains/registry.js';
import {EthereumProvider} from '@walletconnect/ethereum-provider';

let wcProvider=null;
let wcInitPromise=null;
let wcBound=false;
const watchers=new Set();

// WalletConnect project IDs are public client identifiers, so keep the supplied
// ID as a fallback while still allowing Vercel/local environments to override it.
const projectId=import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '48604c2cbc72b01702c382d69018e325';

export function hasWallet(){return typeof window!=='undefined'&&(!!window.ethereum||!!wcProvider)}

function bindWalletConnectEvents(provider){
  if(wcBound)return;
  wcBound=true;
  provider.on('accountsChanged',accountsChanged=>watchers.forEach(w=>w.onAccount?.(accountsChanged?.[0]||'')));
  provider.on('chainChanged',chainId=>watchers.forEach(w=>w.onChain?.(Number(BigInt(chainId)))));
  provider.on('disconnect',()=>watchers.forEach(w=>w.onAccount?.('')));
}

async function getWalletConnectProvider(chain){
  if(wcProvider){bindWalletConnectEvents(wcProvider);return wcProvider;}
  if(!projectId)throw new Error('WalletConnect is not configured.');
  if(!chain?.id||!chain?.rpc)throw new Error('Invalid EVM chain configuration');
  if(!wcInitPromise){
    const all=Object.values(CHAINS).filter(c=>c?.id&&c?.rpc);
    wcInitPromise=EthereumProvider.init({
      projectId,
      chains:[chain.id],
      optionalChains:all.map(c=>c.id).filter(id=>id!==chain.id),
      rpcMap:Object.fromEntries(all.map(c=>[c.id,c.rpc])),
      showQrModal:true,
      qrModalOptions:{themeMode:'dark'},
      metadata:{
        name:'KitAgent',
        description:'KitAgent onchain command center',
        url:typeof window!=='undefined'?window.location.origin:'https://kitagent.app',
        icons:typeof window!=='undefined'?[`${window.location.origin}/favicon.svg`]:[]
      }
    });
  }
  wcProvider=await wcInitPromise;
  bindWalletConnectEvents(wcProvider);
  return wcProvider;
}

export async function accounts(){
  if(wcProvider){
    try{return await wcProvider.request({method:'eth_accounts'})}catch{}
  }
  return typeof window!=='undefined'&&window.ethereum?window.ethereum.request({method:'eth_accounts'}):[];
}

export async function connect(chain=CHAINS.robinhood){
  if(typeof window!=='undefined'&&window.ethereum)return window.ethereum.request({method:'eth_requestAccounts'});
  return connectWalletConnect(chain);
}

export async function connectWalletConnect(chain=CHAINS.robinhood){
  const provider=await getWalletConnectProvider(chain);
  await provider.connect();
  return provider.request({method:'eth_accounts'});
}

export async function ensureChain(chain){
  const provider=wcProvider || (typeof window!=='undefined'?window.ethereum:null);
  if(!provider)throw new Error('No EVM wallet detected');
  if(!chain?.hex||!chain?.rpc)throw new Error('Invalid EVM chain configuration');
  try{
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chain.hex}]});
  }catch(e){
    if(e.code!==4902)throw e;
    await provider.request({method:'wallet_addEthereumChain',params:[{chainId:chain.hex,chainName:chain.name,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[chain.rpc],blockExplorerUrls:chain.explorer?[chain.explorer]:[]} ]});
  }
}

export function watchWallet(onAccount,onChain){
  const watcher={onAccount,onChain};
  watchers.add(watcher);
  const injected=typeof window!=='undefined'?window.ethereum:null;
  const a=x=>onAccount?.(x?.[0]||'');
  const c=x=>onChain?.(Number(BigInt(x)));
  if(injected){injected.on('accountsChanged',a);injected.on('chainChanged',c)}
  if(wcProvider)bindWalletConnectEvents(wcProvider);
  return()=>{
    watchers.delete(watcher);
    if(injected){injected.removeListener('accountsChanged',a);injected.removeListener('chainChanged',c)}
  };
}

export async function send(tx){
  const provider=wcProvider || (typeof window!=='undefined'?window.ethereum:null);
  if(!provider)throw new Error('No wallet detected');
  return provider.request({method:'eth_sendTransaction',params:[tx]});
}

export const providerInfo=()=>{
  if(wcProvider)return{name:'WalletConnect',chainId:wcProvider.chainId};
  if(typeof window!=='undefined'&&window.ethereum)return{name:window.ethereum.isMetaMask?'MetaMask':'EVM wallet',chainId:window.ethereum.chainId};
  return null;
};
export const availableChains=()=>Object.values(CHAINS);
