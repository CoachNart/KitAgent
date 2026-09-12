/* Browser-safe PnL image actions. Scoped to KitSetups Futures position rows. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined' || window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value, digits=4) => n(value).toLocaleString(undefined,{maximumFractionDigits:digits});
  const clean = value => String(value || '').replace(/,/g,'').trim();

  function parsePosition(row){
    const cells = Array.from(row?.cells || []).map(cell => String(cell.textContent || '').trim());
    if(cells.length < 8) throw new Error('Could not read the futures position row');
    const symbol = (cells[0] || 'BTCUSDT').replace('_USDT','/USDT').replace(/USDT$/,'/USDT');
    const side = /short/i.test(cells[1]) ? 'short' : 'long';
    const entry = n(clean(cells[3]));
    const mark = n(clean(cells[4]));
    const leverage = (cells[7] || '').replace(/x.*$/i,'').trim() || '—';
    if(!entry || !mark) throw new Error('Could not read Entry and Mark from the position row');
    const percentage = ((mark-entry)/entry*100) * (side === 'short' ? -1 : 1);
    return {symbol,side,entry,mark,leverage,percentage};
  }

  function makePngFile(p){
    return new Promise((resolve,reject)=>{
      try{
        const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1920;
        const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas unavailable');
        const positive=p.percentage>=0, accent=positive?'#25d6d0':'#ff5266';
        const bg=ctx.createLinearGradient(0,0,1080,1920);
        bg.addColorStop(0,'#060a10'); bg.addColorStop(.55,'#0b151e'); bg.addColorStop(1,'#071015');
        ctx.fillStyle=bg; ctx.fillRect(0,0,1080,1920);
        ctx.strokeStyle='#263141'; ctx.lineWidth=2; ctx.strokeRect(48,48,984,1824);
        const text=(value,x,y,size,fill='#eef3f9',weight='400')=>{ctx.fillStyle=fill;ctx.font=`${weight} ${size}px Arial,sans-serif`;ctx.fillText(String(value),x,y)};
        text('KITSETUPS',88,126,30,accent,'800');
        text(`FUTURES POSITION · ${p.side.toUpperCase()}`,88,166,18,'#66768a','700');
        text('KitSetups Trader',88,310,38,'#eef3f9','800');
        text(p.symbol,88,355,24,'#738398');
        text('PNL PERFORMANCE',88,480,20,'#66768a','700');
        text(`${p.percentage>=0?'+':''}${fmt(p.percentage,4)}%`,88,600,96,accent,'900');
        ctx.fillStyle='#202c38'; ctx.fillRect(88,710,904,2);
        text('ENTRY',88,790,18,'#66768a','700'); text(fmt(p.entry,8),88,832,30,'#eef3f9','700');
        text('MARK',540,790,18,'#66768a','700'); text(fmt(p.mark,8),540,832,30,'#eef3f9','700');
        text('LEVERAGE',88,920,18,'#66768a','700'); text(`${p.leverage}x`,88,962,30,'#eef3f9','700');
        text(`KitSetups Futures · ${p.symbol} · ${p.side}`,88,1780,18,'#66768a');
        text('kitsetups.xyz',88,1820,18,accent,'800');
        canvas.toBlob(blob=>blob?resolve(new File([blob],'kitsetups-futures-pnl.png',{type:'image/png'})):reject(new Error('PNG conversion failed')),'image/png');
      }catch(error){reject(error)}
    });
  }

  function downloadFile(file){
    const url=URL.createObjectURL(file), a=document.createElement('a');
    a.href=url; a.download=file.name; a.rel='noopener'; a.style.position='fixed'; a.style.left='-9999px';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1500);
  }

  async function runAction(row,share){
    const p=parsePosition(row), file=await makePngFile(p);
    if(share && typeof navigator.share==='function'){
      try{
        if(typeof navigator.canShare==='function' && !navigator.canShare({files:[file]})) throw new Error('File sharing is not supported');
        await navigator.share({title:'KitSetups Futures',text:`${p.symbol} · ${p.side} · ${p.percentage>=0?'+':''}${fmt(p.percentage,4)}%`,files:[file]});
        return;
      }catch(error){if(error?.name==='AbortError') return;}
    }
    downloadFile(file);
  }

  function isAction(target){
    const el=target?.closest?.('button,a,[role="button"]'); if(!el) return '';
    const label=[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-action'),el.textContent].filter(Boolean).join(' ');
    if(/\bshare\b/i.test(label)) return 'share';
    if(/\bdownload\b/i.test(label)) return 'download';
    return '';
  }

  async function handleClick(event){
    const action=isAction(event.target); if(!action) return;
    const row=event.target?.closest?.('tr'); if(!row || row.closest('table')?.querySelector('thead')?.textContent?.indexOf('Contract') < 0) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    try{await runAction(row,action==='share')}catch(error){console.error('KitSetups PnL image action failed:',error)}
  }

  document.addEventListener('click',handleClick,true);
})();
