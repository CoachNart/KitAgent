import fs from 'node:fs';

const path = 'src/App.jsx';
let src = fs.readFileSync(path, 'utf8');
const lines = src.split('\n');
const imports = {
  wallet: "import { connectWallet as connectWalletExternal, getActiveProvider } from './walletkit.jsx';",
  access: "import AccessGate from './AccessGate.jsx';",
  market: "import LiveMarketPage from './LiveMarketPage.jsx';",
  history: "import SignalHistory from './SignalHistory.jsx';",
  perps: "import PerpetualsPage from './PerpetualsPage.jsx';",
  home: "import HomePage from './HomePage.jsx';",
};

const importPatterns = [
  /^import\s+.*from\s+['"]\.\/wallet(?:Connector|kit)\.jsx?['"];?$/,
  /^import\s+AccessGate\s+from\s+['"]\.\/AccessGate\.jsx['"];?$/,
  /^import\s+LiveMarketPage\s+from\s+['"]\.\/LiveMarketPage\.jsx['"];?$/,
  /^import\s+SignalHistory\s+from\s+['"]\.\/SignalHistory\.jsx['"];?$/,
  /^import\s+PerpetualsPage\s+from\s+['"]\.\/PerpetualsPage\.jsx['"];?$/,
  /^import\s+HomePage\s+from\s+['"]\.\/HomePage\.jsx['"];?$/,
];

const kept = [];
const seen = new Set();
for (const line of lines) {
  const trimmed = line.trim();
  let key = null;
  if (importPatterns[0].test(trimmed)) key = 'wallet';
  else if (importPatterns[1].test(trimmed)) key = 'access';
  else if (importPatterns[2].test(trimmed)) key = 'market';
  else if (importPatterns[3].test(trimmed)) key = 'history';
  else if (importPatterns[4].test(trimmed)) key = 'perps';
  else if (importPatterns[5].test(trimmed)) key = 'home';
  if (key) {
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(imports[key]);
  } else {
    kept.push(line);
  }
}

let out = kept.join('\n');
const required = Object.values(imports);
const missing = required.filter(line => !out.split('\n').some(x => x.trim() === line));
if (missing.length) {
  const insertAt = out.split('\n').findIndex(x => x.startsWith("import { Activity,"));
  const arr = out.split('\n');
  arr.splice(insertAt >= 0 ? insertAt : 1, 0, ...missing);
  out = arr.join('\n');
}
fs.writeFileSync(path, out);
console.log('Normalized App.jsx imports.');
