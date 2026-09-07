import fs from 'node:fs';
import path from 'node:path';

const required=[
  'src/integrations/index.js',
  'src/integrations/robinhoodChain.js',
  'src/integrations/robinhoodStockTokens.js',
  'src/integrations/morpho.js',
  'src/integrations/lighter.js',
  'api/uniswap.js',
];
for(const file of required){if(!fs.existsSync(path.resolve(file)))throw new Error(`Missing integration file: ${file}`);}
const source=fs.readFileSync('src/integrations/index.js','utf8');
for(const marker of ['morpho','lighter','robinhoodChain','uniswap','bridges'])if(!source.includes(marker))throw new Error(`Integration registry missing ${marker}`);
console.log('KitAgent integration smoke check passed: integration files and registry are present.');
console.log('No network calls were made.');
