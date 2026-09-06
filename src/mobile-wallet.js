const MOBILE_WALLET_PENDING='kitagent_mobile_wallet_pending';

const isMobile=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const hasProvider=()=>Boolean(window.ethereum?.request);

const openMetaMask=()=>{
  const dappUrl=`${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href=`https://metamask.app.link/dapp/${dappUrl}`;
};

const handleWalletClick=(event)=>{
  if(!isMobile()||hasProvider())return;
  const button=event.target.closest?.('.connect-btn');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  localStorage.setItem(MOBILE_WALLET_PENDING,'1');
  openMetaMask();
};

document.addEventListener('click',handleWalletClick,true);

const autoConnect=()=>{
  if(!isMobile()||!hasProvider())return;
  if(localStorage.getItem(MOBILE_WALLET_PENDING)!=='1')return;
  localStorage.removeItem(MOBILE_WALLET_PENDING);
  const tryClick=()=>{
    const button=document.querySelector('.connect-btn');
    if(button){button.click();return true}
    return false;
  };
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    if(tryClick()||attempts>=30)clearInterval(timer);
  },250);
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoConnect,{once:true});
else setTimeout(autoConnect,350);
