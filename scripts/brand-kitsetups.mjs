import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const replacements = [
  [/KitAgent/g, 'KitSetups'],
  [/KITAGENT/g, 'KITSETUPS'],
  [/kitagent-logo\.svg/g, 'kitsetups-logo.svg'],
  [/kitagent/g, 'kitsetups'],
];

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      try {
        const source = await readFile(file, 'utf8');
        let output = source;
        for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement);
        if (output !== source) await writeFile(file, output, 'utf8');
      } catch {}
    }
  }
}

await walk(root);
console.log('KitSetups branding applied to production build.');
