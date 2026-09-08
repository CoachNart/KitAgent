import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';

const root=process.cwd();
const files=execSync('git ls-files -z',{encoding:'utf8'}).split('\0').filter(Boolean);
const skip=new Set(['package-lock.json']);
let changed=0;
for(const rel of files){
  if(skip.has(rel)||rel.startsWith('.git/')) continue;
  const file=path.join(root,rel);
  let text;
  try{text=fs.readFileSync(file,'utf8')}catch{continue}
  if(!text.includes('KitAgent')) continue;
  const next=text.replaceAll('KitAgent','KitSetups');
  if(next!==text){fs.writeFileSync(file,next);changed++;console.log(rel)}
}
console.log(`Renamed KitAgent → KitSetups in ${changed} files.`);
