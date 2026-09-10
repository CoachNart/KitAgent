(()=>{
const KEY='kitsetups_cex_session_v1';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}};
const save=(exchange,key,secret,passphrase)=>{try{localStorage.setItem(KEY,JSON.stringify({exchange,key,secret,passphrase}))}catch{}};
let auto=false;
function hook(){
 const modal=document.querySelector('.kc-modal');
 if(modal){
  const go=modal.querySelector('#go'),ak=modal.querySelector('#ak'),as=modal.querySelector('#as'),ap=modal.querySelector('#ap');
  if(go&&!go.dataset.persistHook){go.dataset.persistHook='1';go.addEventListener('click',()=>save(document.querySelector('#kx')?.value||'mexc',ak?.value?.trim()||'',as?.value?.trim()||'',ap?.value?.trim()||''),true)}
  const saved=read();
  if(saved&&go&&!go.dataset.autoFill&&saved.key&&saved.secret&&(!ap||saved.passphrase)){go.dataset.autoFill='1';ak.value=saved.key;as.value=saved.secret;if(ap)ap.value=saved.passphrase;setTimeout(()=>go.click(),80)}
  return;
 }
 const btn=document.querySelector('#kit-cex #kc');
 const saved=read();
 if(saved?.key&&saved?.secret&&btn&&!auto&&saved.exchange===(document.querySelector('#kx')?.value||'mexc')){auto=true;btn.click();setTimeout(()=>{auto=false},5000)}
}
new MutationObserver(hook).observe(document.documentElement,{childList:true,subtree:true});
setInterval(hook,1000);hook();
})();
