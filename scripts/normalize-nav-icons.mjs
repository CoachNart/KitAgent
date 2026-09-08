import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'App.jsx');
let source = fs.readFileSync(file, 'utf8');
const before = source;
source = source.replace('Terminal, UserRound, Wallet', 'Terminal, UserRound, House, Wallet');
source = source.replace("['home','Home',UserRound]", "['home','Home',House]");
if (source !== before) fs.writeFileSync(file, source);
