const clean = value => String(value ?? '').trim();

function collectStyles() {
  const chunks = [];
  for (const sheet of [...document.styleSheets]) {
    try {
      const rules = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
      if (rules) chunks.push(rules);
    } catch { /* Ignore inaccessible third-party stylesheets. */ }
  }
  return chunks.join('\n').replace(/<\/style/gi, '<\\/style');
}

function numberFromText(value) {
  const match = clean(value).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function findMetaValue(card, labels) {
  const wanted = labels.map(x => x.toLowerCase());
  for (const item of card.querySelectorAll('.pnl-meta > *')) {
    const label = clean(item.querySelector('small')?.textContent).toLowerCase();
    if (wanted.some(x => label.includes(x))) {
      return numberFromText(item.querySelector('b')?.textContent);
    }
  }
  return NaN;
}

function calculateRoi(card) {
  const pnl = numberFromText(card.querySelector(':scope > strong')?.textContent);
  const margin = findMetaValue(card, ['margin', 'initial margin']);
  if (Number.isFinite(pnl) && Number.isFinite(margin) && margin > 0) return (pnl / margin) * 100;

  const entry = findMetaValue(card, ['entry']);
  const mark = findMetaValue(card, ['mark', 'exit', 'last']);
  const leverage = findMetaValue(card, ['leverage']);
  if (Number.isFinite(entry) && entry > 0 && Number.isFinite(mark) && mark > 0 && Number.isFinite(leverage)) {
    const side = clean(card.textContent).toUpperCase().includes('SHORT') ? -1 : 1;
    return ((mark - entry) / entry) * leverage * 100 * side;
  }
  return NaN;
}

function applyPrivatePnlDisplay(card) {
  const strong = card?.querySelector(':scope > strong');
  if (!strong) return;
  const roi = calculateRoi(card);
  if (!Number.isFinite(roi)) return;
  const sign = roi > 0 ? '+' : '';
  strong.textContent = `${sign}${roi.toFixed(2)}%`;
  strong.dataset.kitsetupsRoi = 'true';
  strong.setAttribute('aria-label', `${sign}${roi.toFixed(2)} percent ROI`);
}

function protectPnlActions() {
  const style = document.createElement('style');
  style.id = 'kitsetups-pnl-actions-fix';
  style.textContent = `
    .pnl-share-actions { position:relative !important; z-index:99999 !important; pointer-events:auto !important; }
    .pnl-share-actions button { position:relative !important; z-index:100000 !important; pointer-events:auto !important; touch-action:manipulation !important; cursor:pointer !important; }
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);
}

async function captureVisibleCard(card) {
  applyPrivatePnlDisplay(card);
  const rect = card.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scale = Math.min(4, Math.max(2, 1080 / width));
  const styles = collectStyles();
  const clone = card.cloneNode(true);

  clone.querySelectorAll('button, .pnl-share-actions').forEach(node => node.remove());
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.animation = 'none';
  clone.style.transition = 'none';
  clone.style.overflow = 'hidden';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden"><style>${styles}</style>${clone.outerHTML}</div></foreignObject></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
    if (!pngBlob) throw new Error('Could not render the PnL image.');
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function exportPnl(action) {
  const card = document.querySelector('.pnl-share-card');
  if (!card) throw new Error('PnL card is not open.');
  applyPrivatePnlDisplay(card);
  const blob = await captureVisibleCard(card);
  const symbol = clean(card.querySelector('h3')?.textContent || 'position').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const file = new File([blob], `kitsetups-${symbol || 'position'}-pnl.png`, { type: 'image/png' });

  if (action === 'share' && typeof navigator.share === 'function') {
    try {
      if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'KitSetups Futures PnL', text: clean(card.querySelector('h3')?.textContent || 'KitSetups Futures PnL'), files: [file] });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1200);
}

protectPnlActions();

const observer = new MutationObserver(() => {
  const card = document.querySelector('.pnl-share-card');
  if (card) applyPrivatePnlDisplay(card);
});
observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

document.addEventListener('click', event => {
  const button = event.target.closest('.pnl-share-actions button');
  if (!button) return;
  const label = clean(button.textContent).toLowerCase();
  if (label !== 'share' && label !== 'download') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  exportPnl(label).catch(error => console.error('KitSetups PnL export failed:', error));
}, true);
