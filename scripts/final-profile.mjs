import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');
if(!s.includes("const PAYMENT_ADDRESS=import.meta.env.VITE_BNB_USDT_PAYMENT_ADDRESS||''"))s=s.replace("const EXAMPLES=","const PAYMENT_ADDRESS=import.meta.env.VITE_BNB_USDT_PAYMENT_ADDRESS||'';\nconst EXAMPLES=");
if(!s.includes("const[txHash,setTxHash]=useState('')")){const marker="const[account,setAccount]=useState('');";if(s.includes(marker))s=s.replace(marker,marker+"const[txHash,setTxHash]=useState('');const[verifyState,setVerifyState]=useState('');")}
const start="{mode==='profile'&&<section className=\"profile-page premium-profile\">";
const i=s.indexOf(start);
if(i>=0){let depth=0,end=-1;for(let p=i;p<s.length-9;p++){if(s.startsWith('<section',p))depth++;else if(s.startsWith('</section>',p)){depth--;if(depth===0){end=p+'</section>'.length;break}}}if(end>0){const profile=fs.readFileSync('src/profile-template.jsx','utf8').trim();s=s.slice(0,i)+profile+s.slice(end);}}
}
fs.writeFileSync(path,s);
console.log('KitAgent profile replaced with KitSetups profile template');
