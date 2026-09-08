import fs from 'node:fs';
const path='src/PerpetualsPage.jsx';
let s=fs.readFileSync(path,'utf8');
const from="const uni=(m?.[0]?.universe||[]).map(x=>({...x,baseCoin:x.name,leverageFilter:{maxLeverage:x.maxLeverage}}));";
const to="const uni=(m?.[0]?.universe||[]).map(x=>({...x,symbol:x.name,baseCoin:x.name,leverageFilter:{maxLeverage:x.maxLeverage}}));";
if(!s.includes(from)) throw new Error('Hyperliquid market mapping anchor not found.');
s=s.replace(from,to);
fs.writeFileSync(path,s);
console.log('Hyperliquid markets now expose the legacy terminal selector shape.');
