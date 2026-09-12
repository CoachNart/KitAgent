const $ = (root, selector) => root?.querySelector(selector);
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const num = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (value, digits = 6) => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';

function parseCard(dialog) {
  const card = $(dialog, '.pnl-share-card');
  if (!card) return null;
  const meta = {};
  card.querySelectorAll('.pnl-meta p').forEach((row) => {
    const text = clean(row.textContent);
    const match = text.match(/^(Entry|Mark|Size|Leverage|Liquidation|Margin)\s*([0-9.,+-]+)?/i);
    if (match) meta[match[1].toLowerCase()] = match[2] || '';
  });
  const strongText = clean($(card, 'strong')?.textContent);
  const raw = clean(card.textContent);
  const entry = num(meta.entry || (raw.match(/Entry\s*([0-9,.]+)/i) || [])[1]);
  const mark = num(meta.mark || (raw.match(/Mark\s*([0-9,.]+)/i) || [])[1]);
  const leverage = num(meta.leverage || (raw.match(/Leverage\s*([0-9,.]+)x/i) || [])[1]);
  const margin = num(meta.margin || (raw.match(/Margin\s*([0-9,.]+)/i) || [])[1]);
  const pnlValue = num(strongText);
  const negativeText = /-/.test(strongText) || /negative-text/.test($(card, 'strong')?.className || '');
  const side = /short/i.test(raw) ? 'SHORT' : 'LONG';
  let percent = 0;
  if (entry && mark && leverage) {
    const direction = side === 'LONG' ? 1 : -1;
    percent = ((mark - entry) / entry) * leverage * 100 * direction;
  } else if (margin) {
    percent = (pnlValue / margin) * 100;
  }
  if (!percent && negativeText) percent = -Math.abs(pnlValue);
  if (!percent && !negativeText) percent = Math.abs(pnlValue);
  const avatarImg = $(card, '.pnl-card-avatar img');
  return {
    name: clean($(card, '.pnl-card-brand b')?.textContent) || 'KitSetups Trader',
    pair: clean($(card, 'h3')?.textContent) || 'Futures Position',
    side, entry, mark, leverage, margin, percent,
    positive: !negativeText && percent >= 0,
    avatarUrl: avatarImg?.currentSrc || avatarImg?.src || ''
  };
}

function cardMarkup(data) {
  const tone = data.positive ? 'profit' : 'loss';
  const sign = data.percent >= 0 ? '+' : '';
  return `<div class="kit-pnl-card ${tone}">
    <div class="kit-pnl-top"><div class="kit-pnl-brand">KITSETUPS</div><div class="kit-pnl-side ${tone}">${data.side}</div></div>
    <div class="kit-pnl-user"><div class="kit-pnl-avatar"><span>${clean(data.name).slice(0,1).toUpperCase()}</span></div><div><b>${clean(data.name)}</b><small>${clean(data.pair)}</small></div></div>
    <div class="kit-pnl-visual ${tone}"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="kit-pnl-result ${tone}">${sign}${fmt(data.percent, 2)}%</div>
    <div class="kit-pnl-label">POSITION PERFORMANCE</div>
    <div class="kit-pnl-grid">
      <div><small>ENTRY</small><b>${data.entry ? fmt(data.entry) : '—'}</b></div>
      <div><small>MARK</small><b>${data.mark ? fmt(data.mark) : '—'}</b></div>
      <div><small>LEVERAGE</small><b>${data.leverage ? `${fmt(data.leverage, 0)}x` : '—'}</b></div>
      <div><small>DIRECTION</small><b>${data.side}</b></div>
    </div>
    <div class="kit-pnl-mood" aria-hidden="true">
      <div class="kit-pnl-face"><span></span><span></span><b></b></div>
      <div class="kit-pnl-rocket"><i></i><b></b><em></em><span></span></div>
    </div>
    <div class="kit-pnl-footer"><span>● LIVE POSITION</span><b>KitSetups</b></div>
  </div>`;
}

function injectStyle() {
  if (document.getElementById('kit-pnl-runtime-v2-style')) return;
  const style = document.createElement('style');
  style.id = 'kit-pnl-runtime-v2-style';
  style.textContent = `
    .pnl-share-dialog{width:min(410px,calc(100vw - 18px))!important;padding:8px!important;overflow:hidden!important}
    .pnl-share-dialog .pnl-share-card{padding:0!important;border:0!important;background:none!important;box-shadow:none!important;aspect-ratio:auto!important}
    .kit-pnl-card{width:100%;aspect-ratio:8/9;position:relative;overflow:hidden;box-sizing:border-box;padding:18px;border-radius:18px;background:radial-gradient(circle at 85% 12%,rgba(37,214,208,.18),transparent 32%),linear-gradient(145deg,#101b24 0%,#080d13 68%,#06090e 100%);border:1px solid rgba(37,214,208,.34);font-family:Inter Tight,Inter,system-ui,sans-serif;color:#e7edf7;isolation:isolate}
    .kit-pnl-card.loss{background:radial-gradient(circle at 85% 12%,rgba(255,82,102,.20),transparent 32%),linear-gradient(145deg,#24141b 0%,#0d0a0e 68%,#07090d 100%);border-color:rgba(255,82,102,.40)}
    .kit-pnl-card:before{content:"";position:absolute;left:-18%;right:-18%;bottom:-38%;height:72%;border-radius:50%;background:radial-gradient(ellipse,rgba(37,214,208,.12),transparent 64%);z-index:0;pointer-events:none}.kit-pnl-card.loss:before{background:radial-gradient(ellipse,rgba(255,82,102,.14),transparent 64%)}
    .kit-pnl-top,.kit-pnl-user,.kit-pnl-result,.kit-pnl-label,.kit-pnl-grid,.kit-pnl-footer{position:relative;z-index:4}.kit-pnl-top{display:flex;align-items:center;justify-content:space-between}.kit-pnl-brand{font-size:12px;font-weight:950;letter-spacing:2.5px;color:#25d6d0}.kit-pnl-card.loss .kit-pnl-brand{color:#ff5266}.kit-pnl-side{font-size:8px;font-weight:900;letter-spacing:.12em;padding:5px 8px;border-radius:999px;color:#25d6d0;background:rgba(37,214,208,.11);border:1px solid rgba(37,214,208,.22)}.kit-pnl-side.loss{color:#ff5266;background:rgba(255,82,102,.11);border-color:rgba(255,82,102,.24)}
    .kit-pnl-user{display:flex;align-items:center;gap:9px;margin-top:15px}.kit-pnl-avatar{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;overflow:hidden;background:#111c25;border:1px solid #25d6d0;color:#eef3f9;font-size:14px;font-weight:900}.kit-pnl-card.loss .kit-pnl-avatar{border-color:#ff5266}.kit-pnl-avatar img{width:100%;height:100%;object-fit:cover}.kit-pnl-user b{display:block;font-size:12px}.kit-pnl-user small{display:block;margin-top:2px;color:#708191;font-size:8px}
    .kit-pnl-visual{position:relative;height:76px;margin:13px -18px 0;overflow:hidden;background:repeating-linear-gradient(90deg,transparent 0,transparent 39px,rgba(255,255,255,.035) 40px),repeating-linear-gradient(0deg,transparent 0,transparent 24px,rgba(255,255,255,.035) 25px);opacity:.96;z-index:3}.kit-pnl-visual:before{content:"";position:absolute;left:-5%;right:-5%;top:42px;height:2px;background:linear-gradient(90deg,transparent,#25d6d0 38%,#25d6d0 62%,transparent);box-shadow:0 0 14px rgba(37,214,208,.55);transform:rotate(-8deg)}.kit-pnl-visual.loss:before{background:linear-gradient(90deg,transparent,#ff5266 38%,#ff5266 62%,transparent);box-shadow:0 0 14px rgba(255,82,102,.55);transform:rotate(8deg)}
    .kit-pnl-visual i{position:absolute;bottom:17px;width:3px;border-radius:3px;background:#25d6d0;box-shadow:0 0 8px rgba(37,214,208,.45)}.kit-pnl-visual.loss i{background:#ff5266;box-shadow:0 0 8px rgba(255,82,102,.45)}.kit-pnl-visual i:nth-child(1){left:10%;height:20px}.kit-pnl-visual i:nth-child(2){left:22%;height:36px}.kit-pnl-visual i:nth-child(3){left:35%;height:27px}.kit-pnl-visual i:nth-child(4){left:47%;height:49px}.kit-pnl-visual i:nth-child(5){left:58%;height:37px}.kit-pnl-visual i:nth-child(6){left:69%;height:58px}.kit-pnl-visual i:nth-child(7){left:80%;height:47px}.kit-pnl-visual i:nth-child(8){left:91%;height:64px}
    .kit-pnl-result{margin-top:2px;font-size:43px;line-height:1;font-weight:950;letter-spacing:-1.8px;font-variant-numeric:tabular-nums}.kit-pnl-result.profit{color:#25d6d0}.kit-pnl-result.loss{color:#ff5266}.kit-pnl-label{margin-top:5px;color:#71818f;font-size:7px;letter-spacing:.13em;font-weight:800}.kit-pnl-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.kit-pnl-grid>div{background:rgba(10,17,24,.82);border:1px solid rgba(38,49,65,.9);border-radius:8px;padding:8px}.kit-pnl-grid small{display:block;color:#66788a;font-size:7px;letter-spacing:.08em;margin-bottom:3px}.kit-pnl-grid b{font-size:10px;font-variant-numeric:tabular-nums}
    .kit-pnl-mood{position:absolute;z-index:1;left:24%;right:-7%;top:53%;bottom:-14%;pointer-events:none;overflow:visible;opacity:.42}.kit-pnl-face{position:absolute;right:16%;bottom:-18%;width:min(260px,62vw);height:min(260px,62vw);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.18),rgba(37,214,208,.22) 34%,rgba(37,214,208,.08) 70%,transparent 72%);border:3px solid rgba(37,214,208,.46);box-shadow:0 0 50px rgba(37,214,208,.18),inset 0 0 45px rgba(37,214,208,.10);transform:rotate(-7deg)}.kit-pnl-card.loss .kit-pnl-face{background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.16),rgba(255,82,102,.28) 34%,rgba(255,82,102,.08) 70%,transparent 72%);border-color:rgba(255,82,102,.55);box-shadow:0 0 50px rgba(255,82,102,.20),inset 0 0 45px rgba(255,82,102,.12);transform:rotate(7deg)}
    .kit-pnl-face span{position:absolute;top:31%;width:13%;height:13%;border-radius:50%;background:currentColor;color:#25d6d0;box-shadow:0 0 12px currentColor}.kit-pnl-face span:first-child{left:28%}.kit-pnl-face span:nth-child(2){right:28%}.kit-pnl-card.loss .kit-pnl-face span{color:#ff5266}.kit-pnl-face b{position:absolute;left:31%;right:31%;bottom:28%;height:18%;border-bottom:7px solid #25d6d0;border-radius:0 0 60% 60%;display:block}.kit-pnl-card.loss .kit-pnl-face b{border-bottom:0;border-top:7px solid #ff5266;border-radius:60% 60% 0 0;bottom:29%}
    .kit-pnl-rocket{position:absolute;right:1%;bottom:13%;width:132px;height:190px;transform:rotate(-43deg);filter:drop-shadow(0 0 22px rgba(37,214,208,.34))}.kit-pnl-card.loss .kit-pnl-rocket{transform:rotate(137deg);filter:drop-shadow(0 0 22px rgba(255,82,102,.34))}.kit-pnl-rocket:before{content:"";position:absolute;left:37px;top:15px;width:58px;height:126px;border-radius:50% 50% 42% 42%;background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(37,214,208,.68) 45%,rgba(10,75,82,.8));border:2px solid rgba(255,255,255,.24)}.kit-pnl-card.loss .kit-pnl-rocket:before{background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,82,102,.72) 45%,rgba(82,18,30,.86))}.kit-pnl-rocket:after{content:"";position:absolute;left:51px;top:3px;border-left:15px solid transparent;border-right:15px solid transparent;border-bottom:25px solid #25d6d0}.kit-pnl-card.loss .kit-pnl-rocket:after{border-bottom-color:#ff5266}.kit-pnl-rocket i,.kit-pnl-rocket b{position:absolute;top:104px;width:38px;height:47px;background:#25d6d0;border-radius:5px 5px 24px 24px}.kit-pnl-rocket i{left:11px;transform:skew(-20deg)}.kit-pnl-rocket b{right:11px;transform:skew(20deg)}.kit-pnl-card.loss .kit-pnl-rocket i,.kit-pnl-card.loss .kit-pnl-rocket b{background:#ff5266}.kit-pnl-rocket em{position:absolute;left:51px;bottom:0;width:28px;height:62px;border-radius:50% 50% 55% 55%;background:linear-gradient(#fff4c2,#25d6d0 42%,transparent);filter:blur(1px);transform:scaleX(.72)}.kit-pnl-card.loss .kit-pnl-rocket em{background:linear-gradient(#fff0f2,#ff5266 42%,transparent)}.kit-pnl-rocket span{position:absolute;left:58px;top:55px;width:16px;height:16px;border-radius:50%;background:rgba(4,12,17,.7);border:2px solid rgba(255,255,255,.35)}
    .kit-pnl-footer{position:absolute;left:18px;right:18px;bottom:13px;display:flex;align-items:center;justify-content:space-between;color:#5f7280;font-size:7px;letter-spacing:.06em}.kit-pnl-footer span{color:#25d6d0}.kit-pnl-card.loss .kit-pnl-footer span{color:#ff5266}.kit-pnl-footer b{color:#9babb5;font-size:8px;letter-spacing:.12em}
    @media(max-width:420px){.pnl-share-dialog{width:calc(100vw - 10px)!important}.kit-pnl-card{padding:14px;border-radius:16px}.kit-pnl-user{margin-top:11px}.kit-pnl-visual{margin-left:-14px;margin-right:-14px;height:65px}.kit-pnl-result{font-size:36px}.kit-pnl-grid{gap:5px;margin-top:8px}.kit-pnl-grid>div{padding:7px}.kit-pnl-mood{left:14%;right:-10%;top:51%;bottom:-11%}.kit-pnl-face{width:190px;height:190px}.kit-pnl-rocket{width:102px;height:150px;transform:scale(.82) rotate(-43deg);right:-2%;bottom:10%}.kit-pnl-card.loss .kit-pnl-rocket{transform:scale(.82) rotate(137deg)}.kit-pnl-footer{left:14px;right:14px;bottom:10px}}
  `;
  document.head.appendChild(style);
}

function normalizeDialog(dialog) {
  if (!dialog || dialog.dataset.kitPnlV2 === '1') return;
  const data = parseCard(dialog);
  if (!data) return;
  const card = $(dialog, '.pnl-share-card');
  if (!card) return;
  card.innerHTML = cardMarkup(data);
  dialog.dataset.kitPnlV2 = '1';
  const avatarHost = $(card, '.kit-pnl-avatar');
  if (avatarHost && data.avatarUrl) {
    const img = document.createElement('img'); img.alt=''; img.referrerPolicy='no-referrer'; img.src=data.avatarUrl;
    img.onload=()=>avatarHost.replaceChildren(img);
  }
}

function drawRound(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function drawFace(ctx,x,y,r,positive,alpha=1){
  const accent=positive?'#25d6d0':'#ff5266';
  ctx.save();ctx.globalAlpha=alpha;
  const g=ctx.createRadialGradient(x-r*.35,y-r*.38,r*.08,x,y,r);g.addColorStop(0,'#ffffff35');g.addColorStop(.35,accent+'55');g.addColorStop(1,accent+'08');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=accent+'99';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x-r*.32,y-r*.18,r*.09,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+r*.32,y-r*.18,r*.09,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=accent;ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath(); if(positive){ctx.arc(x,y+r*.06,r*.32,.18*Math.PI,.82*Math.PI)}else{ctx.arc(x,y+r*.31,r*.32,1.18*Math.PI,1.82*Math.PI)} ctx.stroke();ctx.restore();
}
function drawRocket(ctx,x,y,scale,positive,alpha=.82){
  const accent=positive?'#25d6d0':'#ff5266';
  ctx.save();ctx.translate(x,y);ctx.rotate(positive?-Math.PI/4:3*Math.PI/4);ctx.scale(scale,scale);ctx.globalAlpha=alpha;
  ctx.shadowColor=accent;ctx.shadowBlur=25;ctx.fillStyle=accent;ctx.beginPath();ctx.ellipse(0,-48,27,65,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#ffffff30';ctx.beginPath();ctx.arc(0,-55,8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff66';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(0,-83);ctx.lineTo(-13,-59);ctx.lineTo(13,-59);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(-45,27);ctx.lineTo(-17,23);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(45,27);ctx.lineTo(17,23);ctx.closePath();ctx.fill();
  const flame=ctx.createLinearGradient(0,16,0,82);flame.addColorStop(0,'#fff3c4');flame.addColorStop(.35,accent);flame.addColorStop(1,accent+'00');ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(-14,10);ctx.quadraticCurveTo(0,28,0,78);ctx.quadraticCurveTo(0,28,14,10);ctx.closePath();ctx.fill();ctx.restore();
}
function drawChart(ctx,data,x,y,w,h){
  ctx.save();ctx.globalAlpha=.32;ctx.strokeStyle='#78909c';ctx.lineWidth=1;
  for(let gx=x;gx<=x+w;gx+=52){ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx,y+h);ctx.stroke()}
  for(let gy=y;gy<=y+h;gy+=28){ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x+w,gy);ctx.stroke()}
  const accent=data.positive?'#25d6d0':'#ff5266';const points=data.positive?[h*.72,h*.61,h*.68,h*.48,h*.54,h*.31,h*.42,h*.2]:[h*.22,h*.34,h*.28,h*.48,h*.39,h*.58,h*.48,h*.75];
  ctx.globalAlpha=1;ctx.beginPath();points.forEach((v,i)=>{const px=x+(i/(points.length-1))*w,py=y+v;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)});ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.shadowColor=accent;ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;points.forEach((v,i)=>{const px=x+(i/(points.length-1))*w,py=y+v;ctx.fillStyle=accent;ctx.fillRect(px-2,py-7,4,14)});ctx.restore();
}
async function imageFor(data){
  const W=800,H=900,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');const accent=data.positive?'#25d6d0':'#ff5266';
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,data.positive?'#101b24':'#24141b');bg.addColorStop(1,'#070a0f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(650,120,10,650,120,330);glow.addColorStop(0,accent+'44');glow.addColorStop(1,accent+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,500);
  drawRound(ctx,18,18,W-36,H-36,28);ctx.strokeStyle=accent+'55';ctx.lineWidth=2;ctx.stroke();
  const font=(size,weight='400')=>{ctx.font=`${weight} ${size}px Inter Tight,Inter,Arial,sans-serif`};
  font(20,'900');ctx.fillStyle=accent;ctx.fillText('KITSETUPS',50,67);drawRound(ctx,662,41,86,31,16);ctx.fillStyle=accent+'20';ctx.fill();font(12,'900');ctx.fillStyle=accent;ctx.textAlign='center';ctx.fillText(data.side,705,62);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(74,118,22,0,Math.PI*2);ctx.fillStyle='#111c25';ctx.fill();ctx.strokeStyle=accent;ctx.stroke();font(14,'900');ctx.fillStyle='#eef3f9';ctx.textAlign='center';ctx.fillText(clean(data.name).slice(0,1).toUpperCase(),74,123);ctx.textAlign='left';font(15,'900');ctx.fillText(clean(data.name),110,116);font(9,'500');ctx.fillStyle='#708191';ctx.fillText(clean(data.pair),110,136);
  drawChart(ctx,data,50,157,700,72);
  drawFace(ctx,600,625,175,data.positive,.52);drawRocket(ctx,690,560,1.02,data.positive,.62);
  font(54,'950');ctx.fillStyle=accent;ctx.fillText(`${data.percent>=0?'+':''}${fmt(data.percent,2)}%`,50,315);font(9,'800');ctx.fillStyle='#71818f';ctx.fillText('POSITION PERFORMANCE',50,334);
  const cells=[['ENTRY',data.entry?fmt(data.entry):'—'],['MARK',data.mark?fmt(data.mark):'—'],['LEVERAGE',data.leverage?`${fmt(data.leverage,0)}x`:'—'],['DIRECTION',data.side]];cells.forEach((c,i)=>{const cx=50+(i%2)*355,cy=356+Math.floor(i/2)*76;drawRound(ctx,cx,cy,335,64,10);ctx.fillStyle='#0a1118dd';ctx.fill();ctx.strokeStyle='#263141';ctx.stroke();font(8,'500');ctx.fillStyle='#66788a';ctx.fillText(c[0],cx+14,cy+20);font(13,'800');ctx.fillStyle='#e7edf7';ctx.fillText(c[1],cx+14,cy+43)});
  font(8,'800');ctx.fillStyle=accent;ctx.fillText('● LIVE POSITION',50,850);ctx.fillStyle='#9babb5';ctx.textAlign='right';ctx.fillText('KITSETUPS',750,850);ctx.textAlign='left';
  return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob),'image/png',.94));
}

async function handleAction(button, dialog, downloadOnly){
  const data=parseCard(dialog);if(!data)return;
  const blob=await imageFor(data);if(!blob)return;
  const file=new File([blob],`kitsetups-${data.side.toLowerCase()}-${data.positive?'profit':'loss'}-pnl.png`,{type:'image/png'});
  if(!downloadOnly && navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{await navigator.share({title:'KitSetups Futures PnL',text:`${data.pair} · ${data.side} · ${data.percent>=0?'+':''}${fmt(data.percent,2)}%`,files:[file]});return}catch(error){if(error?.name==='AbortError')return}
  }
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function observe(){
  const observer=new MutationObserver(()=>{document.querySelectorAll('.mexc-modal .pnl-share-dialog').forEach(normalizeDialog)});observer.observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.mexc-modal .pnl-share-dialog').forEach(normalizeDialog);
  document.addEventListener('click',async(event)=>{
    const button=event.target.closest('.pnl-share-actions button');if(!button)return;
    const dialog=button.closest('.pnl-share-dialog');if(!dialog)return;
    const label=clean(button.textContent).toLowerCase();if(label!=='share'&&label!=='download')return;
    event.preventDefault();event.stopImmediatePropagation();
    button.disabled=true;try{await handleAction(button,dialog,label==='download')}catch(error){console.error('[KitSetups PnL]',error)}finally{button.disabled=false}
  },true);
}

injectStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
