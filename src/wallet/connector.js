import {CHAINS} from '../chains/registry.js';
import {EthereumProvider} from '@walletconnect/ethereum-provider';

let wcProvider=null;
let wcInitPromise=null;
let wcBound=false;
const watchers=new Set();
const projectId=import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '48604c2cbc72b01702c382d69018e325';
const MOBILE_RE=/Android|iPhone|iPad|iPod/i;

export function hasWallet(){return typeof window!=='undefined'&&(!!window.ethereum||!!wcProvider)}

function bindWalletConnectEvents(provider){
  if(wcBound)return;
  wcBound=true;
  provider.on('accountsChanged',accountsChanged=>watchers.forEach(w=>w.onAccount?.(accountsChanged?.[0]||'')));
  provider.on('chainChanged',chainId=>watchers.forEach(w=>w.onChain?.(Number(BigInt(chainId)))));
  provider.on('disconnect',()=>watchers.forEach(w=>w.onAccount?.('')));
}

export async function prepareWalletConnect(chain=CHAINS.robinhood){
  await getWalletConnectProvider(chain);
  return true;
}

async function getWalletConnectProvider(chain){
  if(wcProvider){bindWalletConnectEvents(wcProvider);return wcProvider;}
  if(!projectId)throw new Error('WalletConnect is not configured.');
  if(!chain?.id||!chain?.rpc)throw new Error('Invalid EVM chain configuration');
  if(!wcInitPromise){
    const all=Object.values(CHAINS).filter(c=>c?.kind==='evm'&&c?.id&&c?.rpc);
    // Always establish the WalletConnect session on Ethereum first. Some mobile
    // wallets reject a session whose required chain is a newer/custom chain.
    // The selected chain is switched to immediately after connection.
    wcInitPromise=EthereumProvider.init({
      projectId,
      chains:[1],
      optionalChains:all.map(c=>c.id).filter(id=>id!==1),
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

// Warm the WalletConnect client without opening a modal. The actual connect()
// call is still made synchronously from the user's tap.
if(typeof window!=='undefined'){
  getWalletConnectProvider(CHAINS.ethereum).catch(()=>{});
}

async function timedRequest(provider,method,params=[],ms=1800){
  return Promise.race([
    provider.request({method,params}),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Injected wallet did not respond.')),ms))
  ]);
}

export async function accounts(){
  if(wcProvider){
    try{return await wcProvider.request({method:'eth_accounts'})}catch{}
  }
  if(typeof window!=='undefined'&&window.ethereum){
    try{return await timedRequest(window.ethereum,'eth_accounts',[],1000)}catch{}
  }
  return [];
}

export async function connect(chain=CHAINS.robinhood){
  const injected=typeof window!=='undefined'?window.ethereum:null;

  // In a wallet's own mobile browser, injected is the fastest/most reliable path.
  // In normal mobile Chrome, a stale injected object can exist without being able
  // to open a wallet. Give it a short timeout, then fall back to WalletConnect.
  if(injected){
    try{
      const result=await timedRequest(injected,'eth_requestAccounts',[],MOBILE_RE.test(navigator.userAgent)?1800:3500);
      if(result?.length)return result;
    }catch{}
  }

  return connectWalletConnect(chain);
}

export async function connectWalletConnect(chain=CHAINS.robinhood){
  const provider=wcProvider || await getWalletConnectProvider(chain);
  try{
    const existing=await provider.request({method:'eth_accounts'});
    if(existing?.length)return existing;
  }catch{}

  let connectionError=null;
  try{
    // This must stay directly in the user-initiated connect path so WalletConnect
    // can create/open its mobile wallet handoff while the browser gesture is live.
    await provider.connect();
    const connected=await provider.request({method:'eth_accounts'});
    if(connected?.length)return connected;
  }catch(e){connectionError=e}

  throw new Error(connectionError?.message||'Unable to connect wallet. Please open your wallet app and try again.');
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