import fs from 'node:fs';

const path = 'src/main.jsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes("./multichain/adapters.js")) {
  s = s.replace(
    "import {CHAINS,getToken} from './chains/registry.js';",
    "import {CHAINS,getToken,chainList,isEvmChain} from './chains/registry.js';\nimport {adapterStatus,connectNative,nativeBalance,sendNative as sendNativeChain} from './multichain/adapters.js';"
  );
}
if (!s.includes("./revenue/RevenuePanel.jsx")) {
  s = s.replace("import {adapterStatus,connectNative,nativeBalance,sendNative as sendNativeChain} from './multichain/adapters.js';", "import {adapterStatus,connectNative,nativeBalance,sendNative as sendNativeChain} from './multichain/adapters.js';\nimport RevenuePanel from './revenue/RevenuePanel.jsx';\nimport {recordUsage,serviceFee,feeLabel} from './revenue/model.js';")
}

const oldPicker = '<option value="robinhood">Robinhood Chain</option><option value="robinhoodTestnet">Robinhood Testnet</option><option value="custom">Custom EVM Testnet</option>';
const newPicker = '{chainList().map(c=><option key={c.key} value={c.key}>{c.name}{c.testnet?\' · TESTNET\':\'\'}</option>)}<option value="custom">Custom EVM Testnet</option>';
if (s.includes(oldPicker)) s = s.replace(oldPicker, newPicker);

const oldChain = "const[chainKey,setChainKey]=useState('robinhood');const[custom,setCustom]=useState({name:'Custom EVM Testnet',id:'',rpc:'',faucet:'',explorer:''});const chain=chainKey==='custom'?{name:custom.name,id:Number(custom.id),rpc:custom.rpc,explorer:custom.explorer,faucet:custom.faucet,symbol:'ETH'}:CHAINS[chainKey];";
const newChain = "const[chainKey,setChainKey]=useState('robinhood');const[custom,setCustom]=useState({name:'Custom EVM Testnet',id:'',rpc:'',faucet:'',explorer:''});const chain=chainKey==='custom'?{name:custom.name,id:Number(custom.id),rpc:custom.rpc,explorer:custom.explorer,faucet:custom.faucet,symbol:'ETH',kind:'evm'}:CHAINS[chainKey];";
if (s.includes(oldChain)) s = s.replace(oldChain, newChain);

const oldRefresh = "async function refresh(a=account){if(!a||!chain?.rpc)return;try{const b=await rpc(chain,'eth_getBalance',[a,'latest']);setNative(fromBase(BigInt(b),18));const d=await explorerAddress(chain,a);setActivity(d.transactions||[]);setTokens(d.tokens||[]);setSummary(summarizeActivity(d.transactions||[]))}catch(e){setNotice(`Indexer unavailable: ${e.message}`)}}";
const newRefresh = "async function refresh(a=account){if(!a)return;try{if(!isEvmChain(chain)){setNative(await nativeBalance(chain,a));setActivity([]);setTokens([]);setSummary(null);return}if(!chain?.rpc)return;const b=await rpc(chain,'eth_getBalance',[a,'latest']);setNative(fromBase(BigInt(b),18));const d=await explorerAddress(chain,a);setActivity(d.transactions||[]);setTokens(d.tokens||[]);setSummary(summarizeActivity(d.transactions||[]))}catch(e){setNotice(`Network data unavailable: ${e.message}`)}}";
if (s.includes(oldRefresh)) s = s.replace(oldRefresh, newRefresh);

const oldConnect = "async function connectWallet(){try{const a=await connect();if(a?.[0]){setAccount(a[0]);await ensureChain(chain);setNotice('Wallet connected and network checked.')}}catch(e){setNotice(e.message||'Wallet connection failed')}}";
const newConnect = "async function connectWallet(){try{if(!isEvmChain(chain)){const a=await connectNative(chain);if(a){setAccount(a);await refresh(a);setNotice(`${chain.name} wallet connected.`)}return}const a=await connect();if(a?.[0]){setAccount(a[0]);await ensureChain(chain);setNotice('Wallet connected and network checked.');await refresh(a[0])}}catch(e){setNotice(e.message||'Wallet connection failed')}}";
if (s.includes(oldConnect)) s = s.replace(oldConnect, newConnect);

const oldSend = "async function sendNative(){if(!ADDRESS_RE.test(sendTo)||!sendAmount)return setNotice('Enter a valid recipient and ETH amount');await executeTx({from:account,to:sendTo,value:toHex(sendAmount)},'ETH transfer')}";
const newSend = "async function sendNative(){if(!sendTo||!sendAmount)return setNotice(`Enter a valid ${chain?.symbol||'native asset'} recipient and amount`);if(!isEvmChain(chain)){try{setLoading(true);const h=await sendNativeChain(chain,sendTo,sendAmount);setLoading(false);setNotice(`${chain.name} transfer submitted · ${typeof h==='string'?shorten(h,12,8):'wallet returned a transaction result'}`);return}catch(e){setLoading(false);setNotice(e.message);return}}if(!ADDRESS_RE.test(sendTo))return setNotice('Enter a valid EVM recipient address');await executeTx({from:account,to:sendTo,value:toHex(sendAmount)},`${chain.symbol||'ETH'} transfer`)}";
if (s.includes(oldSend)) s = s.replace(oldSend, newSend);

const oldHealth = "async function checkHealth(){try{const h=await networkHealth(chain);setHealth(h);setNotice(`RPC healthy · block ${h.block} · gas ${fmt(h.gasPrice)}`)}catch(e){setHealth(null);setNotice(`RPC health failed: ${e.message}`)}}";
const newHealth = "async function checkHealth(){try{if(!isEvmChain(chain)){const a=adapterStatus(chain);setHealth(a);setNotice(a.available?`${chain.name} adapter detected · ${a.label}`:`${chain.name} wallet adapter not detected`);return}const h=await networkHealth(chain);setHealth(h);setNotice(`RPC healthy · block ${h.block} · gas ${fmt(h.gasPrice)}`)}catch(e){setHealth(null);setNotice(`Network health failed: ${e.message}`)}}";
if (s.includes(oldHealth)) s = s.replace(oldHealth, newHealth);

const oldBuild = "function buildPlan(){try{if(currentIntent==='portfolio'){setMode('portfolio');return}if(currentIntent==='faucet'){setMode('faucet');return}if(currentIntent==='gas'){setAction('contract');setNotice('Gas mode: use Contract or Send and KitAgent will simulate the exact transaction fee.');return}if(currentIntent==='send'){const p=parseSend(command);if(!p.address)throw new Error('I need a valid 0x recipient address');setSendTo(p.address);setSendAmount(p.amount||'0.01');if((p.asset||'ETH').toUpperCase()==='ETH')setAction('send');else setAction('send');return}if(['swap','bridge','defi','nft','contract','batch'].includes(currentIntent)){setAction(currentIntent);return}setAction('contract')}catch(e){setNotice(e.message)}}";
const newBuild = "function buildPlan(){try{if(currentIntent==='portfolio'){setMode('portfolio');return}if(currentIntent==='faucet'){setMode('faucet');return}if(currentIntent==='gas'){setAction('contract');setNotice(isEvmChain(chain)?'Gas mode: KitAgent will simulate the exact EVM transaction fee.':`${chain.name} fee mode: use the native wallet adapter for network-specific fees.`);return}if(currentIntent==='send'){const p=parseSend(command);if(p.chain){const target=Object.entries(CHAINS).find(([k,c])=>(c.kind==='evm'?String(c.id):k)===String(p.chain));if(target)setChainKey(target[0])}if(!p.address)throw new Error('I need a valid recipient address');setSendTo(p.address);setSendAmount(p.amount||'0.01');setAction('send');return}if(['swap','bridge','defi','nft','contract','batch'].includes(currentIntent)){setAction(currentIntent);return}if(currentIntent==='revenue'){setMode('revenue');return}setAction('contract')}catch(e){setNotice(e.message)}}";
if (s.includes(oldBuild)) s = s.replace(oldBuild, newBuild);

const oldRouteExec = "async function executeRoute(){if(!route)return;await executeTx(routeTx(route,account),`Route · ${route.toolDetails?.name||route.tool||'aggregator'}`)}";
const newRouteExec = "async function executeRoute(){if(!route)return;const volume=Number(route.action?.fromAmount||route.fromAmount||0)/1e18;const fee=serviceFee(volume);const receipt=await executeTx(routeTx(route,account),`Route · ${route.toolDetails?.name||route.tool||'aggregator'}`);if(receipt)recordUsage({type:'routes',volume,fee})}";
if (s.includes(oldRouteExec)) s = s.replace(oldRouteExec, newRouteExec);

s = s.replace('<strong>{native} <small>ETH</small></strong>', '<strong>{native} <small>{chain?.symbol||chain?.native||\'NATIVE\'}</small></strong>');
s = s.replace('<b>{native} ETH</b>', '<b>{native} {chain?.symbol||chain?.native||\'NATIVE\'}</b>');

const oldNav = "{[['command','command','Command'],['portfolio','wallet','Portfolio'],['activity','activity','Activity'],['faucet','faucet','Gas Station']].map(([m,i,l])=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}><Icon name={i}/><span>{l}</span></button>)}";
const newNav = "{[['command','command','Command'],['portfolio','wallet','Portfolio'],['activity','activity','Activity'],['faucet','faucet','Gas Station'],['revenue','activity','Revenue']].map(([m,i,l])=><button key={m} className={mode===m?'active':''} onClick={()=>setMode(m)}><Icon name={i}/><span>{l}</span></button>)}";
if (s.includes(oldNav)) s=s.replace(oldNav,newNav);
const marker="{mode==='command'&&<><section className=\"hero-row\">";
if(s.includes(marker)&&!s.includes("mode==='revenue'&&<RevenuePanel"))s=s.replace(marker,"{mode==='revenue'&&<RevenuePanel/>}"+marker);

fs.writeFileSync(path, s);
console.log('KitAgent multichain + revenue build transform applied');
