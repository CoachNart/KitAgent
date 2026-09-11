(()=>{
  const patch=()=>{
    const root=document.getElementById('kit-cex');
    if(!root)return;

    const ks=root.querySelector('#ks');
    if(ks && !ks.dataset.stableInteraction){
      ks.dataset.stableInteraction='1';
      // The native terminal moved focus into the dropdown search on focus,
      // making the visible pair field impossible to type into.
      ks.onfocus=()=>{
        const menu=root.querySelector('#pairmenu');
        if(menu)menu.classList.add('open');
        const search=root.querySelector('#pairsearch');
        if(search)search.value=ks.value||'';
      };
    }

    const pairSearch=root.querySelector('#pairsearch');
    if(pairSearch && !pairSearch.dataset.stableInteraction){
      pairSearch.dataset.stableInteraction='1';
      pairSearch.autocomplete='off';
      pairSearch.addEventListener('keydown',e=>{
        if(e.key==='Escape'){
          root.querySelector('#pairmenu')?.classList.remove('open');
          ks?.focus();
        }
      });
    }

    const margin=root.querySelector('.ki-margin-input');
    const size=root.querySelector('#size');
    if(margin && !margin.dataset.stableInteraction){
      margin.dataset.stableInteraction='1';
      margin.type='number';
      margin.step='any';
      margin.inputMode='decimal';
      margin.readOnly=false;
      margin.disabled=false;
      // The enhancement calculates contract size from margin, but the native
      // order state only receives changes through the size input's input event.
      margin.addEventListener('input',()=>{
        requestAnimationFrame(()=>size?.dispatchEvent(new Event('input',{bubbles:true})));
      });
    }

    if(size){
      size.readOnly=true;
      size.tabIndex=-1;
    }

    // Keep live figures from shifting horizontally as their digit count changes.
    root.querySelectorAll('.kc-metric b,.ki-stat b,.kc-bookrow span').forEach(el=>{
      el.style.fontVariantNumeric='tabular-nums';
      el.style.fontFeatureSettings='"tnum"';
    });
  };

  let timer=0;
  const run=()=>{clearTimeout(timer);timer=setTimeout(patch,0)};
  new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('focusin',run,true);
  patch();
})();
