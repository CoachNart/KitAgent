/* Safe PnL share/download adapter. It never patches trading or navigation logic. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined' || window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value, digits=4) => n(value).toLocaleString(undefined,{maximumFractionDigits:digits});
  const esc = value => String(value ?? '').replace(/[<>&\"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;',"'":'&apos;'}[ch]));
  const pick = (text, re, fallback='—') => String(text || '').match(re)?.[1] || fallback;

  function parsePosition(text){
    const raw = String(text || '');
    const entry = n(pick(raw,/Entry:\s*([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const mark = n(pick(raw,/Mark:\s*([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const side = pick(raw,/(?:Futures\s+[A-Z0-9_/-]+\s*·\s*|^[A-Z0-9_/-]+\s*·\s*)(Long|Short)/im,'Long').toLowerCase();
    const symbol = pick(raw,/Futures\s+([A-Z0-9_/-]+)\s*·\s*(?:Long|Short)/i,pick(raw,/^\s*([A-Z0-9_/-]+)\s*·\s*(?:long|short)/im,'BTC/USDT'));
    const name = (raw.split(' · KitSetups Futures')[0] || 'KitSetups Trader').trim();
    const leverage = pick(raw,/Leverage:\s*([0-9.]+)x/i,'—');
    const percentage = entry && mark ? ((mark-entry)/entry*100) * (side === 'short' ? -1 : 1) : 0;
    return {name,symbol,side,entry,mark,leverage,percentage};
  }

  function payloadText(position){
    const p = typeof position === 'string' ? parsePosition(position) : position;
    return `${p.name} · KitSetups Futures\n${p.symbol} · ${p.side}\nPnL: ${p.percentage >= 0 ? '+' : ''}${fmt(p.percentage,4)}%\nEntry: ${fmt(p.entry,8)} · Mark: ${fmt(p.mark,8)}\nLeverage: ${p.leverage}x`;
  }

  function shareSvg(text){
    const p = parsePosition(text);
    const positive = p.percentage >= 0;
    const accent = positive ? '#25d6d0' : '#ff5266';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a10"/><stop offset=".55" stop-color="#0b151e"/><stop offset="1" stop-color="#071015"/></linearGradient></defs><rect width="1080" height="1920" rx="58" fill="url(#bg)"/><rect x="48" y="48" width="984" height="1824" rx="46" fill="none" stroke="#263141" stroke-width="2"/><text x="88" y="126" fill="${accent}" font-family="Arial,sans-serif" font-size="30" font-weight="800">KITSETUPS</text><text x="88" y="166" fill="#66768a" font-family="Arial,sans-serif" font-size="18">FUTURES POSITION · ${esc(p.side.toUpperCase())}</text><text x="88" y="310" fill="#eef3f9" font-family="Arial,sans-serif" font-size="38" font-weight="800">${esc(p.name)}</text><text x="88" y="355" fill="#738398" font-family="Arial,sans-serif" font-size="24">${esc(p.symbol)}</text><text x="88" y="480" fill="#66768a" font-family="Arial,sans-serif" font-size="20">PNL PERFORMANCE</text><text x="88" y="600" fill="${accent}" font-family="Arial,sans-serif" font-size="96" font-weight="900">${p.percentage >= 0 ? '+' : ''}${fmt(p.percentage,4)}%</text><rect x="88" y="710" width="904" height="2" fill="#202c38"/><text x="88" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">ENTRY</text><text x="88" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(fmt(p.entry,8))}</text><text x="540" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">MARK</text><text x="540" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(fmt(p.mark,8))}</text><text x="88" y="920" fill="#66768a" font-family="Arial,sans-serif" font-size="18">LEVERAGE</text><text x="88" y="962" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${esc(p.leverage)}x</text><rect x="88" y="1080" width="904" height="260" rx="30" fill="#0b121a" stroke="#202c38"/><text x="124" y="1140" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">KITSETUPS · FUTURES SNAPSHOT</text><text x="124" y="1200" fill="#aab6c7" font-family="Arial,sans-serif" font-size="22">Entry-to-mark percentage performance</text><text x="88" y="1780" fill="#66768a" font-family="Arial,sans-serif" font-size="18">${esc(new Date().toLocaleString())}</text><text x="88" y="1820" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">kitsetups.xyz</text></svg>`;
  }

  async function svgToPngFile(svg, filename){
    const blob = new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1920;
      const context = canvas.getContext('2d');
      if(!context) throw new Error('Canvas unavailable');
      context.drawImage(image,0,0);
      const pngBlob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      if(!pngBlob) throw new Error('PNG conversion failed');
      return new File([pngBlob],filename,{type:'image/png'});
    } finally { URL.revokeObjectURL(url); }
  }

  function downloadFile(file){
    const url = URL.createObjectURL(file);
    const out = document.createElement('a');
    out.href = url; out.download = file.name; out.rel = 'noopener';
    document.body.appendChild(out); out.click(); out.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

  async function sharePosition(text){
    const cleaned = payloadText(text);
    const file = await svgToPngFile(shareSvg(cleaned),'kitsetups-futures.png');
    if(navigator.share){
      try { await navigator.share({title:'KitSetups Futures',files:[file]}); return true; }
      catch(error){ if(error?.name === 'AbortError') return true; }
    }
    downloadFile(file);
    return true;
  }

  // Keep the native share interception narrow to KitSetups Futures PnL payloads.
  const nativeShare = navigator.share?.bind(navigator);
  if(nativeShare){
    try {
      navigator.share = async data => {
        if(data?.title === 'KitSetups Futures PnL' && data?.text){
          return sharePosition(data.text);
        }
        return nativeShare(data);
      };
    } catch(_) {}
  }

  // Capture the actual PnL share button before React's text share handler runs.
  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('button');
    if(!button || button.dataset.kitPnlShareHandled) return;
    const label = String(button.textContent || '').trim();
    if(!/share/i.test(label)) return;
    let card = button.parentElement;
    while(card && card !== document.body){
      const text = String(card.textContent || '');
      if(/Entry:\s*[0-9,]+/i.test(text) && /Mark:\s*[0-9,]+/i.test(text) && /Leverage:\s*[0-9.]+x/i.test(text)) break;
      card = card.parentElement;
    }
    if(!card) return;
    const raw = String(card.textContent || '');
    if(!/KitSetups|PnL|UNREALIZED PNL/i.test(raw)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.dataset.kitPnlShareHandled = '1';
    try { await sharePosition(raw); }
    catch(_) { button.dataset.kitPnlShareHandled = ''; }
  }, true);

  // Convert only the PnL SVG download generated by the Futures page into PNG.
  document.addEventListener('click', async event => {
    const anchor = event.target?.closest?.('a[download]');
    if(!anchor || anchor.dataset.kitPnlHandled || !/^kitsetups-.*-pnl\.svg$/i.test(anchor.download || '') || !anchor.href?.startsWith('blob:')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    anchor.dataset.kitPnlHandled = '1';
    try {
      const svg = await (await fetch(anchor.href)).text();
      const file = await svgToPngFile(shareSvg(svg),'kitsetups-futures.png');
      if(navigator.share){
        try { await navigator.share({title:'KitSetups Futures',files:[file]}); }
        catch(error){ if(error?.name !== 'AbortError') downloadFile(file); }
      } else downloadFile(file);
    } catch(_) {
      anchor.dataset.kitPnlHandled = '';
    }
  }, true);
})();
