/* PnL PNG actions. Direct button handlers keep the original React trading UI isolated. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined' || window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;
  const number=value=>{const parsed=Number(String(value??'').replace(/,/g,'').replace(/[^0-9.+-]/g,''));return Number.isFinite(parsed)?parsed:0};
  const fmt=(value,digits=4)=>Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});
  function readModal(dialog){
    const title=String(dialog.querySelector('.pnl-share-card h3')?.textContent||'').trim();
    const [symbolRaw,sideRaw]=title.split('·').map(v=>v.trim());
    const profile=String(dialog.querySelector('.pnl-card-brand b')?.textContent||'KitSetups Trader').trim();
    const side=/short/i.test(sideRaw)?'short':'long';
    const symbol=symbolRaw||'BTC/USDT';
    const meta=[...dialog.querySelectorAll('.pnl-meta p')];
    const valueFor=label=>String(meta.find(p=>String(p.textContent||'').trim().toLowerCase().startsWith(label.toLowerCase()))?.querySelector('b')?.textContent||'').trim();
    const entry=number(valueFor('Entry')),mark=number(valueFor('Mark')),leverage=number(valueFor('Leverage'));
    if(!entry||!mark)throw new Error('Could not read Entry and Mark from the PnL card');
    const percentage=((mark-entry)/entry*100)*(side==='short'?-1:1);
    return {profile,symbol,side,entry,mark,leverage,percentage};
  }
  function drawRocket(ctx,x,y,scale,accent){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.rotate(-0.38);ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(0,-54);ctx.bezierCurveTo(28,-35,31,-5,24,24);ctx.lineTo(0,48);ctx.lineTo(-24,24);ctx.bezierCurveTo(-31,-5,-28,-35,0,-54);ctx.closePath();ctx.fill();ctx.fillStyle='#071015';ctx.beginPath();ctx.arc(0,-15,8,0,Math.PI*2);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-18,25);ctx.lineTo(-34,42);ctx.lineTo(-12,39);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(18,25);ctx.lineTo(34,42);ctx.lineTo(12,39);ctx.closePath();ctx.fill();ctx.fillStyle='#ffb84d';ctx.beginPath();ctx.moveTo(-9,43);ctx.quadraticCurveTo(0,67,9,43);ctx.quadraticCurveTo(0,50,-9,43);ctx.fill();ctx.restore();}
  function makePngFile(p){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
    const positive=p.percentage>=0,accent=positive?'#25d6d0':'#ff5266';const bg=ctx.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#060a10');bg.addColorStop(.58,'#0b151e');bg.addColorStop(1,'#071015');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
    const glow=ctx.createRadialGradient(875,185,0,875,185,460);glow.addColorStop(0,positive?'rgba(37,214,208,.22)':'rgba(255,82,102,.22)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,650);ctx.strokeStyle='#263141';ctx.lineWidth=2;ctx.strokeRect(48,48,984,1254);
    const text=(value,x,y,size,fill='#eef3f9',weight='400')=>{ctx.fillStyle=fill;ctx.font=`${weight} ${size}px Arial,sans-serif`;ctx.fillText(String(value),x,y)};
    text('KITSETUPS',88,118,30,accent,'800');text('FUTURES POSITION',88,158,18,'#66768a','700');drawRocket(ctx,932,116,.62,accent);text(`${p.profile} · KitSetups Futures`,88,292,34,'#eef3f9','800');text(`${p.symbol} · ${p.side}`,88,340,24,'#738398','600');text('PNL',88,480,20,'#66768a','700');text(`${positive?'+':''}${fmt(p.percentage,4)}%`,88,610,104,accent,'900');ctx.fillStyle='#202c38';ctx.fillRect(88,710,904,2);text('ENTRY',88,790,18,'#66768a','700');text(fmt(p.entry,8),88,838,32,'#eef3f9','700');text('MARK',540,790,18,'#66768a','700');text(fmt(p.mark,8),540,838,32,'#eef3f9','700');text('LEVERAGE',88,955,18,'#66768a','700');text(`${fmt(p.leverage,0)}x`,88,1003,32,'#eef3f9','700');text('kitsetups.xyz',88,1230,19,accent,'800');text(`${p.symbol} · ${p.side.toUpperCase()}`,760,1230,18,'#66768a','700');
    let dataUrl;try{dataUrl=canvas.toDataURL('image/png')}catch{throw new Error('PNG export failed.')};const base64=dataUrl.split(',')[1]||'',binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new File([bytes],`kitsetups-${p.symbol.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-pnl.png`,{type:'image/png'});
  }
  function downloadFile(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.rel='noopener';a.style.position='fixed';a.style.left='-9999px';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1200)}
  function bind(dialog){for(const button of dialog.querySelectorAll('.pnl-share-actions button')){if(button.dataset.kitPnlBound)continue;const label=String(button.textContent||'').trim().toLowerCase();if(label!=='share'&&label!=='download')continue;button.dataset.kitPnlBound='1';button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();try{const position=readModal(dialog),file=makePngFile(position);if(label==='share'&&typeof navigator.share==='function'){try{if(typeof navigator.canShare!=='function'||navigator.canShare({files:[file]})){await navigator.share({title:'KitSetups Futures PnL',text:`${position.symbol} · ${position.side} · ${position.percentage>=0?'+':''}${fmt(position.percentage,4)}%`,files:[file]});return}}catch(error){if(error?.name==='AbortError')return}}downloadFile(file)}catch(error){console.error('KitSetups PnL image action failed:',error)}})}}
  const observer=new MutationObserver(()=>document.querySelectorAll('.pnl-share-dialog').forEach(bind));observer.observe(document.documentElement,{childList:true,subtree:true});document.querySelectorAll('.pnl-share-dialog').forEach(bind);
})();
