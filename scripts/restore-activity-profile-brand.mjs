import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src','App.jsx');
let source=fs.readFileSync(file,'utf8');

// Keep exactly one Profile navigation entry. Profile always uses the profile/user icon;
// Airdrops & Faucets remains its own navigation destination.
source=source.replace(/const nav=\[[^\n]*?\];/,"const nav=[['home','Home',House],['market','Market analysis',BarChart3],['defi','DeFi & actions',Layers3],['perps','Perpetuals',Zap],['drops','Airdrops & faucets',Rocket],['activity','Activity',History],['profile','Profile',UserRound]];");

if(!source.includes("import SignalHistory from './SignalHistory.jsx';")){
  source=source.replace("import PerpetualsPage from './PerpetualsPage.jsx';","import PerpetualsPage from './PerpetualsPage.jsx';\nimport SignalHistory from './SignalHistory.jsx';");
}

source=source.replace(/\{page==='activity'&&<ActivityPage activity=\{activity\}\/\>\}/g,"{page==='activity'&&<SignalHistory/>}");

// Final visible-brand cleanup for the generated App source.
source=source.replaceAll('KitAgent','KitSetups').replaceAll('KITAGENT','KITSETUPS').replaceAll('kitagent-logo.svg','kitsetups-logo.svg');

fs.writeFileSync(file,source);
console.log('Activity track record and Profile navigation normalization applied.');
