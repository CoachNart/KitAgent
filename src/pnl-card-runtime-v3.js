const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g,'').replace(/[^0-9.+-]/g,'')); return Number.isFinite(n) ? n : 0; };
const fmt = (v,d=2) => Number(v).toLocaleString(undefined,{maximumFractionDigits:d});

function captureOriginal(dialog) {
  const card = dialog.querySelector('.pnl-share-card');
  if (!card || dialog.dataset.kitPnlOriginalCaptured === '1') return;
  const strong = card.querySelector('strong');
  if (!strong) return;
  const raw = clean(card.textContent);
  const value = num(strong.textContent);
  const negative = /-/.test(clean(strong.textContent)) || strong.classList.contains('negative-text');
  const meta = {};
  card.querySelectorAll('.pnl-meta p').forEach((row) => {
    const text = clean(row.textContent);
    const match = text.match(/^(Entry|Mark|Size|Leverage|Liquidation|Margin)\s*([0-9.,+-]+)/i);
    if (match) meta[match[1].toLowerCase()] = match[2];
  });
  dialog.dataset.kitPnlOriginal = JSON.stringify({
    pnl: negative ? -Math.abs(value) : Math.abs(value),
    name: clean(card.querySelector('.pnl-card-brand b')?.textContent) || 'KitSetups Trader',
    pair: clean(card.querySelector('h3')?.textContent) || 'Futures Position',
    side: /short/i.test(raw) ? 'SHORT' : 'LONG',
    entry: num(meta.entry), mark: num(meta.mark), leverage: num(meta.leverage),
  });
  dialog.dataset.kitPnlOriginalCaptured = '1';
}
function original(dialog) { try { return JSON.parse(dialog.dataset.kitPnlOriginal || '{}'); } catch { return {}; } }
function restoreAuthoritativePnl(dialog) {
  const data = original(dialog); if (!Number.isFinite(data.pnl)) return;
  const result = dialog.querySelector('.kit-pnl-result'); if (!result) return;
  result.textContent = `${data.pnl >= 0 ? '+' : ''}${fmt(data.pnl,2)}%`;
  const positive = data.pnl >= 0; result.classList.toggle('profit',positive); result.classList.toggle('loss',!positive);
  const card = result.closest('.kit-pnl-card'); if(card){card.classList.toggle('profit',positive);card.classList.toggle('loss',!positive)}
}
function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function face(ctx,x,y,r,positive){
  const c=positive?'#25d6d0':'#ff5266';ctx.save();ctx.globalAlpha=.5;
  const g=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.05,x,y,r);g.addColorStop(0,'#fff4');g.addColorStop(.35,c+'66');g.addColorStop(1,c+'08');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=c+'aa';ctx.lineWidth=3;ctx.stroke();ctx.globalAlpha=.8;ctx.fillStyle=c;ctx.beginPath();ctx.arc(x-r*.32,y-r*.18,r*.09,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+r*.32,y-r*.18,r*.09,0,Math.PI*2);ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();positive?ctx.arc(x,y+r*.05,r*.32,.18*Math.PI,.82*Math.PI):ctx.arc(x,y+r*.32,r*.32,1.18*Math.PI,1.82*Math.PI);ctx.stroke();ctx.restore();
}
function rocket(ctx,x,y,s,positive){
  const c=positive?'#25d6d0':'#ff5266';ctx.save();ctx.translate(x,y);ctx.rotate(positive?-Math.PI/4:3*Math.PI/4);ctx.scale(s,s);ctx.globalAlpha=.65;ctx.shadowColor=c;ctx.shadowBlur=25;ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,-48,27,65,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff5';ctx.beginPath();ctx.arc(0,-55,8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff7';ctx.stroke();ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(0,-83);ctx.lineTo(-13,-59);ctx.lineTo(13,-59);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-21,0);ctx.lineTo(-45,27);ctx.lineTo(-17,23);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(21,0);ctx.lineTo(45,27);ctx.lineTo(17,23);ctx.closePath();ctx.fill();const flame=ctx.createLinearGradient(0,15,0,82);flame.addColorStop(0,'#fff4c4');flame.addColorStop(.35,c);flame.addColorStop(1,c+'00');ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(-14,10);ctx.quadraticCurveTo(0,30,0,78);ctx.quadraticCurveTo(0,30,14,10);ctx.closePath();ctx.fill();ctx.restore();
}
function chart(ctx,x,y,w,h,positive){const c=positive?'#25d6d0':'#ff5266';ctx.save();ctx.globalAlpha=.28;ctx.strokeStyle='#78909c';for(let gx=x;gx<=x+w;gx+=52){ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx,y+h);ctx.stroke()}for(let gy=y;gy<=y+h;gy+=28){ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x+w,gy);ctx.stroke()}const p=positive?[h*.72,h*.61,h*.68,h*.48,h*.54,h*.31,h*.42,h*.2]:[h*.22,h*.34,h*.28,h*.48,h*.39,h*.58,h*.48,h*.75];ctx.globalAlpha=1;ctx.beginPath();p.forEach((v,i)=>{const px=x+i/(p.length-1)*w,py=y+v;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.strokeStyle=c;ctx.lineWidth=3;ctx.shadowColor=c;ctx.shadowBlur=12;ctx.stroke();ctx.shadowBlur=0;ctx.restore()}
async function makePng(data){
  const W=800,H=900,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),positive=data.pnl>=0,c1=positive?'#25d6d0':'#ff5266';
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,positive?'#101b24':'#24141b');bg.addColorStop(1,'#070a0f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);const glow=ctx.createRadialGradient(650,120,10,650,120,330);glow.addColorStop(0,c1+'44');glow.addColorStop(1,c1+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,500);
  round(ctx,18,18,W-36,H-36,28);ctx.strokeStyle=c1+'55';ctx.lineWidth=2;ctx.stroke();const font=(s,w='400')=>ctx.font=`${w} ${s}px Inter Tight,Inter,Arial,sans-serif`;
  font(20,'900');ctx.fillStyle=c1;ctx.fillText('KITSETUPS',50,67);round(ctx,662,41,86,31,16);ctx.fillStyle=c1+'20';ctx.fill();font(12,'900');ctx.fillStyle=c1;ctx.textAlign='center';ctx.fillText(data.side,705,62);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(74,118,22,0,Math.PI*2);ctx.fillStyle='#111c25';ctx.fill();ctx.strokeStyle=c1;ctx.stroke();font(14,'900');ctx.fillStyle='#eef3f9';ctx.textAlign='center';ctx.fillText(clean(data.name).slice(0,1).toUpperCase(),74,123);ctx.textAlign='left';font(15,'900');ctx.fillText(clean(data.name),110,116);font(9,'500');ctx.fillStyle='#708191';ctx.fillText(clean(data.pair),110,136);
  chart(ctx,50,157,700,72,positive);face(ctx,590,625,175,positive);rocket(ctx,690,560,1.02,positive);
  font(54,'950');ctx.fillStyle=c1;ctx.fillText(`${data.pnl>=0?'+':''}${fmt(data.pnl,2)}%`,50,315);font(9,'800');ctx.fillStyle='#71818f';ctx.fillText('POSITION PERFORMANCE',50,334);
  [['ENTRY',data.entry?fmt(data.entry,6):'—'],['MARK',data.mark?fmt(data.mark,6):'—'],['LEVERAGE',data.leverage?`${fmt(data.leverage,0)}x`:'—'],['DIRECTION',data.side]].forEach((cell,i)=>{const x=50+(i%2)*355,y=356+Math.floor(i/2)*76;round(ctx,x,y,335,64,10);ctx.fillStyle='#0a1118dd';ctx.fill();ctx.strokeStyle='#263141';ctx.stroke();font(8,'500');ctx.fillStyle='#66788a';ctx.fillText(cell[0],x+14,y+20);font(13,'800');ctx.fillStyle='#e7edf7';ctx.fillText(cell[1],x+14,y+43)});
  font(8,'800');ctx.fillStyle=c1;ctx.fillText('● LIVE POSITION',50,850);ctx.fillStyle='#9babb5';ctx.textAlign='right';ctx.fillText('KITSETUPS',750,850);ctx.textAlign='left';return new Promise(resolve=>c.toBlob(resolve,'image/png',.94));
}
async function action(dialog,downloadOnly){const data=original(dialog);if(!Number.isFinite(data.pnl))return;const blob=await makePng(data);if(!blob)return;const file=new File([blob],`kitsetups-${data.side.toLowerCase()}-${data.pnl>=0?'profit':'loss'}-pnl.png`,{type:'image/png'});if(!downloadOnly&&navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({title:'KitSetups Futures PnL',text:`${data.pair} · ${data.side} · ${data.pnl>=0?'+':''}${fmt(data.pnl,2)}%`,files:[file]});return}catch(e){if(e?.name==='AbortError')return}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

const observer=new MutationObserver(()=>document.querySelectorAll('.mexc-modal .pnl-share-dialog').forEach((d)=>{captureOriginal(d);restoreAuthoritativePnl(d)}));
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',async(e)=>{const b=e.target.closest('.pnl-share-actions button');if(!b)return;const d=b.closest('.pnl-share-dialog');if(!d)return;const label=clean(b.textContent).toLowerCase();if(label!=='share'&&label!=='download')return;e.preventDefault();e.stopImmediatePropagation();b.disabled=true;try{await action(d,label==='download')}finally{b.disabled=false}},true);

// Start after this shim has registered its observers so the original PnL is captured before the legacy card runtime transforms the DOM.
import('./pnl-card-runtime-v2.js');
