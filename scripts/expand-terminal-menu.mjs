import fs from 'node:fs';
const path='src/main.jsx';
let s=fs.readFileSync(path,'utf8');

if(!s.includes('className="terminal-more"')){
  const marker='<div className="action-strip">';
  if(s.includes(marker)){
    // Keep the JSX expression literal inside the transformer's template string.
    const menu='<details className="terminal-more"><summary>MORE TERMINAL ACTIONS</summary><div className="terminal-more-menu">{ACTIONS.map(([k,label,desc,glyph])=><button key={"more-"+k} onClick={()=>setAction(k)}><span>{glyph} &nbsp; {label}</span><small>{desc}</small></button>)}</div></details>';
    s=s.replace(marker,menu+marker);
  }
}

fs.writeFileSync(path,s);
console.log('KitAgent responsive terminal action menu applied');
