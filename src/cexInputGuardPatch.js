(()=>{
  const install=()=>{
    const root=document.getElementById('kit-cex-stable');
    if(!root||root.__kitInputGuard)return;
    const native=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    if(!native?.get||!native?.set)return;
    root.__kitInputGuard=true;
    Object.defineProperty(root,'innerHTML',{
      configurable:true,
      enumerable:false,
      get(){return native.get.call(root)},
      set(html){
        const active=document.activeElement;
        if(active&&root.contains(active)&&active.matches('input,select,textarea')){
          root.__kitPendingRender=html;
          return;
        }
        native.set.call(root,html);
      }
    });
    root.addEventListener('blur',e=>{
      if(!e.target.matches('input,select,textarea'))return;
      if(root.__kitPendingRender&&document.activeElement!==e.target){
        const html=root.__kitPendingRender;
        root.__kitPendingRender=null;
        native.set.call(root,html);
      }
    },true);
  };
  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
