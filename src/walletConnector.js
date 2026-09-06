const CHAIN={chainId:'0x1237',chainName:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://rpc.mainnet.chain.robinhood.com'],blockExplorerUrls:['https://robinhoodchain.blockscout.com']};

const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const providers=new Map();

function discover(){
  if(window.ethereum?.request) providers.set('injected',{provider:window.ethereum,name:'Browser wallet',icon:''});
  if(window.ethereum?.providers?.length) window.ethereum.providers.forEach((p)=>providers.set(idOf(p),{provider:p,name:nameOf(p),icon:p?.info?.icon||''}));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
function idOf(p){return p?.info?.rdns||p?.rdns||p?.name||String(p);}
function nameOf(p){if(p?.isMetaMask)return 'MetaMask';if(p?.isCoinbaseWallet)return 'Coinbase Wallet';if(p?.isTrust)return 'Trust Wallet';if(p?.isRabby)return 'Rabby';if(p?.isOKXWallet)return 'OKX Wallet';return p?.info?.name||'EVM Wallet';}
function listen6963(){window.addEventListener('eip6963:announceProvider',(e)=>{const d=e.detail;if(d?.provider)providers.set(d.info?.rdns||d.info?.name||idOf(d.provider),{provider:d.provider,name:d.info?.name||nameOf(d.provider),icon:d.info?.icon||''});},{passive:true});}

async function switchToRobinhood(provider){
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN.chainId}]});}
  catch(e){if(e?.code===4902||e?.code===-32603){await provider.request({method:'wallet_addEthereumChain',params:[CHAIN]});}else throw e;}
}
async function connect(provider){
  if(!provider?.request)throw new Error('This wallet does not expose an EVM provider.');
  const accounts=await provider.request({method:'eth_requestAccounts'});
  const address=accounts?.[0];
  if(!address)throw new Error('No wallet account was returned.');
  await switchToRobinhood(provider);
  return {address,provider};
}
function mobileUrl(kind){
  const url=window.location.href;
  if(kind==='MetaMask')return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  if(kind==='Coinbase Wallet')return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`;
  if(kind==='Trust Wallet')return `https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`;
  return null;
}
function openChooser(){
  const old=document.getElementById('kitagent-wallet-chooser');if(old)old.remove();
  const choices=[['MetaMask','Connect with MetaMask'],['Coinbase Wallet','Open Coinbase Wallet'],['Trust Wallet','Open Trust Wallet']];
  const box=document.createElement('div');box.id='kitagent-wallet-chooser';box.innerHTML=`<div class="kw-backdrop"><div class="kw-modal"><div class="kw-head"><div><span>WALLET CONNECTION</span><h3>Choose your wallet</h3><p>KitAgent connects through your wallet. Your keys never leave it.</p></div><button data-close>×</button></div><div class="kw-list">${choices.map(([n,d])=>`<button data-wallet="${n}"><span class="kw-icon">${n[0]}</span><span><b>${n}</b><small>${d}</small></span><strong>›</strong></button>`).join('')}</div><div class="kw-note">Robinhood Chain · Chain ID 4663</div></div></div>`;
  document.body.appendChild(box);box.querySelector('[data-close]').onclick=()=>box.remove();box.querySelector('.kw-backdrop').onclick=(e)=>{if(e.target===e.currentTarget)box.remove()};
  box.querySelectorAll('[data-wallet]').forEach(btn=>btn.onclick=()=>{const url=mobileUrl(btn.dataset.wallet);if(url){localStorage.setItem('kitagent_wallet_pending','1');window.location.href=url;}else box.remove();});
}

export async function connectWallet(){
  listen6963();discover();await new Promise(r=>setTimeout(r,80));discover();
  const direct=[...providers.values()].find(x=>x.provider?.request && !isMobile) || [...providers.values()].find(x=>x.provider?.request);
  if(direct)return connect(direct.provider);
  if(isMobile){openChooser();return null;}
  throw new Error('No EVM wallet detected. Install an EVM wallet extension or open KitAgent inside your wallet app.');
}

export function getActiveProvider(){discover();return [...providers.values()].find(x=>x.provider?.request)?.provider||window.ethereum;}

const style=document.createElement('style');style.textContent=`#kitagent-wallet-chooser .kw-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(2,5,7,.78);backdrop-filter:blur(14px)}#kitagent-wallet-chooser .kw-modal{width:min(430px,100%);border:1px solid #27404a;border-radius:18px;background:linear-gradient(155deg,#0d171c,#070c10);box-shadow:0 35px 100px rgba(0,0,0,.7);padding:20px}.kw-head{display:flex;gap:14px;justify-content:space-between}.kw-head span{font-size:7px;letter-spacing:.18em;color:#5d737c}.kw-head h3{margin:6px 0 5px;font-size:20px;color:#edf7f8}.kw-head p{margin:0;font-size:8px;line-height:1.5;color:#65777e}.kw-head button{width:32px;height:32px;border:1px solid #263a42;border-radius:9px;background:#0a1216;color:#81939a;font-size:20px;cursor:pointer}.kw-list{display:grid;gap:8px;margin-top:18px}.kw-list button{display:flex;align-items:center;gap:11px;width:100%;padding:12px;border:1px solid #1d3038;border-radius:11px;background:#091217;color:#dce8e9;text-align:left;cursor:pointer}.kw-list button:hover{border-color:#2c697a;background:#0d1a20}.kw-icon{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:rgba(0,199,254,.09);border:1px solid rgba(0,199,254,.16);color:#72ddff;font-weight:800}.kw-list b,.kw-list small{display:block}.kw-list b{font-size:10px}.kw-list small{margin-top:3px;font-size:7px;color:#64767d}.kw-list strong{margin-left:auto;color:#4d646c;font-size:18px}.kw-note{margin-top:13px;padding-top:12px;border-top:1px solid #17272e;font-size:7px;color:#53666d}@media(max-width:500px){#kitagent-wallet-chooser .kw-modal{border-radius:15px;padding:17px}.kw-head h3{font-size:18px}}`;document.head.appendChild(style);
