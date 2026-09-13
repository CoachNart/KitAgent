const STORAGE_KEY='kitsetups_mexc_session_v1';
const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}};
const write=value=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch{}};
const looksLikeKey=input=>{const text=`${input.name||''} ${input.id||''} ${input.placeholder||''} ${input.getAttribute('aria-label')||''}`.toLowerCase();return /(access|api).*(key)|api.*key/.test(text)&&!/(secret)/.test(text)};
const looksLikeSecret=input=>{const text=`${input.name||''} ${input.id||''} ${input.placeholder||''} ${input.getAttribute('aria-label')||''}`.toLowerCase();return /secret/.test(text)};
const buttons=()=>[...document.querySelectorAll('button')];
const connectButtons=()=>buttons().filter(b=>/connect/i.test(b.textContent||'')&&!/disconnect|connected/i.test(b.textContent||''));
let restoring=false;
const fill=()=>{
  const saved=read();if(!saved.key||!saved.secret)return false;
  const inputs=[...document.querySelectorAll('input')];
  const keyInput=inputs.find(looksLikeKey);const secretInput=inputs.find(looksLikeSecret);
  if(!keyInput||!secretInput)return false;
  restoring=true;
  const set=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,value);else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))};
  set(keyInput,saved.key);set(secretInput,saved.secret);
  setTimeout(()=>{restoring=false;const button=connectButtons().find(b=>b.closest('form')||b.offsetParent!==null);button?.click()},80);
  return true;
};
const capture=event=>{
  if(restoring)return;
  const input=event.target?.closest?.('input');if(!input)return;
  const current=read();
  if(looksLikeKey(input))write({...current,key:input.value});
  if(looksLikeSecret(input))write({...current,secret:input.value});
};
const boot=()=>{document.addEventListener('input',capture,true);document.addEventListener('change',capture,true);let attempts=0;const timer=setInterval(()=>{if(fill()||attempts++>80)clearInterval(timer)},250)};
if(typeof window!=='undefined'){window.addEventListener('load',boot,{once:true});if(document.readyState!=='loading')boot()}
