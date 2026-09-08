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

// Navigation icons: Home stays the Home icon. Both Airdrops and Profile use
// the same Profile/User icon on desktop and mobile navigation.
source = source.replace("['home','Home',BarChart3]", "['home','Home',House]");
source = source.replace("['home','Home',UserRound]", "['home','Home',House]");
source = source.replace("['drops','Airdrops & faucets',Rocket]", "['drops','Airdrops & faucets',UserRound]");
source = source.replace("['profile','Profile',Rocket]", "['profile','Profile',UserRound]");

if (source !== before) fs.writeFileSync(file, source);
