import fs from 'node:fs';
const path='src/main.jsx';let s=fs.readFileSync(path,'utf8');

// Wire the existing Trading panel into the app once.
if(!s.includes("./trading/TradingPanel.jsx")){
  const anchor="import {aaReady,sponsorshipReady,sponsorshipMessage,supportedEntryPoints} from './aa/index.js';";
  if(s.includes(anchor))s=s.replace(anchor,anchor+"\nimport TradingPanel from './trading/TradingPanel.jsx';");
}

// Let the command agent open the Trading layer directly.
if(!s.includes("if(currentIntent==='trading'){setMode('trading');return}")){
  const marker="if(currentIntent==='gas'){setAction('contract');setNotice('Gas mode: use Contract or Send and KitAgent will simulate the exact transaction fee.');return}";
  if(s.includes(marker))s=s.replace(marker,marker+"if(currentIntent==='trading'){setMode('trading');return}");
}

// Final primary navigation: Terminal, Trading, Portfolio, Activity, Profile.
const oldNav="const nav=[['command','command','Terminal'],['portfolio','wallet','Portfolio'],['activity','activity','Activity'],['faucet','faucet','Gas']];";
const newNav="const nav=[['command','command','Terminal'],['trading','trading','Trading'],['portfolio','wallet','Portfolio'],['activity','activity','Activity']];";
if(s.includes(oldNav))s=s.replace(oldNav,newNav);

// Keep the Trading destination visible and connected to the real panel.
if(s.includes("mode==='trading'&&<TradingPanel")===false){
  const portfolioMarker="{mode==='portfolio'&&";
  const idx=s.indexOf(portfolioMarker);
  if(idx>=0)s=s.slice(0,idx)+"{mode==='trading'&&<TradingPanel initialCommand={command}/>}"+s.slice(idx);
}

// Give Trading its own rail glyph.
const oldIcons="wallet:'▣',activity:'⌁',command:'⌘',faucet:'♢',settings:'⚙',shield:'◇',profile:'◉'";
const newIcons="wallet:'▣',activity:'⌁',command:'⌘',trading:'↗',faucet:'♢',settings:'⚙',shield:'◇',profile:'◉'";
if(s.includes(oldIcons))s=s.replace(oldIcons,newIcons);

fs.writeFileSync(path,s);
console.log('KitAgent trading navigation transform applied');
