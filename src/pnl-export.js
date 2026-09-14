const clean = value => String(value ?? '').trim();

function collectStyles() {
  const chunks = [];
  for (const sheet of [...document.styleSheets]) {
    try {
      const rules = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
      if (rules) chunks.push(rules);
    } catch {
      // Ignore inaccessible third-party stylesheets.
    }
  }
  return chunks.join('\n').replace(/<\/style/gi, '<\\/style');
}

function numberFromText(value) {
  const match = clean(value).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function findMetaValue(card, labels) {
  const wanted = labels.map(label => label.toLowerCase());
  for (const item of card.querySelectorAll('.pnl-meta > *')) {
    const labelText = clean(
      item.querySelector('small')?.textContent ||
      item.childNodes[0]?.textContent ||
      item.textContent
    ).toLowerCase();
    if (!wanted.some(label => labelText.includes(label))) continue;
    const value = numberFromText(item.querySelector('b')?.textContent || '');
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function ensureRoi(card) {
  const strong = card.querySelector(':scope > strong');
  if (!strong || /%/.test(clean(strong.textContent))) return;

  const pnl = numberFromText(strong.textContent);
  const margin = findMetaValue(card, ['margin']);
  let roi = Number.isFinite(pnl) && Number.isFinite(margin) && margin > 0
    ? (pnl / margin) * 100
    : NaN;

  if (!Number.isFinite(roi)) {
    const entry = findMetaValue(card, ['entry']);
    const mark = findMetaValue(card, ['mark', 'exit', 'last']);
    const leverage = findMetaValue(card, ['leverage']);
    if (entry > 0 && mark > 0 && Number.isFinite(leverage)) {
      const short = /SHORT/i.test(clean(card.querySelector('h3')?.textContent));
      roi = ((mark - entry) / entry) * leverage * 100 * (short ? -1 : 1);
    }
  }

  if (!Number.isFinite(roi)) return;
  const sign = roi > 0 ? '+' : '';
  strong.textContent = `${sign}${roi.toFixed(2)}%`;
  strong.dataset.kitsetupsRoi = 'true';
  strong.setAttribute('aria-label', `${sign}${roi.toFixed(2)} percent ROI`);
}

async function inlineImages(root) {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map(async img => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;

    try {
      const response = await fetch(new URL(src, window.location.href).href, { mode: 'cors' });
      if (!response.ok) return;
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      img.setAttribute('src', dataUrl);
    } catch {
      // Keep the original image if the provider does not allow CORS.
    }
  }));
}

function prepareClone(card, width, height) {
  const clone = card.cloneNode(true);
  clone.querySelectorAll('.pnl-share-actions, button').forEach(node => node.remove());
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.animation = 'none';
  clone.style.transition = 'none';
  clone.style.overflow = 'hidden';
  return clone;
}

async function renderExactCard(card) {
  ensureRoi(card);

  const rect = card.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scale = Math.min(4, Math.max(2, 1080 / width));
  const clone = prepareClone(card, width, height);
  await inlineImages(clone);
  const styles = collectStyles();

  // Export the rendered DOM itself. Do not create a second/custom PnL design here.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden"><style>${styles}</style>${clone.outerHTML}</div></foreignObject></svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The PnL card could not be rendered on this browser.'));
      image.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
    if (!png) throw new Error('Could not create the PnL image.');
    return png;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getAction(button) {
  const value = [
    button.dataset?.action,
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    button.textContent
  ].map(clean).join(' ').toLowerCase();

  if (value.includes('download')) return 'download';
  if (value.includes('share')) return 'share';
  return '';
}

async function exportPnl(action) {
  const card = document.querySelector('.pnl-share-card');
  if (!card) throw new Error('PnL card is not open.');

  const png = await renderExactCard(card);
  const title = clean(card.querySelector('h3')?.textContent || 'KitSetups PnL');
  const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'position';
  const file = new File([png], `kitsetups-${slug}-pnl.png`, { type: 'image/png' });

  if (action === 'share' && typeof navigator.share === 'function') {
    try {
      const canShareFiles = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title: 'KitSetups Futures PnL',
          text: title,
          files: [file]
        });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('KitSetups native share failed; falling back to download.', error);
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
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1200);
}

function protectActions() {
  if (document.getElementById('kitsetups-pnl-actions-fix')) return;
  const style = document.createElement('style');
  style.id = 'kitsetups-pnl-actions-fix';
  style.textContent = `
    .pnl-share-actions { position:relative !important; z-index:99999 !important; pointer-events:auto !important; }
    .pnl-share-actions button { position:relative !important; z-index:100000 !important; pointer-events:auto !important; touch-action:manipulation !important; cursor:pointer !important; }
  `;
  document.head.appendChild(style);
}

function bindActions() {
  document.querySelectorAll('.pnl-share-actions button').forEach(button => {
    if (button.dataset.kitsetupsExportBound === 'true') return;
    button.dataset.kitsetupsExportBound = 'true';
    button.type = 'button';
    button.addEventListener('click', event => {
      const action = getAction(button);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      exportPnl(action).catch(error => {
        console.error('KitSetups PnL export failed:', error);
        button.dataset.exportError = 'true';
      });
    }, true);
  });
}

protectActions();
bindActions();

const observer = new MutationObserver(() => {
  const card = document.querySelector('.pnl-share-card');
  if (card) ensureRoi(card);
  bindActions();
});
observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
