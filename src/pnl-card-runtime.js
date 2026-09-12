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
  return `<div class="kit-pnl-card ${tone}">
    <div class="kit-pnl-top"><div class="kit-pnl-brand">KITSETUPS</div><div class="kit-pnl-side ${tone}">${data.side}</div></div>
    <div class="kit-pnl-user"><div class="kit-pnl-avatar"><span>${clean(data.name).slice(0,1).toUpperCase()}</span></div><div><b>${clean(data.name)}</b><small>${clean(data.pair)}</small></div></div>
    <div class="kit-pnl-visual ${tone}"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="kit-pnl-result ${tone}">${data.positive ? '+' : ''}${fmt(data.percent, 2)}%</div>
    <div class="kit-pnl-label">POSITION PERFORMANCE</div>
    <div class="kit-pnl-grid">
      <div><small>ENTRY</small><b>${data.entry ? fmt(data.entry) : '—'}</b></div>
      <div><small>MARK</small><b>${data.mark ? fmt(data.mark) : '—'}</b></div>
      <div><small>LEVERAGE</small><b>${data.leverage ? `${fmt(data.leverage, 0)}x` : '—'}</b></div>
      <div><small>DIRECTION</small><b>${data.side}</b></div>
    </div>
    <div class="kit-pnl-footer"><span>● LIVE POSITION</span><b>KitSetups</b></div>
  </div>`;
}

function injectStyle() {
  if (document.getElementById('kit-pnl-runtime-style')) return;
  const style = document.createElement('style');
  style.id = 'kit-pnl-runtime-style';
  style.textContent = `
    .pnl-share-dialog{width:min(410px,calc(100vw - 20px))!important;padding:9px!important;overflow:hidden!important}
    .pnl-share-dialog svg{display:none!important}
    .pnl-share-dialog .pnl-share-card{padding:0!important;border:0!important;background:none!important;box-shadow:none!important}
    .kit-pnl-card{width:100%;aspect-ratio:8/9;border-radius:18px;padding:18px;box-sizing:border-box;position:relative;overflow:hidden;background:radial-gradient(circle at 85% 18%,rgba(37,214,208,.15),transparent 34%),linear-gradient(145deg,#101b24 0%,#080c12 72%);border:1px solid #263d46;font-family:Inter Tight,Inter,system-ui,sans-serif;color:#e7edf7}
    .kit-pnl-card.loss{background:radial-gradient(circle at 85% 18%,rgba(255,82,102,.16),transparent 34%),linear-gradient(145deg,#21131a 0%,#080c12 72%);border-color:#51303a}
    .kit-pnl-card:after{content:"";position:absolute;left:-30%;bottom:-38%;width:150%;height:70%;background:radial-gradient(ellipse,rgba(37,214,208,.09),transparent 62%);transform:rotate(-8deg);pointer-events:none}.kit-pnl-card.loss:after{background:radial-gradient(ellipse,rgba(255,82,102,.10),transparent 62%)}
    .kit-pnl-top,.kit-pnl-user,.kit-pnl-result,.kit-pnl-label,.kit-pnl-grid,.kit-pnl-footer{position:relative;z-index:2}.kit-pnl-top,.kit-pnl-user{display:flex}.kit-pnl-top{align-items:center;justify-content:space-between}.kit-pnl-brand{font-size:12px;font-weight:950;letter-spacing:2.5px;color:#25d6d0}.kit-pnl-card.loss .kit-pnl-brand{color:#ff5266}
    .kit-pnl-side{font-size:8px;font-weight:900;letter-spacing:.12em;padding:5px 8px;border-radius:999px;color:#25d6d0;background:rgba(37,214,208,.11);border:1px solid rgba(37,214,208,.18)}.kit-pnl-side.loss{color:#ff5266;background:rgba(255,82,102,.11);border-color:rgba(255,82,102,.2)}
    .kit-pnl-user{align-items:center;gap:9px;margin-top:15px}.kit-pnl-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#111c25;border:1px solid #25d6d0;color:#eef3f9;font-size:14px;font-weight:900;flex:0 0 auto}.kit-pnl-card.loss .kit-pnl-avatar{border-color:#ff5266}.kit-pnl-avatar img{width:100%;height:100%;object-fit:cover}.kit-pnl-user b{display:block;font-size:12px}.kit-pnl-user small{display:block;margin-top:2px;color:#708191;font-size:8px}
    .kit-pnl-visual{height:76px;margin:13px -18px 0;position:relative;overflow:hidden;opacity:.95;background:repeating-linear-gradient(90deg,transparent 0,transparent 39px,rgba(255,255,255,.035) 40px),repeating-linear-gradient(0deg,transparent 0,transparent 24px,rgba(255,255,255,.035) 25px)}
    .kit-pnl-visual:before{content:"";position:absolute;left:-5%;right:-5%;top:42px;height:2px;background:linear-gradient(90deg,transparent 0%,rgba(37,214,208,.1) 10%,#25d6d0 38%,#25d6d0 61%,rgba(37,214,208,.22) 82%,transparent);transform:rotate(-9deg);box-shadow:0 0 14px rgba(37,214,208,.5)}.kit-pnl-visual.loss:before{background:linear-gradient(90deg,transparent 0%,rgba(255,82,102,.1) 10%,#ff5266 38%,#ff5266 61%,rgba(255,82,102,.22) 82%,transparent);transform:rotate(9deg);box-shadow:0 0 14px rgba(255,82,102,.5)}
    .kit-pnl-visual span{position:absolute;bottom:17px;width:3px;border-radius:3px;background:#25d6d0;box-shadow:0 0 8px rgba(37,214,208,.45)}.kit-pnl-visual.loss span{background:#ff5266;box-shadow:0 0 8px rgba(255,82,102,.45)}.kit-pnl-visual span:nth-child(1){left:10%;height:20px}.kit-pnl-visual span:nth-child(2){left:22%;height:36px}.kit-pnl-visual span:nth-child(3){left:35%;height:27px}.kit-pnl-visual span:nth-child(4){left:47%;height:49px}.kit-pnl-visual span:nth-child(5){left:58%;height:37px}.kit-pnl-visual span:nth-child(6){left:69%;height:58px}.kit-pnl-visual span:nth-child(7){left:80%;height:47px}.kit-pnl-visual span:nth-child(8){left:91%;height:64px}
    .kit-pnl-result{margin-top:2px;font-size:43px;line-height:1;font-weight:950;letter-spacing:-1.8px}.kit-pnl-result.profit{color:#25d6d0}.kit-pnl-result.loss{color:#ff5266}.kit-pnl-label{margin-top:5px;color:#71818f;font-size:7px;letter-spacing:.13em;font-weight:800}
    .kit-pnl-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.kit-pnl-grid>div{background:rgba(10,17,24,.78);border:1px solid rgba(38,49,65,.9);border-radius:8px;padding:8px}.kit-pnl-grid small{display:block;color:#66788a;font-size:7px;letter-spacing:.08em;margin-bottom:3px}.kit-pnl-grid b{font-size:10px;font-variant-numeric:tabular-nums}
    .kit-pnl-footer{position:absolute;left:18px;right:18px;bottom:13px;display:flex;justify-content:space-between;align-items:center;color:#5f7280;font-size:7px;letter-spacing:.06em}.kit-pnl-footer span{color:#25d6d0}.kit-pnl-card.loss .kit-pnl-footer span{color:#ff5266}.kit-pnl-footer b{color:#9babb5;font-size:8px;letter-spacing:.12em}
    @media(max-width:420px){.pnl-share-dialog{width:calc(100vw - 14px)!important}.kit-pnl-card{padding:15px;border-radius:16px}.kit-pnl-visual{margin-left:-15px;margin-right:-15px;height:68px}.kit-pnl-result{font-size:36px}.kit-pnl-user{margin-top:12px}.kit-pnl-grid{gap:5px;margin-top:8px}.kit-pnl-grid>div{padding:7px}.kit-pnl-footer{left:15px;right:15px;bottom:11px}}
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

function drawTradeVisual(ctx, data, x, y, w, h, accent) {
  ctx.save();
  ctx.globalAlpha = .34;
  ctx.strokeStyle = '#78909c'; ctx.lineWidth = 1;
  for (let gx=x; gx<=x+w; gx+=52) { ctx.beginPath(); ctx.moveTo(gx,y); ctx.lineTo(gx,y+h); ctx.stroke(); }
  for (let gy=y; gy<=y+h; gy+=28) { ctx.beginPath(); ctx.moveTo(x,gy); ctx.lineTo(x+w,gy); ctx.stroke(); }
  ctx.globalAlpha = .95;
  const points = data.positive ? [h*.72,h*.61,h*.68,h*.48,h*.54,h*.31,h*.42,h*.2] : [h*.22,h*.34,h*.28,h*.48,h*.39,h*.58,h*.48,h*.75];
  ctx.beginPath();
  points.forEach((v,i)=>{const px=x+(i/(points.length-1))*w, py=y+v; if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});
  ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.shadowColor=accent;ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;
  points.forEach((v,i)=>{const px=x+(i/(points.length-1))*w,py=y+v;ctx.fillStyle=accent;ctx.fillRect(px-2,py-7,4,14)});
  ctx.restore();
}

async function renderPng(data) {
  const W = 800, H = 900;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const accent = data.positive ? '#25d6d0' : '#ff5266';
  const bg = ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,data.positive?'#101b24':'#21131a'); bg.addColorStop(1,'#080b10'); ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  const glow = ctx.createRadialGradient(650,120,10,650,120,330); glow.addColorStop(0,accent+'42'); glow.addColorStop(1,accent+'00'); ctx.fillStyle=glow; ctx.fillRect(0,0,W,500);
  const round=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
  round(18,18,W-36,H-36,28); ctx.strokeStyle='#263d46'; ctx.lineWidth=2; ctx.stroke();
  const font=(size,weight='400')=>{ctx.font=`${weight} ${size}px Inter Tight,Inter,Arial,sans-serif`};
  font(20,'900');ctx.fillStyle=accent;ctx.fillText('KITSETUPS',50,67);
  round(662,41,86,31,16);ctx.fillStyle=accent+'20';ctx.fill();font(12,'900');ctx.fillStyle=accent;ctx.textAlign='center';ctx.fillText(data.side,705,62);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(74,118,22,0,Math.PI*2);ctx.fillStyle='#111c25';ctx.fill();ctx.strokeStyle=accent;ctx.stroke();
  const img=await loadImage(data.avatarUrl);if(img){ctx.save();ctx.beginPath();ctx.arc(74,118,20,0,Math.PI*2);ctx.clip();ctx.drawImage(img,54,98,40,40);ctx.restore()}else{font(15,'900');ctx.fillStyle='#eef3f9';ctx.textAlign='center';ctx.fillText(data.name.slice(0,1).toUpperCase(),74,123);ctx.textAlign='left'}
  font(15,'800');ctx.fillStyle='#eef3f9';ctx.fillText(data.name,108,116);font(10,'600');ctx.fillStyle='#71818f';ctx.fillText(data.pair,108,135);
  drawTradeVisual(ctx,data,50,160,700,76,accent);
  font(64,'950');ctx.fillStyle=accent;ctx.fillText(`${data.positive?'+':''}${fmt(data.percent,2)}%`,50,285);font(10,'800');ctx.fillStyle='#71818f';ctx.fillText('POSITION PERFORMANCE',50,307);
  const cells=[['ENTRY',data.entry?fmt(data.entry):'—'],['MARK',data.mark?fmt(data.mark):'—'],['LEVERAGE',data.leverage?`${fmt(data.leverage,0)}x`:'—'],['DIRECTION',data.side]];
  cells.forEach((c,i)=>{const x=i%2?408:50,y=335+Math.floor(i/2)*100;round(x,y,342,80,13);ctx.fillStyle='#0b1119';ctx.fill();ctx.strokeStyle='#192b35';ctx.stroke();font(9,'700');ctx.fillStyle='#66788a';ctx.fillText(c[0],x+17,y+24);font(16,'800');ctx.fillStyle='#eef3f9';ctx.fillText(c[1],x+17,y+53)});
  font(9,'700');ctx.fillStyle=accent;ctx.fillText('● LIVE POSITION',50,850);font(10,'900');ctx.fillStyle='#9babb5';ctx.textAlign='right';ctx.fillText('KITSETUPS',750,850);ctx.textAlign='left';
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
