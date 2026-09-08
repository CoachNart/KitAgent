import fs from 'node:fs';

const path = 'src/PerpetualsPage.jsx';
let s = fs.readFileSync(path, 'utf8');
const builder = '0x2E5c7Cb21bA789cFE815e3471fCc1CBEd6680Cc9';

if (!s.includes(`const BUILDER_ADDRESS='${builder}';`)) {
  s = s.replace("const HL='https://api.hyperliquid.xyz/info';", `const HL='https://api.hyperliquid.xyz/info';\nconst BUILDER_ADDRESS='${builder}';\nconst BUILDER_FEE='0.01%';\nconst BUILDER_FEE_TENTHS_BPS=10;`);
}

if (!s.includes('builderApproved')) {
  s = s.replace("const [connected,setConnected]=useState(false),[modal,setModal]=useState(false),[walletClient,setWalletClient]=useState(null),[address,setAddress]=useState('');", "const [connected,setConnected]=useState(false),[modal,setModal]=useState(false),[walletClient,setWalletClient]=useState(null),[address,setAddress]=useState('');\n const [builderApproved,setBuilderApproved]=useState(false);");
}

if (!s.includes('const approveBuilder=')) {
  const approval = "const approveBuilder=async(ex)=>{const current=await info({type:'maxBuilderFee',user:address,builder:BUILDER_ADDRESS});if(Number(current)>=BUILDER_FEE_TENTHS_BPS)return;await ex.approveBuilderFee({maxFeeRate:BUILDER_FEE,builder:BUILDER_ADDRESS});setBuilderApproved(true);};\n ";
  const marker = 'const place=async()=>';
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('place function marker not found');
  s = s.slice(0, idx) + approval + s.slice(idx);
}

if (!s.includes('builder:{b:BUILDER_ADDRESS,f:BUILDER_FEE_TENTHS_BPS}')) {
  s = s.replace(/const place=async\(\)=>\{([\s\S]*?)\n const cancel=/, (m, body) => {
    let next = body;
    next = next.replace("const ex=await exchange();", "const ex=await exchange();await approveBuilder(ex);");
    next = next.replace("const r=await ex.order({orders:[order],grouping:'na'});", "order.builder={b:BUILDER_ADDRESS,f:BUILDER_FEE_TENTHS_BPS};const r=await ex.order({orders:[order],grouping:'na'});");
    return `const place=async()=>{${next}\n const cancel=`;
  });
}

fs.writeFileSync(path, s);
console.log('KitSetups builder fee patch prepared: 1 bp on Hyperliquid perp fills.');
