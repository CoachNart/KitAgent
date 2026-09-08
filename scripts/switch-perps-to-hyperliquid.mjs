import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const repo='src/PerpetualsPage.jsx';
const oldCommit='1b6ce33f010d2aecf3f7490462e3504bbef0892c';
const old=execFileSync('git',['show',`${oldCommit}:${repo}`],{encoding:'utf8'});
const marker='return <div className="page-wrap ka-perps">';
const cut=old.indexOf(marker);
if(cut<0) throw new Error('Exact legacy perpetual terminal UI marker was not found.');
let tail=old.slice(cut);
tail=tail
 .replaceAll('Bybit connected','Hyperliquid connected')
 .replaceAll('Connect Bybit','Connect wallet')
 .replaceAll('Search all Bybit perpetuals…','Search all Hyperliquid perpetuals…')
 .replaceAll('Connect Bybit to see positions.','Connect wallet to see positions.')
 .replaceAll('Connect Bybit to see orders.','Connect wallet to see orders.')
 .replaceAll('Connect Bybit to see history.','Connect wallet to see history.')
 .replaceAll('Connect Bybit to trade','Connect wallet to trade')
 .replaceAll('Trading executes on your Bybit derivatives account. Use an API key with trading permission only — never enable withdrawals.','Trading executes on Hyperliquid. Your wallet signs trading actions; KitSetups never asks for your private key.')
 .replace('<h3>Connect wallet</h3><p>Use a Bybit API key with derivatives trading permission. Withdrawal permission is not required.</p><label>API key<input value={apiKey} onChange={e=>setApiKey(e.target.value)} autoComplete="off"/></label><label>API secret<input type="password" value={apiSecret} onChange={e=>setApiSecret(e.target.value)} autoComplete="off"/></label><button className="connect-main" onClick={connect}>Connect trading account</button>','<h3>Connect wallet</h3><p>Connect your MetaMask or another injected EVM wallet. Trading actions are signed by your wallet.</p><button className="connect-main" onClick={connect}>Connect wallet</button>');

const prefix=String.raw`import {useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,ChevronDown,KeyRound,LogOut,RefreshCw,Share2,X} from 'lucide-react';
import {ExchangeClient,HttpTransport} from '@nktkas/hyperliquid';
import {createWalletClient,custom} from 'viem';
import {arbitrum} from 'viem/chains';

const TF={"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","6h":"4h","12h":"4h","1d":"1d","1w":"1w"};
const HL='https://api.hyperliquid.xyz/info';
const BUILDER='0x2E5c7Cb21bA789cFE815e3471fCc1CBEd6680Cc9';
const BUILDER_FEE=10;
const info=body=>fetch(HL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j?.error||('Hyperliquid request failed ('+r.status+')'));return j});
const n=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const usd=v=>Number.isFinite(Number(v))?'$'+n(v,2):'—';
const clean=v=>String(v??'').replace(/[^0-9.]/g,'');
const stepDown=(v,d)=>{const x=Number(v),p=10**Number(d||0);return x>0?Math.floor(x*p+1e-10)/p:0};
function Field({label,value,setValue,suffix}){return <label className="pf"><span>{label}</span><div><input inputMode="decimal" value={value} onChange={e=>setValue(clean(e.target.value))} placeholder="0.00"/><small>{suffix}</small></div></label>}

export default function PerpetualsPage(){
 const [markets,setMarkets]=useState([]),[symbol,setSymbol]=useState('BTC'),[query,setQuery]=useState(''),[picker,setPicker]=useState(false),[tf,setTf]=useState('5m');
 const [ticker,setTicker]=useState(null),[candles,setCandles]=useState([]),[asks,setAsks]=useState([]),[bids,setBids]=useState([]),[trades,setTrades]=useState([]),[funding,setFunding]=useState('');
 const [connected,setConnected]=useState(false),[modal,setModal]=useState(false),[walletClient,setWalletClient]=useState(null),[address,setAddress]=useState('');
 const [apiKey,setApiKey]=useState(''),[apiSecret,setApiSecret]=useState('');
 const [balance,setBalance]=useState(null),[positions,setPositions]=useState([]),[orders,setOrders]=useState([]),[history,setHistory]=useState([]);
 const [side,setSide]=useState('Buy'),[type,setType]=useState('Market'),[marginMode,setMarginMode]=useState('Cross'),[leverage,setLeverage]=useState(5),[margin,setMargin]=useState('100'),[limit,setLimit]=useState(''),[tp,setTp]=useState(''),[sl,setSl]=useState(''),[reduceOnly,setReduceOnly]=useState(false),[tab,setTab]=useState('positions'),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
 const ws=useRef(null),toast=useRef(null); const infoMarket=markets.find(x=>x.name===symbol); const assetIdx=markets.findIndex(x=>x.name===symbol); const last=Number(ticker?.lastPrice||ticker?.markPx||0); const maxLev=Number(infoMarket?.maxLeverage||50); const szDecimals=Number(infoMarket?.szDecimals??5); const orderValue=(Number(margin)||0)*Number(leverage||1); const qty=stepDown(last?orderValue/last:0,szDecimals); const current=positions.find(p=>p.coin===symbol&&Math.abs(Number(p.szi||0))>0);
 const filtered=useMemo(()=>markets.filter(x=>x.name.toLowerCase().includes(query.toLowerCase())).slice(0,250),[markets,query]);
 const say=x=>{setNotice(x);clearTimeout(toast.current);toast.current=setTimeout(()=>setNotice(''),6000)};
 const ensureWallet=async()=>{if(walletClient)return walletClient;if(!window.ethereum)throw Error('Install MetaMask or another injected EVM wallet first.');const accounts=await window.ethereum.request({method:'eth_requestAccounts'});const a=accounts?.[0];if(!a)throw Error('No wallet account selected.');try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xa4b1'}]})}catch(e){if(e?.code===4902)await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0xa4b1',chainName:'Arbitrum One',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://arb1.arbitrum.io/rpc'],blockExplorerUrls:['https://arbiscan.io']}]});else throw e}const wc=createWalletClient({account:a,chain:arbitrum,transport:custom(window.ethereum)});setWalletClient(wc);setAddress(a);setConnected(true);setModal(false);say('Wallet connected to Hyperliquid.');return wc};
 const exchange=async()=>new ExchangeClient({transport:new HttpTransport(),wallet:await ensureWallet(),signatureChainId:'0xa4b1'});
 const ensureBuilder=async()=>{if(!address)return;const approved=Number(await info({type:'maxBuilderFee',user:address,builder:BUILDER}).catch(()=>0));if(approved>=BUILDER_FEE)return;const ex=await exchange();await ex.approveBuilderFee({maxFeeRate:'0.01%',builder:BUILDER});say('KitSetups fee approval signed. Trading is ready.')};
 const refreshPublic=async()=>{try{const m=await info({type:'metaAndAssetCtxs'});const uni=(m?.[0]?.universe||[]).map(x=>({...x,baseCoin:x.name,leverageFilter:{maxLeverage:x.maxLeverage}}));setMarkets(uni);const i=uni.findIndex(x=>x.name===symbol);const c=m?.[1]?.[i]||{};const mid=Number(c?.midPx||c?.markPx||0);const prev=Number(c?.prevDayPx||0);setTicker({lastPrice:mid,highPrice24h:c?.highPx,lowPrice24h:c?.lowPx,turnover24h:c?.dayNtlVlm,price24hPcnt:prev?((mid-prev)/prev):0});setFunding(c?.funding||'');const [b,k]=await Promise.all([info({type:'l2Book',coin:symbol}),info({type:'candleSnapshot',req:{coin:symbol,interval:tf,startTime:Date.now()-7*86400000,endTime:Date.now()}})]);setAsks((b?.levels?.[1]||[]).map(x=>({price:+x.px,size:+x.sz})));setBids((b?.levels?.[0]||[]).map(x=>({price:+x.px,size:+x.sz})));setCandles((k||[]).map(x=>({time:+x.t,open:+x.o,high:+x.h,low:+x.l,close:+x.c,volume:+x.v})));const tr=await info({type:'recentTrades',coin:symbol}).catch(()=>[]);setTrades((tr||[]).map(x=>({price:+x.px,size:+x.sz,side:x.side})).slice(0,50));if(address){const [s,o,f]=await Promise.all([info({type:'clearinghouseState',user:address}),info({type:'openOrders',user:address}),info({type:'userFills',user:address})]);setBalance(Number(s?.marginSummary?.accountValue||0));setPositions((s?.assetPositions||[]).map(x=>x.position));setOrders(o||[]);setHistory(f||[])}}catch(e){say(e?.message||'Unable to load Hyperliquid data.')}};
 useEffect(()=>{refreshPublic();const t=setInterval(refreshPublic,4000);return()=>clearInterval(t)},[symbol,tf,address]);
 useEffect(()=>{if(markets.length&&!markets.some(x=>x.name===symbol))setSymbol(markets[0].name)},[markets,symbol]);
 useEffect(()=>{try{if(window.ethereum?.selectedAddress){setAddress(window.ethereum.selectedAddress);setConnected(true)}}catch{}},[]);
 useEffect(()=>{try{ws.current?.close()}catch{};const s=new WebSocket('wss://api.hyperliquid.xyz/ws');ws.current=s;s.onopen=()=>{s.send(JSON.stringify({method:'subscribe',subscription:{type:'l2Book',coin:symbol}}));s.send(JSON.stringify({method:'subscribe',subscription:{type:'trades',coin:symbol}}));s.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin:symbol,interval:tf}}));s.send(JSON.stringify({method:'subscribe',subscription:{type:'allMids'}}))};s.onmessage=e=>{try{const m=JSON.parse(e.data||'{}');if(m.channel==='l2Book'){setAsks((m.data?.levels?.[1]||[]).map(x=>({price:+x.px,size:+x.sz})));setBids((m.data?.levels?.[0]||[]).map(x=>({price:+x.px,size:+x.sz})))}else if(m.channel==='trades'){setTrades(x=>[...(m.data||[]).map(x=>({price:+x.px,size:+x.sz,side:x.side})),...x].slice(0,50))}else if(m.channel==='candle'){const z=m.data;if(z){const r={time:+z.t,open:+z.o,high:+z.h,low:+z.l,close:+z.c,volume:+z.v};setCandles(x=>{const a=x.slice(),i=a.findIndex(v=>v.time===r.time);if(i>=0)a[i]=r;else a.push(r);return a.slice(-240)})}}else if(m.channel==='allMids'&&m.data?.mids?.[symbol])setTicker(x=>({...x,lastPrice:m.data.mids[symbol]}))}catch{}};return()=>{try{s.close()}catch{}}},[symbol,tf]);
 const connect=async()=>{try{await ensureWallet();await ensureBuilder()}catch(e){say(e?.message||'Wallet connection failed.')}};
 const disconnect=()=>{setConnected(false);setAddress('');setWalletClient(null);setBalance(null);setPositions([]);setOrders([]);setHistory([]);say('Wallet disconnected.')};
 const setLev=async()=>{if(!connected)return setModal(true);setBusy('lev');try{const ex=await exchange();await ex.updateLeverage({asset:assetIdx,isCross:marginMode==='Cross',leverage:Number(leverage)});say(leverage+'x leverage applied to '+symbol+'.')}catch(e){say(e?.message||'Unable to update leverage.')}finally{setBusy('')}};
 const applyMargin=async()=>{if(!connected)return setModal(true);setBusy('margin');try{const ex=await exchange();await ex.updateLeverage({asset:assetIdx,isCross:marginMode==='Cross',leverage:Number(leverage)});say(marginMode+' margin mode applied.')}catch(e){say(e?.message||'Unable to apply margin mode.')}finally{setBusy('')}};
 const place=async()=>{if(!connected)return setModal(true);if(!(qty>0))return say('Enter a valid margin.');if(type==='Limit'&&!(Number(limit)>0))return say('Enter a valid limit price.');setBusy('order');try{const ex=await exchange();await ensureBuilder();await ex.updateLeverage({asset:assetIdx,isCross:marginMode==='Cross',leverage:Number(leverage)});const order={a:assetIdx,b:side==='Buy',p:String(type==='Limit'?Number(limit):last),s:String(qty),r:Boolean(reduceOnly),t:{limit:{tif:type==='Limit'?'Gtc':'Ioc'}}};const r=await ex.order({orders:[order],grouping:'na',builder:{b:BUILDER,f:BUILDER_FEE}});if(r?.status==='err')throw Error(r?.response||'Hyperliquid rejected the order.');say((side==='Buy'?'Long':'Short')+' order submitted on Hyperliquid.');await refreshPublic()}catch(e){say(e?.message||'Order failed.')}finally{setBusy('')}};
 const cancel=id=>{if(!connected)return setModal(true);setBusy('cancel');exchange().then(ex=>ex.cancel({cancels:[{a:assetIdx,o:Number(id)}]})).then(()=>{say('Order cancelled.');return refreshPublic()}).catch(e=>say(e?.message||'Cancel failed.')).finally(()=>setBusy(''))};
 const cancelAll=()=>{if(!connected)return setModal(true);setBusy('cancel');Promise.all(orders.map(o=>exchange().then(ex=>ex.cancel({cancels:[{a:Number(o.a),o:Number(o.oid)}]})))).then(()=>{say('Open orders cancelled.');return refreshPublic()}).catch(e=>say(e?.message||'Cancel all failed.')).finally(()=>setBusy(''))};
 const close=p=>{if(!connected||!p)return setModal(true);setBusy('close');exchange().then(ex=>ex.order({orders:[{a:assetIdx,b:Number(p.szi)<0,p:String(last),s:String(Math.abs(Number(p.szi))),r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na',builder:{b:BUILDER,f:BUILDER_FEE}})).then(()=>{say('Close order submitted.');return refreshPublic()}).catch(e=>say(e?.message||'Close failed.')).finally(()=>setBusy(''))};
 const share=async()=>{if(!current)return say('No open position to share.');const pnl=Number(current.unrealizedPnl||0);const text='KitSetups Perpetuals · '+current.coin+'-PERP\\n'+(Number(current.szi)>0?'Long':'Short')+' '+(current.leverage?.value||leverage)+'x\\nPnL '+(pnl>=0?'+':'')+usd(pnl)+' · '+n(Math.abs(Number(current.szi)),4)+' contracts\\nEntry '+usd(current.entryPx)+' · Mark '+usd(last);try{if(navigator.share)await navigator.share({title:'KitSetups PnL',text});else await navigator.clipboard.writeText(text);say('PnL copied.')}catch{}};
 const chart=candles.slice(-100);const lo=chart.length?Math.min(...chart.map(x=>x.low)):0;const hi=chart.length?Math.max(...chart.map(x=>x.high)):1;const range=hi-lo||1;
`;
fs.writeFileSync(repo,prefix+tail);
let app=fs.readFileSync('src/App.jsx','utf8');app=app.replace("import PerpetualsPage from './HyperliquidPerpetualsPage.jsx';","import PerpetualsPage from './PerpetualsPage.jsx';");fs.writeFileSync('src/App.jsx',app);
console.log('Exact legacy Bybit-style perpetual terminal restored; Hyperliquid is the execution/data provider.');
