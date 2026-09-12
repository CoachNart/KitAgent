/* Keeps the PnL share/download artifact visually identical to the live card. */
(function installPnlShareRuntime(){
  if(typeof window === 'undefined') return;
  if(window.__kitPnlShareRuntimeInstalled) return;
  window.__kitPnlShareRuntimeInstalled = true;

  const escapeXml = value => String(value ?? '').replace(/[<>&\"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;',"'":'&apos;'}[ch]));
  const pick = (text, re, fallback='—') => String(text || '').match(re)?.[1] || fallback;

  function buildShareSvg(text){
    const raw = String(text || '');
    const name = raw.split(' · KitSetups Futures')[0] || 'KitSetups Trader';
    const symbol = pick(raw, /Futures\s+([A-Z0-9_/]+)\s*·\s*(?:Long|Short)/i, 'BTC/USDT');
    const side = pick(raw, /Futures\s+[A-Z0-9_/]+\s*·\s*(Long|Short)/i, 'Long');
    const pnl = pick(raw, /PnL:\s*([+-]?[0-9,]+(?:\.[0-9]+)?)\s*USDT/i, '0');
    const entry = pick(raw, /Entry:\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const mark = pick(raw, /Mark:\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const leverage = pick(raw, /Leverage:\s*([0-9.]+)x/i);
    const positive = !/^[-−]/.test(pnl);
    const accent = positive ? '#25d6d0' : '#ff5266';
    const rocket = `\n      <g transform="translate(735 116) rotate(16)" filter="url(#shadow)">
        <path d="M78 8C58 12 40 25 29 43L8 78l29 29 35-21c18-11 31-30 35-51 2-9 2-18 1-27-9-1-20-1-30 0Z" fill="${accent}"/>
        <circle cx="69" cy="51" r="13" fill="#071017" stroke="#e9ffff" stroke-width="4"/>
        <path d="M30 84 4 95l11-25M44 101l-6 27 19-20M22 102 4 119l27-9" fill="${accent}"/>
      </g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#060a10"/><stop offset=".55" stop-color="#0b151e"/><stop offset="1" stop-color="#071015"/></linearGradient>
        <radialGradient id="glow"><stop offset="0" stop-color="${accent}" stop-opacity=".3"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <filter id="shadow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="1080" height="1920" rx="58" fill="url(#bg)"/>
      <circle cx="870" cy="230" r="470" fill="url(#glow)"/>
      <rect x="48" y="48" width="984" height="1824" rx="46" fill="none" stroke="#263141" stroke-width="2"/>
      ${rocket}
      <text x="88" y="126" fill="${accent}" font-family="Arial,sans-serif" font-size="30" font-weight="800">KITSETUPS</text>
      <text x="88" y="166" fill="#66768a" font-family="Arial,sans-serif" font-size="18">FUTURES POSITION · ${escapeXml(side.toUpperCase())}</text>
      <text x="88" y="310" fill="#eef3f9" font-family="Arial,sans-serif" font-size="38" font-weight="800">${escapeXml(name)}</text>
      <text x="88" y="355" fill="#738398" font-family="Arial,sans-serif" font-size="24">${escapeXml(symbol)}</text>
      <text x="88" y="480" fill="#66768a" font-family="Arial,sans-serif" font-size="20">UNREALIZED PNL</text>
      <text x="88" y="590" fill="${accent}" font-family="Arial,sans-serif" font-size="94" font-weight="900">${positive ? '+' : ''}${escapeXml(pnl)}</text>
      <text x="88" y="632" fill="#8b99aa" font-family="Arial,sans-serif" font-size="22">USDT</text>
      <rect x="88" y="710" width="904" height="2" fill="#202c38"/>
      <text x="88" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">ENTRY</text><text x="88" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(entry)}</text>
      <text x="540" y="790" fill="#66768a" font-family="Arial,sans-serif" font-size="18">MARK</text><text x="540" y="832" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(mark)}</text>
      <text x="88" y="920" fill="#66768a" font-family="Arial,sans-serif" font-size="18">LEVERAGE</text><text x="88" y="962" fill="#eef3f9" font-family="Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(leverage)}x</text>
      <rect x="88" y="1080" width="904" height="260" rx="30" fill="#0b121a" stroke="#202c38"/>
      <text x="124" y="1140" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">KITSETUPS · PNL SNAPSHOT</text>
      <text x="124" y="1200" fill="#aab6c7" font-family="Arial,sans-serif" font-size="22">Live futures position performance</text>
      <text x="124" y="1255" fill="#66768a" font-family="Arial,sans-serif" font-size="18">Generated from your current position data</text>
      <text x="88" y="1780" fill="#66768a" font-family="Arial,sans-serif" font-size="18">${escapeXml(new Date().toLocaleString())}</text>
      <text x="88" y="1820" fill="${accent}" font-family="Arial,sans-serif" font-size="18" font-weight="800">kitsetups.xyz</text>
    </svg>`;
  }

  const nativeShare = navigator.share?.bind(navigator);
  if(nativeShare){
    navigator.share = async data => {
      if(data?.title === 'KitSetups Futures' && data?.text && typeof File !== 'undefined'){
        const svg = buildShareSvg(data.text);
        const file = new File([svg], 'kitsetups-pnl.svg', {type:'image/svg+xml'});
        if(navigator.canShare?.({files:[file]})){
          return nativeShare({title:'KitSetups Futures PnL', text:'KitSetups Futures PnL', files:[file]});
        }
      }
      return nativeShare(data);
    };
  }

  document.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[download]');
    if(!anchor || anchor.dataset.kitPnlHandled || !/^kitsetups-.*-pnl\.svg$/i.test(anchor.download || '')) return;
    const href = anchor.href;
    if(!href || !href.startsWith('blob:')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    anchor.dataset.kitPnlHandled = '1';
    fetch(href).then(r => r.text()).then(svg => {
      if(!svg.includes('kit-pnl-rocket')) svg = svg.replace('</svg>', `<g id="kit-pnl-rocket" transform="translate(735 116) rotate(16)" filter="url(#kitRocketGlow)"><defs><filter id="kitRocketGlow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M78 8C58 12 40 25 29 43L8 78l29 29 35-21c18-11 31-30 35-51 2-9 2-18 1-27-9-1-20-1-30 0Z" fill="#25d6d0"/><circle cx="69" cy="51" r="13" fill="#071017" stroke="#e9ffff" stroke-width="4"/><path d="M30 84 4 95l11-25M44 101l-6 27 19-20M22 102 4 119l27-9" fill="#25d6d0"/></g></svg>`);
      const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}));
      const out = document.createElement('a');
      out.href = url;
      out.download = anchor.download;
      document.body.appendChild(out);
      out.click();
      out.remove();
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(href);
    }).catch(() => anchor.click());
  }, true);
})();
