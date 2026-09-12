/* Safe PnL share/download adapter. It only handles the PnL modal actions. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined' || window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value, digits=4) => n(value).toLocaleString(undefined,{maximumFractionDigits:digits});
  const esc = value => String(value ?? '').replace(/[<>&\"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;',"'":'&apos;'}[ch]));
  const pick = (text, re, fallback='—') => String(text || '').match(re)?.[1] || fallback;

  function parsePosition(text){
    const raw = String(text || '');
    const entry = n(pick(raw,/Entry\s+([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const mark = n(pick(raw,/Mark\s+([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const side = pick(raw,/(?:Futures\s+[A-Z0-9_/-]+\s*·\s*|[A-Z0-9_/-]+\s*·\s*)(Long|Short)/i,'Long').toLowerCase();
    const symbol = pick(raw,/Futures\s+([A-Z0-9_/-]+)\s*·\s*(?:Long|Short)/i,pick(raw,/^\s*([A-Z0-9_/-]+)\s*·\s*(?:long|short)/im,'BTC/USDT'));
    const nameMatch = raw.match(/^\s*([^\n]+?)\s*·\s*KitSetups Futures/i);
    const name = (nameMatch?.[1] || 'KitSetups Trader').trim();
    const leverage = pick(raw,/Leverage\s+([0-9.]+)x/i,'—');
    const percentage = entry && mark ? ((mark-entry)/entry*100) * (side === 'short' ? -1 : 1) : 0;
    return {name,symbol,side,entry,mark,leverage,percentage};
  }

  function makeSvg(position){
    const p = typeof position === 'string' ? parsePosition(position) : position;
    const positive = p.percentage >= 0;
    const accent = positive ? '#25d6d0' : '#ff5266';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a10"/><stop offset=".55" stop-color="#0b151e"/><stop offset="1" stop-color="#071015"/></linearGradient></defs><rect width="1080" height="1920" rx="58" fill="url(#bg)"/><rect x="48" y="48" width="984" height="1824" rx="46" fill="none" stroke="#263141" stroke-width="2"/><text x="88" y="126" fill="${accent}" font-family="Arial,sans-serif" font-size="30" font-weight="800">KITSETUPS</text><text x="88" y="166" fill="#66768a" font-family="Arial,sans-serif" font-size="18">FUTURES POSITION · ${esc(p.side.toUpperCase())}</text><text x="88" y="310" fill="#eef3f9" font-family="Arial,sans-serif" font-size="38" font-weight="800">${esc(p.name)}</text><text x="88" y="355" fill="#738398" font-family="Arial,sans-serif" font-size="24">${esc(p.symbol)}</text><text x="88" y="480" fill="#66768a" font-family="Arial,sans-serif" font-size="20">PNL PERFORMANCE</text><text x="88" y="600" fill="${accent}" font-family="Arial,sans-serif" font-size="96" font-weight="900">${p.percentage >= 0 ? '+' : ''}${fmt(p.percentage,4)}%</text><rect x="88" y="710" width="904" height="2" fill="#202c38"/><text x="88" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">ENTRY</text><text x="88" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(fmt(p.entry,8))}</text><text x="540" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">MARK</text><text x="540" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(fmt(p.mark,8))}</text><text x="88" y="920" fill="#66768a" font-family="Arial,sans-serif" font-size="18">LEVERAGE</text><text x="88" y="962" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(p.leverage)}x</text><text x="88" y="1780" fill="#66768a" font-family="Arial,sans-serif" font-size="18">KitSetups Futures · ${esc(p.symbol)} · ${esc(p.side)}</text><text x="88" y="1820" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">kitsetups.xyz</text></svg>`;
  }

  function svgToPngFile(svg, filename){
    return new Promise((resolve,reject)=>{
      const blob = new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1080; canvas.height = 1920;
          const context = canvas.getContext('2d');
          if(!context) throw new Error('Canvas unavailable');
          context.drawImage(image,0,0,1080,1920);
          canvas.toBlob(pngBlob=>{
            URL.revokeObjectURL(url);
            if(!pngBlob) return reject(new Error('PNG conversion failed'));
            resolve(new File([pngBlob],filename,{type:'image/png'}));
          },'image/png');
        } catch(error){ URL.revokeObjectURL(url); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image rendering failed')); };
      image.src = url;
    });
  }

  function downloadFile(file){
    const url = URL.createObjectURL(file);
    const out = document.createElement('a');
    out.href = url;
    out.download = file.name;
    out.rel = 'noopener';
    out.style.display = 'none';
    document.body.appendChild(out);
    out.click();
    out.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }

  async function shareOrDownload(text, preferShare=true){
    const position = parsePosition(text);
    if(!position.entry || !position.mark){ throw new Error('Could not read Entry and Mark from the PnL card'); }
    const file = await svgToPngFile(makeSvg(position),'kitsetups-futures.png');
    if(preferShare && navigator.share){
      try {
        await navigator.share({title:'KitSetups Futures',files:[file]});
        return;
      } catch(error){
        if(error?.name === 'AbortError') return;
      }
    }
    downloadFile(file);
  }

  // Preserve any non-PnL native sharing.
  const nativeShare = navigator.share?.bind(navigator);
  if(nativeShare){
    try {
      navigator.share = async data => {
        if(data?.title === 'KitSetups Futures PnL' && data?.text){
          await shareOrDownload(data.text,true);
          return;
        }
        return nativeShare(data);
      };
    } catch(_) {}
  }

  document.addEventListener('click', async event => {
    const target = event.target?.closest?.('button, a, [role="button"]');
    if(!target) return;
    const label = String(target.getAttribute('aria-label') || target.textContent || '').trim();
    if(!/^(share|download)$/i.test(label) && !/\b(share|download)\b/i.test(label)) return;

    let card = target.parentElement;
    while(card && card !== document.body){
      const text = String(card.textContent || '');
      if(/Entry\s+[0-9,]+/i.test(text) && /Mark\s+[0-9,]+/i.test(text) && /Leverage\s+[0-9.]+x/i.test(text) && /KitSetups/i.test(text)) break;
      card = card.parentElement;
    }
    if(!card) return;

    const raw = String(card.textContent || '');
    const isDownload = /\bdownload\b/i.test(label);
    event.preventDefault();
    event.stopImmediatePropagation();
    try { await shareOrDownload(raw,!isDownload); }
    catch(error){ console.error('KitSetups PnL image action failed:',error); }
  }, true);
})();
