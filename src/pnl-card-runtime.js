const q = (root, selector) => root?.querySelector(selector);
const textOf = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const num = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const fmt = (value, digits = 6) => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

function parsePosition(dialog) {
  const card = q(dialog, '.pnl-share-card');
  if (!card) return null;
  const meta = {};
  [...card.querySelectorAll('.pnl-meta p')].forEach((p) => {
    const label = clean(p.querySelector('span')?.textContent || p.textContent).split(/\s+/)[0].toLowerCase();
    const value = clean(p.querySelector('b')?.textContent || p.textContent.replace(/^[^0-9-]+/i, ''));
    if (label) meta[label] = value;
  });
  const raw = textOf(card);
  const entry = num(meta.entry || (raw.match(/Entry\s*[:·-]?\s*([0-9,.]+)/i) || [])[1]);
  const mark = num(meta.mark || (raw.match(/Mark\s*[:·-]?\s*([0-9,.]+)/i) || [])[1]);
  const leverage = num(meta.leverage || (raw.match(/Leverage\s*[:·-]?\s*([0-9,.]+)x/i) || [])[1]);
  const margin = num(meta.margin || (raw.match(/Margin\s*[:·-]?\s*([0-9,.]+)/i) || [])[1]);
  const pnl = num(textOf(q(card, 'strong')));
  const explicitPct = (raw.match(/(?:ROI|PnL|Profit|Loss)\s*[:·-]?\s*([+-]?[0-9,.]+)\s*%/i) || [])[1];
  let percent = explicitPct ? num(explicitPct) : 0;
  if (!percent && margin) percent = (pnl / margin) * 100;
  if (!percent && entry && mark && leverage) {
    const direction = /short/i.test(raw) ? -1 : 1;
    percent = ((mark - entry) / entry) * leverage * 100 * direction;
  }
  const avatar = q(card, '.pnl-card-avatar img');
  return {
    name: textOf(q(card, '.pnl-card-brand b')) || 'KitSetups Trader',
    pair: textOf(q(card, 'h3')) || 'Futures Position',
    side: /short/i.test(raw) ? 'SHORT' : 'LONG',
    entry, mark, leverage, percent, positive: percent >= 0,
    avatarUrl: avatar?.currentSrc || avatar?.src || ''
  };
}

function cardHtml(data) {
  const tone = data.positive ? 'profit' : 'loss';
  const arrow = data.positive ? '↗' : '↘';
  return `<div class="kit-pnl-card ${tone}">
    <div class="kit-pnl-top"><div class="kit-pnl-brand">KITSETUPS</div><div class="kit-pnl-side ${tone}">${data.side}</div></div>
    <div class="kit-pnl-user"><div class="kit-pnl-avatar"><span>${clean(data.name).slice(0,1).toUpperCase()}</span></div><div><b>${clean(data.name)}</b><small>${clean(data.pair)}</small></div></div>
    <div class="kit-pnl-result ${tone}">${arrow} ${data.positive ? '+' : ''}${fmt(data.percent, 2)}%</div>
    <div class="kit-pnl-label">POSITION PERFORMANCE</div>
    <div class="kit-pnl-grid">
      <div><small>ENTRY</small><b>${data.entry ? fmt(data.entry) : '—'}</b></div>
      <div><small>MARK</small><b>${data.mark ? fmt(data.mark) : '—'}</b></div>
      <div><small>LEVERAGE</small><b>${data.leverage ? `${fmt(data.leverage, 0)}x` : '—'}</b></div>
      <div><small>POSITION</small><b>${data.side}</b></div>
    </div>
    <div class="kit-pnl-footer">KitSetups Futures · kitsetups.xyz</div>
  </div>`;
}

function injectStyle() {
  if (document.getElementById('kit-pnl-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'kit-pnl-runtime-style';
  style.textContent = `
    .pnl-share-dialog{width:min(390px,calc(100vw - 24px))!important;padding:10px!important;overflow:hidden!important}
    .pnl-share-dialog svg{display:none!important}
    .pnl-share-dialog .pnl-share-card{padding:0!important;border:0!important;background:none!important;box-shadow:none!important}
    .kit-pnl-card{width:100%;aspect-ratio:4/5;border-radius:18px;padding:20px;box-sizing:border-box;position:relative;overflow:hidden;background:linear-gradient(145deg,#0d141d,#080b10);border:1px solid #263141;font-family:Inter Tight,Inter,system-ui,sans-serif;color:#e7edf7}
    .kit-pnl-card:before{content:"";position:absolute;inset:-35% -20% auto auto;width:230px;height:230px;border-radius:50%;background:rgba(37,214,208,.10);filter:blur(22px);pointer-events:none}.kit-pnl-card.loss:before{background:rgba(255,82,102,.10)}
    .kit-pnl-top,.kit-pnl-user{display:flex;position:relative;z-index:1}.kit-pnl-top{align-items:center;justify-content:space-between}.kit-pnl-brand{font-size:13px;font-weight:950;letter-spacing:2.4px;color:#25d6d0}.kit-pnl-card.loss .kit-pnl-brand{color:#ff5266}
    .kit-pnl-side{font-size:9px;font-weight:900;letter-spacing:.12em;padding:5px 8px;border-radius:999px;color:#25d6d0;background:rgba(37,214,208,.11)}.kit-pnl-side.loss{color:#ff5266;background:rgba(255,82,102,.11)}
    .kit-pnl-user{align-items:center;gap:10px;margin-top:24px}.kit-pnl-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#111c25;border:1px solid #25d6d0;color:#eef3f9;font-size:15px;font-weight:900;flex:0 0 auto}.kit-pnl-avatar img{width:100%;height:100%;object-fit:cover}.kit-pnl-user b{display:block;font-size:13px}.kit-pnl-user small{display:block;margin-top:3px;color:#66768a;font-size:9px}
    .kit-pnl-result{position:relative;z-index:1;margin-top:25px;font-size:48px;line-height:1;font-weight:950;letter-spacing:-2px}.kit-pnl-result.profit{color:#25d6d0}.kit-pnl-result.loss{color:#ff5266}.kit-pnl-label{position:relative;z-index:1;margin-top:8px;color:#66768a;font-size:8px;letter-spacing:.12em;font-weight:800}
    .kit-pnl-grid{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:18px}.kit-pnl-grid>div{background:#0b1119;border:1px solid #192331;border-radius:9px;padding:9px}.kit-pnl-grid small{display:block;color:#66768a;font-size:7px;letter-spacing:.08em;margin-bottom:4px}.kit-pnl-grid b{font-size:10px;font-variant-numeric:tabular-nums}.kit-pnl-footer{position:absolute;z-index:1;left:20px;right:20px;bottom:18px;color:#66768a;font-size:8px;letter-spacing:.03em}
    @media(max-width:420px){.pnl-share-dialog{width:calc(100vw - 20px)!important}.kit-pnl-card{padding:17px}.kit-pnl-result{font-size:40px}.kit-pnl-user{margin-top:18px}.kit-pnl-footer{left:17px;right:17px;bottom:15px}}
  `;
  document.head.appendChild(style);
}

function normalizeDialog(dialog) {
  if (!dialog || dialog.dataset.kitPnlNormalized === '1') return;
  const data = parsePosition(dialog);
  if (!data) return;
  const card = q(dialog, '.pnl-share-card');
  if (!card) return;
  dialog.dataset.kitPnlNormalized = '1';
  card.innerHTML = cardHtml(data);
  const avatarHost = q(card, '.kit-pnl-avatar');
  if (avatarHost && data.avatarUrl) {
    const img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.src = data.avatarUrl;
    img.onload = () => avatarHost.replaceChildren(img);
  }
  [...dialog.querySelectorAll('.pnl-share-card ~ .pnl-share-card')].forEach((el) => el.remove());
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
  });
}

async function renderPng(data) {
  const W = 800, H = 1000;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const accent = data.positive ? '#25d6d0' : '#ff5266';
  const bg = ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#0d141d'); bg.addColorStop(1,'#080b10'); ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  const glow = ctx.createRadialGradient(620,130,10,620,130,330); glow.addColorStop(0,accent+'38'); glow.addColorStop(1,accent+'00'); ctx.fillStyle=glow; ctx.fillRect(0,0,W,500);
  const round=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
  round(20,20,W-40,H-40,28); ctx.strokeStyle='#263141'; ctx.lineWidth=2; ctx.stroke();
  const font=(size,weight='400')=>{ctx.font=`${weight} ${size}px Inter Tight,Inter,Arial,sans-serif`};
  font(20,'900');ctx.fillStyle=accent;ctx.fillText('KITSETUPS',52,72);
  round(660,45,88,32,16);ctx.fillStyle=accent+'18';ctx.fill();font(12,'900');ctx.fillStyle=accent;ctx.textAlign='center';ctx.fillText(data.side,704,66);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(76,128,24,0,Math.PI*2);ctx.fillStyle='#111c25';ctx.fill();ctx.strokeStyle=accent;ctx.stroke();
  const img=await loadImage(data.avatarUrl);if(img){ctx.save();ctx.beginPath();ctx.arc(76,128,22,0,Math.PI*2);ctx.clip();ctx.drawImage(img,54,106,44,44);ctx.restore()}else{font(16,'900');ctx.fillStyle='#eef3f9';ctx.textAlign='center';ctx.fillText(data.name.slice(0,1).toUpperCase(),76,134);ctx.textAlign='left'}
  font(15,'800');ctx.fillStyle='#eef3f9';ctx.fillText(data.name,116,126);font(11,'600');ctx.fillStyle='#66768a';ctx.fillText(data.pair,116,146);
  font(70,'950');ctx.fillStyle=accent;ctx.fillText(`${data.positive?'+':''}${fmt(data.percent,2)}%`,52,260);font(11,'800');ctx.fillStyle='#66768a';ctx.fillText('POSITION PERFORMANCE',52,286);
  const cells=[['ENTRY',data.entry?fmt(data.entry):'—'],['MARK',data.mark?fmt(data.mark):'—'],['LEVERAGE',data.leverage?`${fmt(data.leverage,0)}x`:'—'],['POSITION',data.side]];
  cells.forEach((c,i)=>{const x=i%2?408:52,y=330+Math.floor(i/2)*118;round(x,y,340,94,14);ctx.fillStyle='#0b1119';ctx.fill();ctx.strokeStyle='#192331';ctx.stroke();font(10,'700');ctx.fillStyle='#66768a';ctx.fillText(c[0],x+18,y+27);font(17,'800');ctx.fillStyle='#eef3f9';ctx.fillText(c[1],x+18,y+58)});
  font(10,'600');ctx.fillStyle='#66768a';ctx.fillText('KitSetups Futures · kitsetups.xyz',52,944);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png',1)); if(!blob) throw new Error('Could not render PNG');
  return {file:new File([blob],`kitsetups-pnl-${Date.now()}.png`,{type:'image/png'}),url:URL.createObjectURL(blob)};
}

async function handle(button, share){
  const dialog=button.closest('.pnl-share-dialog'); if(!dialog)return;
  normalizeDialog(dialog);
  const card=q(dialog,'.pnl-share-card'); if(!card)return;
  const data={name:textOf(q(card,'.kit-pnl-user b')),pair:textOf(q(card,'.kit-pnl-user small')),side:textOf(q(card,'.kit-pnl-side')),percent:num(textOf(q(card,'.kit-pnl-result'))),positive:q(card,'.kit-pnl-result')?.classList.contains('profit'),entry:num(textOf(q(card,'.kit-pnl-grid>div:nth-child(1) b'))),mark:num(textOf(q(card,'.kit-pnl-grid>div:nth-child(2) b'))),leverage:num(textOf(q(card,'.kit-pnl-grid>div:nth-child(3) b'))),avatarUrl:q(card,'.kit-pnl-avatar img')?.src||''};
  button.disabled=true;
  try{const out=await renderPng(data);if(share&&navigator.share&&navigator.canShare?.({files:[out.file]})){await navigator.share({files:[out.file],title:'KitSetups Futures PnL'})}else{const a=document.createElement('a');a.href=out.url;a.download=out.file.name;document.body.appendChild(a);a.click();a.remove();if(share&&navigator.share){try{await navigator.share({title:'KitSetups Futures PnL',text:`${data.name} · ${data.pair} · ${data.positive?'+':''}${fmt(data.percent,2)}%`})}catch(_){}}}setTimeout(()=>URL.revokeObjectURL(out.url),1500)}catch(e){console.error('[KitSetups PnL]',e)}finally{button.disabled=false}
}

injectStyle();
const observer=new MutationObserver(()=>{document.querySelectorAll('.pnl-share-dialog').forEach(normalizeDialog)});observer.observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',(event)=>{const button=event.target.closest('.pnl-share-actions button');if(!button)return;const action=textOf(button).toLowerCase();if(!action.includes('share')&&!action.includes('download'))return;event.preventDefault();event.stopImmediatePropagation();handle(button,action.includes('share'))},true);
