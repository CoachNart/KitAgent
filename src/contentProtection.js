const PROTECTED_SELECTORS=['.live-market','.signal-history','.chart-terminal'];
const isProtected=()=>PROTECTED_SELECTORS.some(selector=>document.querySelector(selector));
const stop=(event)=>{event.preventDefault();event.stopPropagation();return false};
const refresh=()=>{document.documentElement.classList.toggle('kit-content-protected',isProtected())};

document.addEventListener('copy',stop,true);
document.addEventListener('cut',stop,true);
document.addEventListener('contextmenu',stop,true);
document.addEventListener('dragstart',stop,true);
document.addEventListener('selectstart',event=>{if(isProtected())stop(event)},true);
document.addEventListener('keydown',event=>{
  if(!isProtected())return;
  const key=String(event.key||'').toLowerCase();
  if((event.ctrlKey||event.metaKey)&&(key==='c'||key==='x'||key==='a'||key==='p'||key==='s'))stop(event);
  if(key==='printscreen')stop(event);
},true);
window.addEventListener('beforeprint',()=>{if(isProtected())document.documentElement.classList.add('kit-print-blocked')});
window.addEventListener('afterprint',()=>document.documentElement.classList.remove('kit-print-blocked'));
const observer=new MutationObserver(refresh);
observer.observe(document.body,{subtree:true,childList:true});
refresh();
