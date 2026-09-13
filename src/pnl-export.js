const clean = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function text(card, selector, fallback = '') {
  return card?.querySelector(selector)?.textContent?.trim() || fallback;
}

function buildSvg(card) {
  const brand = text(card, '.pnl-card-brand b', 'KitSetups Trader');
  const title = text(card, 'h3', 'Futures Position');
  const pnl = text(card, 'strong', '0 USDT');
  const pnlPositive = !pnl.includes('-') && !pnl.includes('↘');
  const pnlColor = pnlPositive ? '#22c7a5' : '#f05b6b';
  const meta = [...card.querySelectorAll('.pnl-meta p')].map(row => ({
    label: row.firstChild?.textContent?.trim() || row.textContent?.trim() || '',
    value: row.querySelector('b')?.textContent?.trim() || '—'
  }));
  const risk = [...card.querySelectorAll('.pnl-risk-strip span')].map(row => ({
    label: row.firstChild?.textContent?.trim() || '',
    value: row.querySelector('b')?.textContent?.trim() || 'Not set'
  }));
  const metaRows = meta.slice(0, 6);
  const boxes = metaRows.map((item, i) => {
    const x = i % 2 ? 564 : 76;
    const y = 620 + Math.floor(i / 2) * 126;
    return `<rect x="${x}" y="${y}" width="440" height="104" rx="20" fill="#0a1118" stroke="#202d39"/><text x="${x + 30}" y="${y + 38}" fill="#718094" font-family="Arial,Helvetica,sans-serif" font-size="15">${clean(item.label)}</text><text x="${x + 30}" y="${y + 76}" fill="#eef3f9" font-family="Arial,Helvetica,sans-serif" font-size="23" font-weight="700">${clean(item.value)}</text>`;
  }).join('');
  const riskY = 620 + Math.ceil(metaRows.length / 2) * 126;
  const riskItems = risk.slice(0, 2).map((item, i) => `<text x="${i ? 550 : 108}" y="${riskY + 58}" fill="#8c9aab" font-family="Arial,Helvetica,sans-serif" font-size="15">${clean(item.label)}</text><text x="${i ? 550 : 108}" y="${riskY + 91}" fill="#eef3f9" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">${clean(item.value)}</text>`).join('');
  const footer = text(card, '.pnl-card-foot', 'kitsetups.xyz');
  const height = riskY + 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b10"/><stop offset="1" stop-color="#0d1821"/></linearGradient><radialGradient id="glow" cx="82%" cy="8%" r="65%"><stop offset="0" stop-color="${pnlColor}" stop-opacity=".22"/><stop offset="1" stop-color="${pnlColor}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="${height}" rx="44" fill="url(#bg)"/><rect x="34" y="34" width="1012" height="${height - 68}" rx="38" fill="none" stroke="#253340"/><circle cx="850" cy="150" r="390" fill="url(#glow)"/><text x="76" y="96" fill="#22c7a5" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="800">KITSETUPS</text><text x="76" y="128" fill="#718094" font-family="Arial,Helvetica,sans-serif" font-size="15" letter-spacing="2">FUTURES PNL</text><circle cx="126" cy="214" r="38" fill="#14222d"/><text x="126" y="225" text-anchor="middle" fill="#eef3f9" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700">${clean(brand.slice(0, 1).toUpperCase())}</text><text x="188" y="207" fill="#eef3f9" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700">${clean(brand)}</text><text x="188" y="239" fill="#718094" font-family="Arial,Helvetica,sans-serif" font-size="18">${clean(title)}</text><rect x="76" y="286" width="928" height="250" rx="28" fill="#0a1118" stroke="#202d39"/><text x="112" y="332" fill="#718094" font-family="Arial,Helvetica,sans-serif" font-size="16" letter-spacing="1.4">UNREALIZED PNL</text><text x="112" y="435" fill="${pnlColor}" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="800">${clean(pnl.replace('↗ ', '').replace('↘ ', ''))}</text>${boxes}<rect x="76" y="${riskY}" width="928" height="112" rx="22" fill="#0a1118" stroke="#202d39"/><text x="108" y="${riskY + 30}" fill="#22c7a5" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700">POSITION PROTECTION</text>${riskItems}<text x="76" y="${height - 28}" fill="#647387" font-family="Arial,Helvetica,sans-serif" font-size="14">${clean(footer)}</text><text x="1004" y="${height - 28}" text-anchor="end" fill="#22c7a5" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700">kitsetups.xyz</text></svg>`;
}

async function svgToPng(svg, filename) {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('PnL image could not be rendered.')); img.src = svgUrl; });
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.fillStyle = '#070b10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
    if (!blob) throw new Error('PNG export failed.');
    return new File([blob], filename, { type: 'image/png' });
  } finally { URL.revokeObjectURL(svgUrl); }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportPnl(action) {
  const card = document.querySelector('.pnl-share-card');
  if (!card) return;
  try {
    const title = text(card, 'h3', 'position').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'position';
    const file = await svgToPng(buildSvg(card), `kitsetups-${title}-pnl.png`);
    if (action === 'share' && typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: 'KitSetups Futures PnL', text: text(card, 'h3', 'Futures position'), files: [file] });
      return;
    }
    download(file);
  } catch (error) {
    if (error?.name !== 'AbortError') console.error('KitSetups PnL export failed:', error);
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('.pnl-share-actions button');
  if (!button) return;
  const label = button.textContent.trim().toLowerCase();
  if (label !== 'share' && label !== 'download') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  exportPnl(label);
}, true);
