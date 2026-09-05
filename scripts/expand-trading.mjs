import fs from 'node:fs';
const path='src/main.jsx';let s=fs.readFileSync(path,'utf8');
if(!s.includes("./trading/TradingPanel.jsx")){s=s.replace("import RevenuePanel from './revenue/RevenuePanel.jsx';","import RevenuePanel from './revenue/RevenuePanel.jsx';\nimport TradingPanel from './trading/TradingPanel.jsx';")}
const oldBuild="if(currentIntent==='revenue'){setMode('revenue');return}setAction('contract')";
const newBuild="if(currentIntent==='revenue'){setMode('revenue');return}if(currentIntent==='trading'){setMode('trading');return}setAction('contract')";
if(s.includes(oldBuild))s=s.replace(oldBuild,newBuild);
const oldNav="['revenue','activity','Revenue']";
if(s.includes(oldNav)&&!s.includes("['trading','activity','Trading']"))s=s.replace(oldNav,"['revenue','activity','Revenue'],['trading','activity','Trading']");
const marker="{mode==='revenue'&&<RevenuePanel/>}";
if(s.includes(marker)&&!s.includes("mode==='trading'&&<TradingPanel"))s=s.replace(marker,marker+"{mode==='trading'&&<TradingPanel initialCommand={command}/>}");
fs.writeFileSync(path,s);console.log('KitAgent trading intelligence transform applied');
