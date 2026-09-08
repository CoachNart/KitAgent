import fs from 'node:fs';

const appPath = 'src/App.jsx';
let app = fs.readFileSync(appPath, 'utf8');

app = app.replace(
  "import { connectWallet as connectWalletExternal, getActiveProvider } from './walletConnector.js';\n",
  "import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';\n"
);

app = app.replace(
  "export default function App({user}){\n  const [page=setPage]",
  "export default function App({user}){"
);

const stateMarker = "export default function App({user}){\n";
if (!app.includes(stateMarker)) throw new Error('App component marker not found');
app = app.replace(stateMarker, stateMarker + "  const {open}=useAppKit();\n  const {address:appKitAddress,isConnected:appKitConnected}=useAppKitAccount({namespace:'eip155'});\n  const {walletProvider}=useAppKitProvider('eip155');\n");

app = app.replace(
  "  const [page,setPage]=useState('home'),[mobile,setMobile]=useState(false),[wallet,setWallet]=useState(''),[walletBusy,setWalletBusy]=useState(false),[walletMessage,setWalletMessage]=useState(''),",
  "  const [page,setPage]=useState('home'),[mobile,setMobile]=useState(false),[wallet,setWallet]=useState(''),[walletBusy,setWalletBusy]=useState(false),[walletMessage,setWalletMessage]=useState(''),"
);

const oldConnect = "  const connectWallet=async()=>{setWalletBusy(true);setWalletMessage('');try{const result=await connectWalletExternal();if(result?.address){setWallet(result.address);setToast('Wallet connected.')}}catch(e){setWalletMessage(e?.message||'Wallet connection was cancelled.');setToast('Wallet connection failed.')}finally{setWalletBusy(false)}};";
const newConnect = "  useEffect(()=>{if(appKitConnected&&appKitAddress){setWallet(appKitAddress);setWalletMessage('');setToast('Wallet connected.')}} ,[appKitConnected,appKitAddress]);\n  const connectWallet=async()=>{setWalletBusy(true);setWalletMessage('');try{if(!appKitConnected){await open({view:'Connect',namespace:'eip155'});return;}if(appKitAddress){setWallet(appKitAddress);setToast('Wallet connected.')}}catch(e){setWalletMessage(e?.message||'Wallet connection was cancelled.');setToast('Wallet connection failed.')}finally{setWalletBusy(false)}};";
if (!app.includes(oldConnect)) throw new Error('Legacy connectWallet function not found');
app = app.replace(oldConnect, newConnect);

app = app.replace(
  "const provider=getActiveProvider();if(!provider?.request)throw new Error('Connected wallet provider is unavailable.');",
  "const provider=walletProvider;if(!provider?.request)throw new Error('Connected wallet provider is unavailable.');"
);

app = app.replace(
  "<span className=\"network-mini\">RH</span>",
  "<span className=\"network-mini\">ARB</span>"
);

fs.writeFileSync(appPath, app);
fs.rmSync('src/walletConnector.js', { force: true });
