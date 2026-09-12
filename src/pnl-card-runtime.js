const q = (root, selector) => root?.querySelector(selector);
const textOf = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderPnlCard(card) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1920;

  const name = textOf(q(card, '.pnl-card-brand b')) || 'KitSetups Trader';
  const pair = textOf(q(card, 'h3')) || 'Futures Position';
  const pnlEl = q(card, 'strong');
  const pnlText = textOf(pnlEl) || '↗ 0 USDT';
  const positive = !/↘|[-−]\s*\d/.test(pnlText);
  const accent = positive ? '#25d6d0' : '#ff5266';
  const stats = [...card.querySelectorAll('.pnl-meta p')].map((p) => ({
    label: textOf(p).split(/\s+(?=\d|—|Not|USDT|x)/)[0] || '',
    value: textOf(q(p, 'b')) || textOf(p).replace(textOf(q(p, 'b')), '').trim()
  }));
  const risk = [...card.querySelectorAll('.pnl-risk-strip span')].map((p) => textOf(p));
  const footer = textOf(q(card, '.pnl-card-foot')) || `${new Date().toLocaleString()} · kitsetups.xyz`;
  const avatar = q(card, '.pnl-card-avatar img');
  const avatarUrl = avatar?.currentSrc || avatar?.src || '';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#06090e');
  bg.addColorStop(1, '#0d1720');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(850, 210, 20, 850, 210, 500);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 720);

  const rounded = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const drawText = (value, x, y, size, color, weight = '400', align = 'left') => {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(String(value), x, y);
  };
  const label = (value, x, y) => drawText(value, x, y, 20, '#66768a', '600');
  const value = (v, x, y) => drawText(v, x, y, 29, '#eef3f9', '700');

  rounded(48, 48, 984, 1824, 46);
  ctx.strokeStyle = '#263141';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawText('KITSETUPS', 88, 126, 30, accent, '800');
  drawText('FUTURES POSITION', 88, 166, 18, '#66768a', '600');

  ctx.beginPath();
  ctx.arc(116, 250, 52, 0, Math.PI * 2);
  ctx.fillStyle = '#111c25';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();

  const avatarImg = await loadImage(avatarUrl);
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(116, 250, 47, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, 69, 203, 94, 94);
    ctx.restore();
  } else {
    drawText(name.slice(0, 1).toUpperCase(), 116, 262, 34, '#eef3f9', '800', 'center');
  }
  drawText(name, 190, 248, 28, '#eef3f9', '700');
  drawText(pair, 190, 282, 18, '#66768a', '600');

  label('UNREALIZED PNL', 88, 430);
  drawText(pnlText, 88, 530, 86, accent, '800');
  drawText('USDT', 88, 570, 20, '#8b99aa', '600');
  ctx.fillStyle = '#202c38';
  ctx.fillRect(88, 650, 904, 2);

  const fallbackStats = [
    ['Entry', '—'], ['Mark', '—'], ['Size', '—'], ['Leverage', '—'],
    ['Liquidation', '—'], ['Margin', '—']
  ];
  const rows = stats.length >= 6 ? stats : fallbackStats;
  label('ENTRY', 88, 730); value(rows[0].value, 88, 770);
  label('MARK', 540, 730); value(rows[1].value, 540, 770);
  label('SIZE', 88, 860); value(rows[2].value, 88, 900);
  label('LEVERAGE', 540, 860); value(rows[3].value, 540, 900);
  label('LIQUIDATION', 88, 990); drawText(rows[4].value, 88, 1030, 29, '#ff8a96', '700');
  label('MARGIN', 540, 990); value(rows[5].value, 540, 1030);

  rounded(88, 1110, 904, 270, 28);
  ctx.fillStyle = '#0b121a';
  ctx.fill();
  ctx.strokeStyle = '#202c38';
  ctx.stroke();
  drawText('RISK MANAGEMENT', 124, 1170, 18, accent, '800');
  label('STOP LOSS', 124, 1220);
  value(risk.find((x) => /^SL\b/i.test(x))?.replace(/^SL\s*/i, '') || 'Not set', 124, 1260);
  label('TAKE PROFIT', 540, 1220);
  value(risk.find((x) => /^TP\b/i.test(x))?.replace(/^TP\s*/i, '') || 'Not set', 540, 1260);
  drawText(risk.length ? 'Protection active · adjustable while position is open.' : 'No active protective order.', 124, 1320, 17, risk.length ? '#25d6d0' : '#66768a', '600');
  drawText(footer.split(' · ')[0], 88, 1780, 18, '#66768a', '500');
  drawText('kitsetups.xyz', 88, 1820, 18, accent, '800');

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
  if (!blob) throw new Error('Could not render the PnL card.');
  const file = new File([blob], `kitsetups-pnl-${Date.now()}.png`, { type: 'image/png' });
  return { blob, file, url: URL.createObjectURL(blob) };
}

async function handlePnlAction(button, share) {
  const dialog = button.closest('.pnl-share-dialog');
  const card = q(dialog, '.pnl-share-card');
  if (!card) return;
  button.disabled = true;
  try {
    const rendered = await renderPnlCard(card);
    const caption = `${textOf(q(card, '.pnl-card-brand b')) || 'KitSetups Trader'} · KitSetups Futures\n${textOf(q(card, 'h3'))}\nPnL: ${textOf(q(card, 'strong'))}`;
    if (share && navigator.share && navigator.canShare?.({ files: [rendered.file] })) {
      await navigator.share({ files: [rendered.file], title: 'KitSetups Futures PnL', text: caption });
    } else {
      const a = document.createElement('a');
      a.href = rendered.url;
      a.download = rendered.file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (share && navigator.clipboard) await navigator.clipboard.writeText(caption);
      if (share && navigator.share) {
        try { await navigator.share({ title: 'KitSetups Futures PnL', text: caption }); } catch (_) {}
      }
    }
    setTimeout(() => URL.revokeObjectURL(rendered.url), 1500);
  } catch (error) {
    console.error('[KitSetups PnL]', error);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.pnl-share-actions button');
  if (!button) return;
  const action = textOf(button).toLowerCase();
  if (!action.includes('share') && !action.includes('download')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handlePnlAction(button, action.includes('share'));
}, true);
