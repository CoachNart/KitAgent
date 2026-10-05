import fs from 'node:fs';
import path from 'node:path';

const fail = [];
const exists = p => fs.existsSync(p);
const walk = dir => {
  if (!exists(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

const apiFiles = exists('api')
  ? walk('api').filter(p => /.(js|mjs|cjs)$/.test(p))
  : [];
if (apiFiles.length > 12) fail.push(`Vercel API function tree has ${apiFiles.length} files; Hobby limit is 12.`);

const legacyPatterns = [
  /Twelve Data/i,
  /market-engine-v3/i,
  /biquote/i,
  /yahooMarket/i,
  /Yahoo/i,
  /XAUUSD/i,
  /EURUSD/i,
  /GBPUSD/i
];
for (const file of walk('src').concat(walk('server'), walk('api'))) {
  if (!/.(js|jsx|mjs|cjs|ts|tsx)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of legacyPatterns) {
    if (pattern.test(text)) fail.push(`Legacy market/provider reference ${pattern} found in ${file}`);
  }
}

for (const required of [
  'server/market-engine/index.js',
  'api/market.js',
  'api/signals.js',
  'vercel.json',
  'package.json'
]) {
  if (!exists(required)) fail.push(`Required production file missing: ${required}`);
}

if (fail.length) {
  console.error('Platform hardening failed:');
  for (const item of fail) console.error(' - ' + item);
  process.exit(1);
}

console.log(`Platform hardening checks passed: ${apiFiles.length} API function files; legacy provider scan clean; required production files present.`);
// Keep the hardening gate active for every production-branch push.
