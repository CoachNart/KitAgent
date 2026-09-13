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
  const sl = readValue(card, 'Stop Loss');
  const tp = readValue(card, 'Take Profit');
  if (!entry || !mark) throw new Error('PnL card is missing Entry or Mark price.');
  const percentage = ((mark - entry) / entry) * 100 * (side === 'SHORT' ? -1 : 1);
  return { symbol, side, entry, mark, sl, tp, percentage };
}

function makePngFile(position) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');

  const positive = position.percentage >= 0;
  const accent = positive ? '#25d6d0' : '#ff5266';
  const bg = ctx.createLinearGradient(0, 0, 1080, 1350);
  bg.addColorStop(0, '#060a10');
  bg.addColorStop(0.58, '#0b151e');
  bg.addColorStop(1, '#071015');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1350);

  const glow = ctx.createRadialGradient(875, 185, 0, 875, 185, 460);
  glow.addColorStop(0, positive ? 'rgba(37,214,208,.22)' : 'rgba(255,82,102,.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 700);

  ctx.strokeStyle = '#263141';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, 984, 1254);

  const text = (value, x, y, size, fill = '#eef3f9', weight = '400') => {
    ctx.fillStyle = fill;
    ctx.font = `${weight} ${size}px Arial,sans-serif`;
    ctx.fillText(String(value), x, y);
  };

  text('KITSETUPS', 88, 118, 32, accent, '800');
  text('FUTURES PNL', 88, 154, 18, '#66768a', '700');
  text(`${position.symbol} · ${position.side}`, 88, 250, 32, '#eef3f9', '800');

  text('PNL', 88, 350, 20, '#66768a', '700');
  text(`${positive ? '+' : ''}${position.percentage.toFixed(4)}%`, 88, 470, 96, accent, '900');

  ctx.fillStyle = '#202c38';
  ctx.fillRect(88, 550, 904, 2);

  text('ENTRY', 88, 625, 18, '#66768a', '700');
  text(position.entry.toLocaleString(undefined, { maximumFractionDigits: 8 }), 88, 672, 30, '#eef3f9', '700');

  text('MARK', 560, 625, 18, '#66768a', '700');
  text(position.mark.toLocaleString(undefined, { maximumFractionDigits: 8 }), 560, 672, 30, '#eef3f9', '700');

  text('STOP LOSS', 88, 780, 18, '#66768a', '700');
  text(position.sl, 88, 827, 30, '#eef3f9', '700');

  text('TAKE PROFIT', 560, 780, 18, '#66768a', '700');
  text(position.tp, 560, 827, 30, '#eef3f9', '700');

  ctx.fillStyle = '#202c38';
  ctx.fillRect(88, 910, 904, 2);
  text('POSITION RESULT', 88, 978, 18, '#66768a', '700');
  text(`${positive ? 'PROFIT' : 'LOSS'} · ${position.percentage.toFixed(4)}%`, 88, 1032, 34, accent, '800');
  text('kitsetups.xyz', 88, 1230, 19, accent, '800');
  text(`${position.symbol} · ${position.side}`, 790, 1230, 18, '#66768a', '700');

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
          text: `${position.symbol} · ${position.side} · ${position.percentage >= 0 ? '+' : ''}${position.percentage.toFixed(4)}%`,
          files: [file]
        });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

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
