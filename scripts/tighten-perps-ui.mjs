import fs from 'node:fs';

const p='src/PerpetualsPage.jsx';
let s=fs.readFileSync(p,'utf8');

s=s.replace('export default function PerpetualsPage(){','export default function PerpetualsPage({user}){');
s=s.replaceAll('Search all Bybit perpetuals…','Search all Hyperliquid perpetuals…');
s=s.replaceAll('Bybit connected','Hyperliquid connected');
s=s.replaceAll('Connect Bybit','Connect wallet');
s=s.replaceAll('Bybit Perpetuals','Hyperliquid Perpetuals');
s=s.replaceAll('Bybit','Hyperliquid');

const start=s.indexOf(' const share=async()=>{');
const end=s.indexOf(' const chart=',start);
if(start>=0&&end>start){
 const share=` const share=async()=>{\n  if(!current)return say('No open position to share.');\n  const pnl=Number(current.unrealizedPnl||current.unrealisedPnl||0);\n  const sideLabel=current.side==='Buy'?'Long':'Short';\n  const name=String(user?.displayName||user?.name||user?.email?.split('@')[0]||'Trader');\n  const symbolLabel=String(current.symbol||'').replace('USDT','');\n  const leverageLabel=current.leverage||leverage;\n  const sizeLabel=n(current.size,4);\n  const entry=usd(current.avgPrice);\n  const mark=usd(current.markPrice);\n  const pnlLabel=\\`\\${pnl>=0?'+':''}\\${usd(pnl)}\\`;\n  try{\n   const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=700;\n   const ctx=canvas.getContext('2d'); if(!ctx)throw Error('Canvas unavailable');\n   const grad=ctx.createLinearGradient(0,0,1200,700); grad.addColorStop(0,'#0a0f16'); grad.addColorStop(1,'#111a24');\n   ctx.fillStyle=grad; ctx.fillRect(0,0,1200,700); ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2; ctx.strokeRect(28,28,1144,644);\n   ctx.fillStyle='#fff'; ctx.font='700 38px Inter,Arial,sans-serif'; ctx.fillText('KitSetups',64,82);\n   ctx.fillStyle='rgba(255,255,255,.55)'; ctx.font='500 22px Inter,Arial,sans-serif'; ctx.fillText('PERPETUALS · TRADE RESULT',64,118);\n   ctx.fillStyle='#fff'; ctx.font='700 52px Inter,Arial,sans-serif'; ctx.fillText(\\`\\${symbolLabel}-PERP\\`,64,190);\n   ctx.fillStyle=sideLabel==='Long'?'#27d7ff':'#ff4d5d'; ctx.font='700 28px Inter,Arial,sans-serif'; ctx.fillText(\\`\\${sideLabel} · \\${leverageLabel}x\\`,64,232);\n   ctx.fillStyle=pnl>=0?'#27d7ff':'#ff4d5d'; ctx.font='800 86px Inter,Arial,sans-serif'; ctx.fillText(pnlLabel,64,350);\n   ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='500 20px Inter,Arial,sans-serif'; ctx.fillText('UNREALIZED PNL',66,386);\n   const items=[['Trader',name],['Size',\\`\\${sizeLabel} contracts\\`],['Entry',entry],['Mark',mark]];\n   items.forEach((it,i)=>{const x=64+(i%2)*520,y=470+Math.floor(i/2)*72;ctx.fillStyle='rgba(255,255,255,.42)';ctx.font='500 18px Inter,Arial,sans-serif';ctx.fillText(it[0].toUpperCase(),x,y);ctx.fillStyle='#fff';ctx.font='650 24px Inter,Arial,sans-serif';ctx.fillText(it[1],x,y+30)});\n   ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font='500 16px Inter,Arial,sans-serif'; ctx.fillText('Shared from KitSetups',64,635);\n   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));\n   if(blob&&navigator.share&&navigator.canShare){const file=new File([blob],\\`kitsetups-\\${symbolLabel.toLowerCase()}-pnl.png\\`,{type:'image/png'});if(navigator.canShare({files:[file]})){await navigator.share({title:\\`KitSetups · \\${symbolLabel} PnL\\`,text:\\`\\${name} · \\${sideLabel} \\${leverageLabel}x · \\${pnlLabel}\\`,files:[file]});return}}\n   if(blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=\\`kitsetups-\\${symbolLabel.toLowerCase()}-pnl.png\\`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('PnL card generated.');return}\n  }catch{}\n  const text=\\`KitSetups · \\${name} · \\${symbolLabel}-PERP\\n\\${sideLabel} \\${leverageLabel}x · PnL \\${pnlLabel}\\nSize \\${sizeLabel} · Entry \\${entry} · Mark \\${mark}\\`;\n  try{if(navigator.share)await navigator.share({title:'KitSetups PnL',text});else await navigator.clipboard.writeText(text);say('PnL copied.')}catch{}\n };\n`;
 s=s.slice(0,start)+share+s.slice(end);
}

const css=`
/* KitSetups perpetual polish */
.ka-perps .book{overflow:visible!important;min-height:0!important}
.ka-perps .book .mid{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:5!important;min-height:30px!important;line-height:30px!important}
.ka-perps .account-panel{min-width:0!important;overflow:visible!important}
.ka-perps .account-panel .tabs{padding:4px!important;gap:3px!important}
.ka-perps .account-panel .tabs button{padding:8px 12px!important;font-size:12px!important;border-radius:9px!important}
.ka-perps .account-panel .row{gap:7px!important;padding:9px!important;align-items:center!important;overflow:visible!important}
.ka-perps .account-panel .row button{visibility:visible!important;opacity:1!important;white-space:nowrap!important}
.ka-perps .account-panel .row button svg{flex:none!important}
.ka-perps .account-panel .position-actions{display:flex!important;gap:6px!important;align-items:center!important;justify-content:flex-end!important;flex-wrap:wrap!important}
.ka-perps .account-panel .position-actions button{min-height:32px!important;padding:7px 10px!important}
.ka-perps .account-panel .share-pnl,.ka-perps .account-panel .close-trade{display:inline-flex!important;visibility:visible!important}
.ka-perps .two{gap:8px!important}
.ka-perps .book{padding:8px!important}
.ka-perps .book header{padding:5px 6px 8px!important}
.ka-perps .book p{padding:4px 6px!important;min-height:22px!important}
.ka-perps .trade-panel,.ka-perps .chart-panel,.ka-perps .book,.ka-perps .account-panel{border-radius:14px!important}
.ka-perps .trade-panel{padding:12px!important}
.ka-perps .pf{margin-bottom:7px!important}
@media(max-width:700px){.ka-perps .account-panel .row{grid-template-columns:minmax(0,1fr)!important}.ka-perps .account-panel .position-actions{justify-content:stretch!important}.ka-perps .account-panel .position-actions button{flex:1 1 120px!important}.ka-perps .book .mid{font-size:13px!important}}
`;
s=s.replace('</style>',css+'</style>');
fs.writeFileSync(p,s);

let app=fs.readFileSync('src/App.jsx','utf8');
app=app.replace('<PerpetualsPage wallet={wallet} connectWallet={connectWallet}/>','<PerpetualsPage wallet={wallet} user={user} connectWallet={connectWallet}/>');
fs.writeFileSync('src/App.jsx',app);
console.log('Perpetual terminal UI tightened and branded PnL sharing enabled.');
