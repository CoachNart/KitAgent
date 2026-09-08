import fs from 'node:fs';

const path='scripts/switch-perps-to-hyperliquid.mjs';
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf('const prefix=String.raw`');
const end=s.indexOf('`;\nfs.writeFileSync(repo,prefix+tail);',start);
if(start<0||end<0)throw new Error('Hyperliquid prefix template not found.');
const marker='const prefix=String.raw`';
const body=s.slice(start+marker.length,end);
const escaped=body.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');
s=s.slice(0,start)+marker+escaped+s.slice(end);
fs.writeFileSync(path,s);
console.log('Escaped Hyperliquid migration template safely.');
