import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src', 'App.jsx');
let source = fs.readFileSync(file, 'utf8');
const before = source;

// Keep source and production output aligned with the current KitSetups identity.
source = source.replaceAll('KitAgent', 'KitSetups');
source = source.replaceAll('KITAGENT', 'KITSETUPS');
source = source.replaceAll('/kitagent-logo.svg', '/kitsetups-logo.svg');
source = source.replaceAll('alt="KitAgent"', 'alt="KitSetups"');
source = source.replace("Terminal, UserRound, Wallet", "Terminal, UserRound, House, Wallet");
source = source.replace("Terminal, UserRound, House, Wallet", "Terminal, UserRound, House, Wallet");

// Navigation icons are shared by desktop and mobile. Home must stay a Home icon;
// Airdrops and Profile intentionally use the same User/Profile icon.
source = source.replace("['home','Home',BarChart3]", "['home','Home',House]");
source = source.replace("['home','Home',UserRound]", "['home','Home',House]");
source = source.replace("['drops','Airdrops & faucets',Rocket]", "['drops','Airdrops & faucets',UserRound]");
source = source.replace("['profile','Profile',Rocket]", "['profile','Profile',UserRound]");

if (source !== before) fs.writeFileSync(file, source);
