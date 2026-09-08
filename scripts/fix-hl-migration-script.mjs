import fs from 'node:fs';

const path='scripts/switch-perps-to-hyperliquid.mjs';
let s=fs.readFileSync(path,'utf8');
s=s.replace("const oldCommit='1e6da79ca1c6b6e8e950e7cb7c0eff6bf438fe2a';", "const oldCommit='1b6ce33f010d2aecf3f7490462e3504bbef0892c';");
const start=s.indexOf('const prefix=String.raw`');
const end=s.indexOf('`;\nfs.writeFileSync(repo,prefix+tail);',start);
if(start<0||end<0)throw new Error('Hyperliquid prefix template not found.');
const marker='const prefix=String.raw`';
const body=s.slice(start+marker.length,end);
const escaped=body.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');
s=s.slice(0,start)+marker+escaped+s.slice(end);
fs.writeFileSync(path,s);
console.log('Repaired Hyperliquid migration template and restored the real legacy terminal source.');
