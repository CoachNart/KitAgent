(()=>{
const install=()=>{
 const root=document.getElementById('kit-cex-stable');
 if(!root||root.__kitOrderInputBridge)return;
 root.__kitOrderInputBridge=true;
 const sync=()=>{
  const margin=root.querySelector('[data-margin]');
  const lev=root.querySelector('[data-lev]');
  if(margin)margin.dispatchEvent(new Event('input',{bubbles:true}));
  if(lev)lev.dispatchEvent(new Event('input',{bubbles:true}));
 };
 root.addEventListener('pointerdown',e=>{if(e.target.closest('[data-submit],.ks-submit'))sync()},true);
 root.addEventListener('click',e=>{if(e.target.closest('[data-submit],.ks-submit'))sync()},true);
 root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-margin],[data-lev]'))sync()},true);
};
const observer=new MutationObserver(install);
observer.observe(document.documentElement,{childList:true,subtree:true});
install();
})();