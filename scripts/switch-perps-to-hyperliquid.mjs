import fs from 'node:fs';
const path='src/App.jsx';
let s=fs.readFileSync(path,'utf8');
const before=s;
s=s.replace("import PerpetualsPage from './PerpetualsPage.jsx';","import PerpetualsPage from './HyperliquidPerpetualsPage.jsx';");
if(s===before) throw new Error('Perpetuals import was not found; refusing to create a no-op migration.');
fs.writeFileSync(path,s);
console.log('Switched the perpetuals route to HyperliquidPerpetualsPage.jsx');
