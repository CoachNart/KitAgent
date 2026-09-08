import fs from 'node:fs';

const file='src/PerpetualsPage.jsx';
let s=fs.readFileSync(file,'utf8');

const shareCode="const share=async()=>{if(!current)return say('No open position to share.');const pnl=Number(current.unrealisedPnl||current.unrealizedPnl||0);const direction=current.side==='Buy'?'Long':'Short';const text='KitSetups Perpetuals · '+current.symbol+'\\n'+direction+' · '+(current.leverage||leverage)+'x\\nPnL '+(pnl>=0?'+':'')+usd(pnl)+' · '+n(current.size,4)+' contracts\\nEntry '+usd(current.avgPrice)+' · Mark '+usd(current.markPrice);try{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=700;const ctx=canvas.getContext('2d');ctx.fillStyle='#0b1018';ctx.fillRect(0,0,1200,700);ctx.fillStyle='#00c7fe';ctx.font='700 44px Arial';ctx.fillText('KitSetups',70,85);ctx.fillStyle='#9aa6b2';ctx.font='400 22px Arial';ctx.fillText('PERPETUAL TRADE',70,125);ctx.fillStyle='#fff';ctx.font='700 38px Arial';ctx.fillText(current.symbol,70,205);ctx.font='700 30px Arial';ctx.fillText(direction+' · '+(current.leverage||leverage)+'x',70,255);ctx.fillStyle=pnl>=0?'#00c7fe':'#ff4d4d';ctx.font='700 62px Arial';ctx.fillText((pnl>=0?'+':'')+usd(pnl),70,365);ctx.fillStyle='#9aa6b2';ctx.font='400 20px Arial';ctx.fillText('Size '+n(current.size,4)+' · Entry '+usd(current.avgPrice)+' · Mark '+usd(current.markPrice),70,425);ctx.fillText('KitSetups · Live market execution',70,620);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(navigator.share&&blob){const f=new File([blob],'kitsetups-pnl.png',{type:'image/png'});await navigator.share({title:'KitSetups PnL',text,files:[f]})}else if(navigator.share)await navigator.share({title:'KitSetups PnL',text});else{await navigator.clipboard?.writeText(text);say('KitSetups PnL copied.')}}catch{try{await navigator.clipboard?.writeText(text);say('KitSetups PnL copied.')}catch{}}};\n const chart=";
s=s.replace(/const share=async\(\)=>\{[\s\S]*?\};\n const chart=/,shareCode);

const polishCss=[
'.ka-perps .account-panel{max-height:430px;overflow:hidden}',
'.ka-perps .account-panel,.ka-perps .account-panel *{font-size:11px}',
'.ka-perps .account-panel .tabs button{font-size:11px;padding:7px 8px}',
'.ka-perps .account-panel .positions-list,.ka-perps .account-panel .orders-list,.ka-perps .account-panel .history-list{max-height:210px;overflow:auto}',
'.ka-perps .account-panel .position-actions{display:flex!important;flex-wrap:wrap;gap:6px;position:relative;z-index:5}',
'.ka-perps .account-panel .position-actions button,.ka-perps .account-panel .share-pnl,.ka-perps .account-panel .close-trade{display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center;justify-content:center;min-height:30px;padding:6px 9px;font-size:10px;white-space:nowrap}',
'.ka-perps .account-panel .position-card,.ka-perps .account-panel .position-row{padding:7px 9px!important}',
'@media(max-width:700px){.ka-perps .account-panel{max-height:360px}.ka-perps .account-panel .positions-list,.ka-perps .account-panel .orders-list,.ka-perps .account-panel .history-list{max-height:165px}.ka-perps .account-panel .position-actions button,.ka-perps .account-panel .share-pnl,.ka-perps .account-panel .close-trade{flex:1 1 calc(50% - 6px)}}'
].join('\\n');
const polish='const POLISH_CSS=String.raw`'+polishCss+'`;\n';
if(!s.includes('const POLISH_CSS=')) s=s.replace(/\nexport default function PerpetualsPage\(\)/, '\n'+polish+'export default function PerpetualsPage()');
s=s.replace('<style>{CSS}</style>','<style>{CSS}</style><style>{POLISH_CSS}</style>');
fs.writeFileSync(file,s);
console.log('Perpetual terminal compact/pnl polish applied.');
