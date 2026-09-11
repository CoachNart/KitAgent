// Load the CEX enhancement layer without allowing its legacy 4s polling loop to run.
// The enhancement module already calls hook() once on startup; repeated polling was
// forcing the terminal to re-render and causing the visible layout shake.
const nativeSetInterval=window.setInterval.bind(window);
const nativeClearInterval=window.clearInterval.bind(window);
let blocked=false;
window.setInterval=(fn,ms,...args)=>{
  if(!blocked && ms===4000){
    blocked=true;
    return 0;
  }
  return nativeSetInterval(fn,ms,...args);
};
window.clearInterval=(id)=>nativeClearInterval(id);
import('./cexEnhancements.js').finally(()=>{
  window.setInterval=nativeSetInterval;
  window.clearInterval=nativeClearInterval;
});
