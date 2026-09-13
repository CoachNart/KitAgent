const clean = value => String(value ?? '').trim();

function readValue(card, label) {
  const rows = [...card.querySelectorAll('.pnl-meta p, .pnl-risk-strip span')];
  const row = rows.find(el => clean(el.textContent).toLowerCase().startsWith(label.toLowerCase()));
  return clean(row?.querySelector('b')?.textContent || 'Not set');
}

function readPnl(card) {
  const title = clean(card.querySelector('h3')?.textContent || 'BTC/USDT · Long');
  const parts = title.split('·').map(clean);
  const symbol = parts[0] || 'BTC/USDT';
  const side = /short/i.test(parts[1] || '') ? 'SHORT' : 'LONG';
  const entry = Number(readValue(card, 'Entry').replace(/,/g, '')) || 0;
  const mark = Number(readValue(card, 'Mark').replace(/,/g, '')) || 0;
  const size = readValue(card, 'Size');
  const leverageText = readValue(card, 'Leverage');
  const leverage = Number(leverageText.replace(/[^0-9.]/g, '')) || 1;
  const sl = readValue(card, 'Stop Loss');
  const tp = readValue(card, 'Take Profit');
  const pnlText = clean(card.querySelector('.pnl-share-card > strong')?.textContent || '');
  const pnl = Number(pnlText.replace(/[^0-9.-]/g, '')) || 0;
  const profile = clean(card.querySelector('.pnl-card-brand b')?.textContent || 'KitSetups Trader');
  if (!entry || !mark) throw new Error('PnL card is missing Entry or Mark price.');
  const priceReturn = ((mark - entry) / entry) * 100 * (side === 'SHORT' ? -1 : 1);
  const roi = priceReturn * leverage;
  return { symbol, side, entry, mark, size, leverage, sl, tp, pnl, profile, roi };
}

function makePngFile(position) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');

  const positive = position.roi >= 0;
  const accent = positive ? '#22d3c5' : '#ff5266';
  const ink = '#f4f7fb';
  const muted = '#8793a5';
  const panel = 'rgba(8,15,21,.82)';

  ctx.fillStyle = '#020608';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, '#030709');
  bg.addColorStop(.52, '#050b0d');
  bg.addColorStop(1, '#020608');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);

  // Subtle KitSetups-style market grid, inspired by the reference card but kept native.
  ctx.save();
  ctx.globalAlpha = .2;
  ctx.strokeStyle = '#0d7b69';
  ctx.lineWidth = 2;
  for (let x = 42; x <= 1040; x += 86) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1040); ctx.stroke();
  }
  for (let y = 24; y <= 1040; y += 86) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke();
  }
  ctx.globalAlpha = .55;
  ctx.lineWidth = 3;
  const steps = [
    [690, 690], [690, 610], [770, 610], [770, 520], [850, 520], [850, 420], [930, 420], [930, 320], [1010, 320]
  ];
  ctx.beginPath();
  steps.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.restore();

  // Soft accent glow.
  const glow = ctx.createRadialGradient(820, 250, 0, 820, 250, 420);
  glow.addColorStop(0, positive ? 'rgba(34,211,197,.18)' : 'rgba(255,82,102,.18)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 900);

  ctx.strokeStyle = 'rgba(34,211,197,.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 1008, 1278);

  const text = (value, x, y, size, fill = ink, weight = '400', align = 'left') => {
    ctx.fillStyle = fill;
    ctx.font = `${weight} ${size}px Arial,sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(value), x, y);
  };

  // Brand.
  text('KITSETUPS', 70, 100, 34, accent, '800');
  text('FUTURES PNL', 70, 132, 17, muted, '700');

  // Profile identity.
  ctx.beginPath();
  ctx.arc(106, 205, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#0d171c';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(position.profile.slice(0, 1).toUpperCase(), 106, 214, 22, ink, '800', 'center');
  text(position.profile, 154, 212, 26, ink, '700');

  // Pair / side / leverage.
  text(position.symbol, 70, 306, 43, ink, '700');
  const sideWidth = ctx.measureText(position.symbol).width;
  text(`${position.side} ${position.leverage}X`, 90 + sideWidth, 306, 24, accent, '700');

  // ROI block — leverage-adjusted, like an exchange PnL card.
  text('ROI', 70, 388, 20, muted, '700');
  text(`${positive ? '+' : ''}${position.roi.toFixed(2)}%`, 70, 490, 86, accent, '800');
  text(`${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(4)} USDT UNREALIZED PNL`, 72, 528, 18, muted, '600');

  // Decorative native K mark.
  ctx.save();
  ctx.translate(875, 470);
  ctx.rotate(-Math.PI / 7);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-70, -72); ctx.lineTo(-70, 72); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-62, 0); ctx.lineTo(48, -72); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-62, 0); ctx.lineTo(55, 76); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = panel;
  ctx.fillRect(70, 580, 940, 2);

  // Core trade data.
  const box = (x, y, w, label, value) => {
    ctx.fillStyle = 'rgba(7,14,19,.78)';
    ctx.strokeStyle = 'rgba(34,211,197,.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, 112, 18); ctx.fill(); ctx.stroke();
    text(label, x + 24, y + 34, 16, muted, '700');
    text(value, x + 24, y + 78, 27, ink, '700');
  };

  box(70, 620, 450, 'ENTRY PRICE', position.entry.toLocaleString(undefined, { maximumFractionDigits: 8 }));
  box(560, 620, 450, 'MARK / EXIT', position.mark.toLocaleString(undefined, { maximumFractionDigits: 8 }));
  box(70, 752, 450, 'STOP LOSS', position.sl);
  box(560, 752, 450, 'TAKE PROFIT', position.tp);
  box(70, 884, 450, 'POSITION SIZE', position.size || '—');
  box(560, 884, 450, 'LEVERAGE', `${position.leverage}x`);

  ctx.fillStyle = 'rgba(7,14,19,.86)';
  ctx.strokeStyle = 'rgba(34,211,197,.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(70, 1024, 940, 118, 20); ctx.fill(); ctx.stroke();
  text('POSITION RESULT', 96, 1062, 16, muted, '700');
  text(`${positive ? 'PROFIT' : 'LOSS'} · ${Math.abs(position.roi).toFixed(2)}% ROI`, 96, 1102, 30, accent, '800');
  text(position.symbol, 982, 1102, 18, muted, '700', 'right');

  text('kitsetups.xyz', 70, 1262, 19, accent, '800');
  text('AI-POWERED ONCHAIN MARKET INTELLIGENCE', 1010, 1262, 14, muted, '700', 'right');

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const filename = `kitsetups-${position.symbol.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-pnl.png`;
  return new File([bytes], filename, { type: 'image/png' });
}

function download(file) {
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

async function exportPnl(action) {
  const card = document.querySelector('.pnl-share-card');
  if (!card) throw new Error('PnL card is not open.');
  const position = readPnl(card);
  const file = makePngFile(position);

  if (action === 'share' && typeof navigator.share === 'function') {
    try {
      if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'KitSetups Futures PnL',
          text: `${position.symbol} · ${position.side} · ${position.roi >= 0 ? '+' : ''}${position.roi.toFixed(2)}% ROI`,
          files: [file]
        });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  // Desktop browsers and devices without file sharing get a reliable download fallback.
  download(file);
}

document.addEventListener('click', event => {
  const button = event.target.closest('.pnl-share-actions button');
  if (!button) return;
  const label = clean(button.textContent).toLowerCase();
  if (label !== 'share' && label !== 'download') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  exportPnl(label).catch(error => console.error('KitSetups PnL export failed:', error));
}, true);
