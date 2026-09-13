(function(){
  if(typeof window==='undefined'||window.__kitRoutesInstalled)return;
  window.__kitRoutesInstalled=true;
  const routes={'/app/market':'Market analysis','/app/chart-terminal':'Chart terminal','/app/perpetuals':'Perpetuals','/app/history':'History','/app/profile':'Profile'};
  const path=()=>window.location.pathname.replace(/\/+$/,'')||'/';
  const find=label=>[...document.querySelectorAll('.kit-sidebar nav .side-link')].find(b=>b.textContent.trim().toLowerCase()===label.toLowerCase());
  const sync=()=>{
    const label=routes[path()];
    if(!label)return;
    const button=find(label);
    if(button&&!button.classList.contains('selected'))button.click();
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('.kit-sidebar nav .side-link');
    if(!button)return;
    const target=Object.keys(routes).find(key=>routes[key]===button.textContent.trim());
    if(target&&path()!==target)history.pushState({kitRoute:true},'',target);
  },true);
  addEventListener('popstate',sync);
  const bootObserver=new MutationObserver(()=>{
    if(find(routes[path()])){
      sync();
      bootObserver.disconnect();
    }
  });
  bootObserver.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(sync,2500);
})();
