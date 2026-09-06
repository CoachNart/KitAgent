import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes('className="terminal-more"')){
  const marker='<div className="action-strip">';
  if(s.includes(marker)){
    const menu='<details className="terminal-more"><summary>QUICK ACTIONS <span>10 COMMANDS</span></summary><div className="terminal-more-menu">{EXAMPLES.map((x,i)=><button key={"quick-"+i} onClick={()=>setCommand(x)}><span>{x}</span><small>Load into terminal</small></button>)}</div></details>';
    s=s.replace(marker,menu+marker);
  }
}

fs.writeFileSync(path,s);
console.log('KitAgent responsive terminal quick-actions dropdown applied');
