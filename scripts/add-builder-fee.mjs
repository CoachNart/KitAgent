import fs from 'node:fs';

const path = 'src/PerpetualsPage.jsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("const BUILDER_ADDRESS='0x2E5c7Cb21bA789cFE815e3471fCc1CBEd6680Cc9';")) {
  s = s.replace("const HL='https://api.hyperliquid.xyz/info';", "const HL='https://api.hyperliquid.xyz/info';\nconst BUILDER_ADDRESS='0x2E5c7Cb21bA789cFE815e3471fCc1CBEd6680Cc9';\nconst BUILDER_FEE='0.01%';\nconst BUILDER_FEE_TENTHS_BPS=10;");
}

s = s.replace("const [connected,setConnected]=useState(false),[modal,setModal]=useState(false),[walletClient,setWalletClient]=useState(null),[address,setAddress]=useState('');", "const [connected,setConnected]=useState(false),[modal,setModal]=useState(false),[walletClient,setWalletClient]=useState(null),[address,setAddress]=useState('');\n const [builderApproved,setBuilderApproved]=useState(false),[builderBusy,setBuilderBusy]=useState(false);");

const oldSubmit = "const submit=async()=>{if(!walletClient||!address){await connect();return}const size=stepDown((Number(margin)||0)*(Number(leverage)||1)/(mid||1),market?.szDecimals||4);if(size<=0){setMessage('Enter a valid margin.');return}try{setBusy(true);const ex=exchange();await ex.updateLeverage({asset:Math.max(0,markets.findIndex(x=>x.name===symbol)),isCross:true,leverage:Number(leverage)});const px=Number(limit)||mid;await ex.order({orders:[{a:Math.max(0,markets.findIndex(x=>x.name===symbol)),b:side==='Long',p:String(px),s:String(size),r:reduceOnly,t:{limit:{tif:'Gtc'}}}],grouping:'na'});setMessage(`${side} ${symbol} order submitted on Hyperliquid.`)}catch(e){setMessage(e?.message||'Order failed.')}finally{setBusy(false)}};";
const newSubmit = "const approveBuilder=async()=>{if(!walletClient||!address){await connect();return}try{setBuilderBusy(true);const ex=exchange();const current=await info({type:'maxBuilderFee',user:address,builder:BUILDER_ADDRESS});if(Number(current)<BUILDER_FEE_TENTHS_BPS)await ex.approveBuilderFee({maxFeeRate:BUILDER_FEE,builder:BUILDER_ADDRESS});setBuilderApproved(true);setMessage('KitSetups trading fee approved at 1 bp. You can revoke this approval in Hyperliquid.')}catch(e){setMessage(e?.message||'Builder fee approval failed.')}finally{setBuilderBusy(false)}};\n const submit=async()=>{if(!walletClient||!address){await connect();return}if(!builderApproved){setMessage('Approve the KitSetups 1 bp builder fee before trading.');return}const size=stepDown((Number(margin)||0)*(Number(leverage)||1)/(mid||1),market?.szDecimals||4);if(size<=0){setMessage('Enter a valid margin.');return}try{setBusy(true);const ex=exchange();const asset=Math.max(0,markets.findIndex(x=>x.name===symbol));await ex.updateLeverage({asset,isCross:true,leverage:Number(leverage)});const px=Number(limit)||mid;await ex.order({orders:[{a:asset,b:side==='Long',p:String(px),s:String(size),r:reduceOnly,t:{limit:{tif:'Gtc'},},builder:{b:BUILDER_ADDRESS,f:BUILDER_FEE_TENTHS_BPS}}],grouping:'na'});setMessage(`${side} ${symbol} order submitted on Hyperliquid with KitSetups fee attribution.`)}catch(e){setMessage(e?.message||'Order failed.')}finally{setBusy(false)}};";
if (!s.includes('const approveBuilder=')) {
  if (!s.includes(oldSubmit)) throw new Error('submit function marker not found');
  s = s.replace(oldSubmit, newSubmit);
}

s = s.replace("<section className=\"trade-panel\"><header><b>Place order</b><span>Hyperliquid</span></header>", "<section className=\"trade-panel\"><header><b>Place order</b><span>Hyperliquid</span></header><div className=\"builder-fee\"><span>KitSetups fee <b>1 bp</b></span>{builderApproved?<small>Approved</small>:<button onClick={approveBuilder} disabled={builderBusy}>{builderBusy?'Approving…':'Enable'}</button>}</div>");

fs.writeFileSync(path, s);
console.log('Added KitSetups Hyperliquid builder fee: 1 bp using the supplied wallet address.');
