import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'App.jsx');
let source = fs.readFileSync(file, 'utf8');
const before = source;

// Keep the source itself aligned with the current product name. The production
// branding pass also handles built assets, but source should not fall back to the
// legacy KitAgent identity when running Vite locally.
source = source.replaceAll('KitAgent', 'KitSetups');
source = source.replaceAll('KITAGENT', 'KITSETUPS');
source = source.replaceAll('/kitagent-logo.svg', '/kitsetups-logo.svg');
source = source.replace("Terminal, UserRound, Wallet", "Terminal, UserRound, House, Wallet");
source = source.replace("['home','Home',UserRound]", "['home','Home',House]");
source = source.replace("['profile','Profile',Rocket]", "['profile','Profile',UserRound]");

if (source !== before) fs.writeFileSync(file, source);
