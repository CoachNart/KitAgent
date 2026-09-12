/* Safe PnL share/download adapter. It never patches the app's navigation or data flows. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined' || window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;

  const escapeXml = value => String(value ?? '').replace(/[<>&\"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;',"'":'&apos;'}[ch]));
  const pick = (text, re, fallback='—') => String(text || '').match(re)?.[1] || fallback;
  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = (value, digits=4) => n(value).toLocaleString(undefined,{maximumFractionDigits:digits});

  function positionPercent(text){
    const entry = n(pick(text,/Entry:\s*([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const mark = n(pick(text,/Mark:\s*([0-9,]+(?:\.[0-9]+)?)/i,'0').replace(/,/g,''));
    const side = pick(text,/·\s*(Long|Short)/i,'Long').toLowerCase();
    if(!entry || !mark) return 0;
    return ((mark-entry)/entry*100) * (side === 'short' ? -1 : 1);
  }

  function shareSvg(text){
    const raw = String(text || '');
    const name = raw.split(' · KitSetups Futures')[0] || 'KitSetups Trader';
    const symbol = pick(raw,/Futures\s+([A-Z0-9_/]+)\s*·\s*(?:Long|Short)/i,'BTC/USDT');
    const side = pick(raw,/Futures\s+[A-Z0-9_/]+\s*·\s*(Long|Short)/i,'Long');
    const entry = pick(raw,/Entry:\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const mark = pick(raw,/Mark:\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const leverage = pick(raw,/Leverage:\s*([0-9.]+)x/i);
    const percentage = positionPercent(raw);
    const positive = percentage >= 0;
    const accent = positive ? '#25d6d0' : '#ff5266';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a10"/><stop offset=".55" stop-color="#0b151e"/><stop offset="1" stop-color="#071015"/></linearGradient></defs>
      <rect width="1080" height="1920" rx="58" fill="url(#bg)"/><rect x="48" y="48" width="984" height="1824" rx="46" fill="none" stroke="#263141" stroke-width="2"/>
      <text x="88" y="126" fill="${accent}" font-family="Arial,sans-serif" font-size="30" font-weight="800">KITSETUPS</text>
      <text x="88" y="166" fill="#66768a" font-family="Arial,sans-serif" font-size="18">FUTURES POSITION · ${escapeXml(side.toUpperCase())}</text>
      <text x="88" y="310" fill="#eef3f9" font-family="Arial,sans-serif" font-size="38" font-weight="800">${escapeXml(name)}</text>
      <text x="88" y="355" fill="#738398" font-family="Arial,sans-serif" font-size="24">${escapeXml(symbol)}</text>
      <text x="88" y="480" fill="#66768a" font-family="Arial,sans-serif" font-size="20">POSITION PERFORMANCE</text>
      <text x="88" y="600" fill="${accent}" font-family="Arial,sans-serif" font-size="96" font-weight="900">${percentage >= 0 ? '+' : ''}${fmt(percentage,4)}%</text>
      <rect x="88" y="710" width="904" height="2" fill="#202c38"/>
      <text x="88" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">ENTRY</text><text x="88" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(entry)}</text>
      <text x="540" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">MARK</text><text x="540" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(mark)}</text>
      <text x="88" y="920" fill="#66768a" font-family="Arial,sans-serif" font-size="18">LEVERAGE</text><text x="88" y="962" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(leverage)}x</text>
      <rect x="88" y="1080" width="904" height="260" rx="30" fill="#0b121a" stroke="#202c38"/>
      <text x="124" y="1140" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">KITSETUPS · FUTURES SNAPSHOT</text>
      <text x="124" y="1200" fill="#aab6c7" font-family="Arial,sans-serif" font-size="22">Price performance from entry to current mark</text>
      <text x="124" y="1255" fill="#66768a" font-family="Arial,sans-serif" font-size="18">No margin or USDT PnL included</text>
      <text x="88" y="1780" fill="#66768a" font-family="Arial,sans-serif" font-size="18">${escapeXml(new Date().toLocaleString())}</text>
      <text x="88" y="1820" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">kitsetups.xyz</text>
    </svg>`;
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
      canvas.getContext('2d').drawImage(image,0,0);
      const pngBlob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      if(!pngBlob) throw new Error('PNG conversion failed');
      return new File([pngBlob],filename,{type:'image/png'});
    } finally { URL.revokeObjectURL(url); }
  }

  const nativeShare = navigator.share?.bind(navigator);
  if(nativeShare){
    navigator.share = async data => {
      if(data?.title === 'KitSetups Futures PnL' && data?.text){
        try {
          const file = await svgToPngFile(shareSvg(data.text),'kitsetups-futures.png');
          if(navigator.canShare?.({files:[file]})) return nativeShare({title:'KitSetups Futures',files:[file]});
        } catch(_) { /* fall through to normal text sharing */ }
      }
      return nativeShare(data);
    };
  }

  document.addEventListener('click', async event => {
    const anchor = event.target?.closest?.('a[download]');
    if(!anchor || anchor.dataset.kitPnlHandled || !/^kitsetups-.*-pnl\.svg$/i.test(anchor.download || '') || !anchor.href?.startsWith('blob:')) return;
    event.preventDefault();
    event.stopPropagation();
    anchor.dataset.kitPnlHandled = '1';
    try {
      const svg = shareSvg(await (await fetch(anchor.href)).text());
      const file = await svgToPngFile(svg,'kitsetups-futures.png');
      if(navigator.share && navigator.canShare?.({files:[file]})) await navigator.share({title:'KitSetups Futures',files:[file]});
      else {
        const url = URL.createObjectURL(file);
        const out = document.createElement('a'); out.href=url; out.download=file.name; out.rel='noopener';
        document.body.appendChild(out); out.click(); out.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch(_) {
      anchor.dataset.kitPnlHandled = '';
      anchor.click();
    }
  }, true);
})();
