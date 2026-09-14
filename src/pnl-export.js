import html2canvas from 'html2canvas';

const clean = value => String(value ?? '').trim();

function numberFromText(value) {
  const match = clean(value).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function findMetaValue(card, labels) {
  const wanted = labels.map(label => label.toLowerCase());
  for (const item of card.querySelectorAll('.pnl-meta > *')) {
    const text = clean(item.textContent).toLowerCase();
    if (!wanted.some(label => text.includes(label))) continue;
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
  strong.setAttribute('aria-label', `${sign}${roi.toFixed(2)} percent ROI`);
}

function getAction(button) {
  const value = [
    button.dataset?.action,
    button.getAttribute('data-export'),
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    button.textContent
  ].map(clean).join(' ').toLowerCase();

  if (value.includes('download')) return 'download';
  if (value.includes('share')) return 'share';
  return '';
}

async function captureCard(card) {
  ensureRoi(card);

  // Capture the actual rendered card. No second/custom card is generated.
  const canvas = await html2canvas(card, {
    backgroundColor: null,
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
    imageTimeout: 10000,
    removeContainer: true,
    onclone: clonedDocument => {
      const clonedCard = clonedDocument.querySelector('.pnl-share-card');
      if (!clonedCard) return;
      clonedCard.querySelectorAll('.pnl-share-actions, button').forEach(node => node.remove());
      clonedCard.style.transform = 'none';
      clonedCard.style.animation = 'none';
      clonedCard.style.transition = 'none';
    }
  });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) throw new Error('Could not create the PnL image.');
  return blob;
}

async function exportPnl(action) {
  const card = document.querySelector('.pnl-share-card');
  if (!card) throw new Error('PnL card is not open.');

  const png = await captureCard(card);
  const title = clean(card.querySelector('h3')?.textContent || 'KitSetups PnL');
  const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'position';
  const file = new File([png], `kitsetups-${slug}-pnl.png`, { type: 'image/png' });

  if (action === 'share' && typeof navigator.share === 'function') {
    try {
      const canShare = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({
          title: 'KitSetups Futures PnL',
          text: title,
          files: [file]
        });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('KitSetups share failed; falling back to download.', error);
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
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
      event.stopImmediatePropagation();
      exportPnl(action).catch(error => console.error('KitSetups PnL export failed:', error));
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
