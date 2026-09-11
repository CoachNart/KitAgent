(()=>{
  const installed=new WeakSet();
  const native=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!native?.get||!native?.set)return;

  const install=(root)=>{
    if(!root||installed.has(root))return;
    installed.add(root);
    Object.defineProperty(root,'innerHTML',{
      configurable:true,
      enumerable:false,
      get(){return native.get.call(root)},
      set(html){
        const active=document.activeElement;
        const activeInside=active&&root.contains(active);
        if(activeInside&&active.matches('input,select,textarea'))return;
        const snapshot=[];
        root.querySelectorAll('input,select,textarea').forEach((el,index)=>{
          snapshot.push({
            index,
            value:el.value,
            checked:typeof el.checked==='boolean'?el.checked:undefined,
            selectionStart:typeof el.selectionStart==='number'?el.selectionStart:null,
            selectionEnd:typeof el.selectionEnd==='number'?el.selectionEnd:null
          });
        });
        const activeIndex=activeInside?[...root.querySelectorAll('input,select,textarea')].indexOf(active):-1;
        native.set.call(root,html);
        const fields=root.querySelectorAll('input,select,textarea');
        snapshot.forEach(s=>{
          const el=fields[s.index];
          if(!el)return;
          if(el.value!==s.value)el.value=s.value;
          if(s.checked!==undefined)el.checked=s.checked;
        });
        if(activeIndex>=0&&fields[activeIndex]){
          const el=fields[activeIndex];
          el.focus({preventScroll:true});
          if(s.selectionStart!==null&&s.selectionEnd!==null&&typeof el.setSelectionRange==='function')el.setSelectionRange(s.selectionStart,s.selectionEnd);
        }
      }
    });
  };

  const scan=()=>install(document.getElementById('kit-cex-stable'));
  const observer=new MutationObserver(scan);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  scan();
})();

// CEX fix: never replace the live terminal DOM while the user is editing a field.
