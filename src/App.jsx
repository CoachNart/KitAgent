import { useEffect, useState } from 'react';
import './kit-nav.css';
import PerpetualsPage from './PerpetualsPage.jsx';
import SignalHistory from './SignalHistory.jsx';
import HomePage from './HomePage.jsx';
import LessonDetail from './LessonDetail.jsx';
import AccountPageComponent from './AccountPage.jsx';
import AccessGateComponent from './AccessGate.jsx';
import LiveMarketComponent from './LiveMarketPage.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import './ui-polish.css';
import './header-polish.css';
import { Activity, ArrowDownToLine, ArrowRight, BarChart3, Bell, Check, CheckCircle2, ChevronDown, CircleDollarSign, Command, Copy, ExternalLink, Fuel, Gem, History, House, Layers3, LockKeyhole, Menu, Network, Rocket, ScanSearch, Search, Settings2, ShieldAlert, ShieldCheck, Terminal, CircleUserRound, Wallet, X, Zap } from 'lucide-react';

const nav=[['home','Home',House],['market','Market analysis',BarChart3],['defi','Chart terminal',Layers3],['perps','Perpetuals',CircleDollarSign],['history','History',History],['profile','Profile',CircleUserRound]];
const pairs=['BTC/USDT','ETH/USDT','SOL/USDT','XRP/USDT','BNB/USDT','DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','MATIC/USDT','DOT/USDT','TRX/USDT','UNI/USDT','AAVE/USDT','ARB/USDT','OP/USDT','SUI/USDT','PEPE/USDT'];
const timeframes=['1m','5m','15m','30m','1H','4H','1D','1W'];
const appSearchItems=[...pairs.map(value=>({type:'market',label:value,meta:'Market analysis',action:'market'})),...nav.map(([id,label])=>({type:'workspace',label,meta:'Workspace',action:id})),{type:'network',label:'Robinhood Chain',meta:'Network · Mainnet 4663',action:'home'}];
const actions=[{id:'swap-eth',kind:'swap',title:'Swap ETH → USDC',summary:'Prepare a token swap through a supported DEX.',amount:'0.10 ETH',risk:'Market execution · slippage required'},{id:'stake-eth',kind:'stake',title:'Stake ETH',summary:'Prepare an ETH staking deposit.',amount:'0.25 ETH',risk:'Protocol interaction · terms apply'},{id:'bridge-eth',kind:'bridge',title:'Bridge ETH',summary:'Prepare a cross-chain transfer to a supported network.',amount:'0.20 ETH',risk:'Bridge transaction · review destination and fees'}];
const nfts=[['Vault Pass #1842','KitSetups Genesis','0.84 ETH','List for sale'],['Signal #091','Signal Objects','0.31 ETH','Sell NFT'],['Agent Key #402','Agent Keys','0.12 ETH','Transfer NFT']];

export default function App({user}){
  const [profileOverride,setProfileOverride]=useState(null),[headerTicker,setHeaderTicker]=useState({pair:'BTC/USDT',price:'—',change:0,move:'up'}),[page,setPage]=useState('home'),[lessonId,setLessonId]=useState(null),[command,setCommand]=useState(''),[messages,setMessages]=useState([]),[toast,setToast]=useState(''),[activity,setActivity]=useState([]),[pair,setPair]=useState('BTC/USDT'),[tf,setTf]=useState('4H'),[analyzed,setAnalyzed]=useState(false),[appSearch,setAppSearch]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  useEffect(()=>{let cancelled=false;const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT'];const milestones={BTCUSDT:[86000,90000,95000,100000],ETHUSDT:[3000,3200,3500,4000],SOLUSDT:[200,220,250,300],XRPUSDT:[2,2.5,3,3.5],BNBUSDT:[1000,1100,1200],DOGEUSDT:[0.2,0.25,0.3,0.4],ADAUSDT:[1,1.25,1.5,2],AVAXUSDT:[30,40,50,60],LINKUSDT:[25,30,35,40],SUIUSDT:[4,5,6,7]};let i=0,lastPrices={},activeHeadline='',headlineUntil=0;const load=async()=>{try{const r=await fetch('/api/market?action=header',{cache:'no-store'}),j=await r.json(),rows=Array.isArray(j?.result)?j.result:[],data=new Map(rows.map(t=>[t.symbol,t]));if(!data.size||cancelled)return;const symbol=symbols[i],t=data.get(symbol);if(!t){i=(i+1)%symbols.length;return}const price=Number(t.lastPrice),change=Number(t.price24hPcnt)*100,prev=lastPrices[symbol];lastPrices[symbol]=price;const crossed=(milestones[symbol]||[]).find(level=>Number.isFinite(prev)&&((prev<level&&price>=level)||(prev>level&&price<=level)));if(crossed){activeHeadline=price>=crossed?'🚀 '+symbol.replace('USDT','/USDT')+' breaks $'+crossed.toLocaleString():'🔻 '+symbol.replace('USDT','/USDT')+' slips below $'+crossed.toLocaleString();headlineUntil=Date.now()+20000}const headline=Date.now()<headlineUntil?activeHeadline:'';setHeaderTicker({pair:symbol.replace('USDT','/USDT'),price:Number.isFinite(price)?price.toLocaleString(undefined,{maximumFractionDigits:price>=1000?0:price>=1?2:4}):'—',change:Number.isFinite(change)?change:0,move:change>=0?'up':'down',headline});i=(i+1)%symbols.length}catch{}};load();const timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer)}},[]);
  useEffect(()=>{const handler=e=>setProfileOverride(e.detail||null);window.addEventListener('kitsetups:profile-updated',handler);return()=>window.removeEventListener('kitsetups:profile-updated',handler)},[]);
  const displayUser=profileOverride?{...user,...profileOverride}:user;
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3600);return()=>clearTimeout(t)},[toast]);
  const go=p=>{setPage(p);setSearchOpen(false);setAppSearch('')}; const openLesson=id=>{setLessonId(id);setPage('lesson');setSearchOpen(false);setAppSearch('')};
  const searchResults=appSearch.trim()?appSearchItems.filter(x=>`${x.label} ${x.meta}`.toLowerCase().includes(appSearch.trim().toLowerCase())).slice(0,7):[];
  const selectSearchResult=item=>{if(item.type==='market')setPair(item.label);go(item.action);setAppSearch('');setSearchOpen(false)};
  const submitSearch=()=>{if(searchResults[0])selectSearchResult(searchResults[0])};
  const runCommand=raw=>{const text=raw.trim();if(!text)return;setMessages(m=>[...m,{role:'user',text}]);setCommand('');const lower=text.toLowerCase();if(lower.includes('analyze')||lower.includes('btc')||lower.includes('eth')){go('market');setMessages(m=>[...m,{role:'agent',text:`I can analyze ${pair} on ${tf}. Market intelligence is read-only until you explicitly request an execution action.`}]);return}setMessages(m=>[...m,{role:'agent',text:'I can help with market analysis and the KitSetups trading workspace.'}])};
  return <div className="kit-shell"><KitNavigation page={page} go={go}/><main className="kit-main"><div className="app-sticky-rail" aria-label="App controls">
  <div className="app-sticky-brand"><img src="https://i.postimg.cc/B6bHVQnT/Kitsetsup-Logo-PNG.png" alt="KitSetups"/></div>
  <div className={'app-sticky-market '+headerTicker.move} aria-label={'Live '+headerTicker.pair+' price'}>
    <span className="app-sticky-market-dot" aria-hidden="true"/>
    <span className="app-sticky-market-pair" key={headerTicker.pair}>{headerTicker.pair}</span>
    <span className="app-sticky-market-price" key={headerTicker.pair+'-price'}>{headerTicker.price}</span>
    <span className="app-sticky-market-change">{headerTicker.headline||((headerTicker.change>=0?'↗':'↘')+' '+Math.abs(headerTicker.change).toFixed(2)+'%')}</span>
  </div>
  <div className="app-sticky-actions">
    <NotificationCenter user={user} embedded/>
    <div className="header-pulse" aria-label="System pulse"><i className="pulse-green"/><i className="pulse-red"/></div>
    <button type="button" className="profile-avatar" aria-label="Open profile" title="Profile" onClick={()=>go('profile')}><span className="profile-avatar-ring">{(displayUser?.photoURL||displayUser?.photoUrl||displayUser?.avatarUrl)?<img src={displayUser.photoURL||displayUser.photoUrl||displayUser.avatarUrl} alt="" referrerPolicy="no-referrer"/>:<span>{initials(displayUser?.displayName||displayUser?.email||'K')}</span>}</span><i className="profile-status"/></button>
  </div>
</div><div className="content">{page==='home'&&<HomePage go={go} onLesson={openLesson}/>} {page==='lesson'&&<LessonDetail lessonId={lessonId} onBack={()=>go('home')}/>}  {page==='market'&&<AccessGateComponent user={user}><LiveMarketComponent/></AccessGateComponent>} {page==='defi'&&<ChartTerminal/>} {page==='perps'&&<PerpetualsPage user={user}/>} {page==='history'&&<SignalHistory activity={activity}/>} {page==='profile'&&<AccountPageComponent user={user}/>}</div></main>{toast&&<div className="toast"><CheckCircle2 size={16}/><span>{toast}</span></div>}</div>;
}

function KitNavigation({page,go}){
  return <nav className="kit-nav" aria-label="KitSetups navigation">
    <div className="kit-nav-inner" style={{'--nav-index':Math.max(0,nav.findIndex(([id])=>id===page)),'--nav-cell-width':'calc((100% - 34px) / 6)','--nav-pill-width':`${Math.min(116,Math.max(78,66 + String(nav.find(([id])=>id===page)?.[1]||'').length*3.55))}px`}}>
      {nav.map(([id,label,Icon])=><button key={id} type="button" className={page===id?'kit-nav-item active':'kit-nav-item'} aria-current={page===id?'page':undefined} onClick={()=>go(id)}>
        <span className="kit-nav-icon"><Icon size={20}/></span>
        <span className="kit-nav-label">{label}</span>
      </button>)}
    </div>
  </nav>;
}
function MarketPage({pair,setPair,tf,setTf,analyzed,setAnalyzed}){return <div className="page-wrap"><div className="section-intro"><div><span className="tiny-label">INTELLIGENCE LAYER</span><h2>Market analysis</h2><p>Standalone read-only market intelligence. No transaction is created by analysis.</p></div><span className="read-only"><ScanSearch size={13}/> READ ONLY</span></div><div className="analysis-layout"><section className="analysis-card"><div className="analysis-head"><div><span className="tiny-label">MARKET</span><h3>{pair}</h3></div><div className="pair-select"><select value={pair} onChange={e=>setPair(e.target.value)}>{pairs.map(p=><option key={p}>{p}</option>)}</select><select value={tf} onChange={e=>setTf(e.target.value)}>{timeframes.map(t=><option key={t}>{t}</option>)}</select></div></div><div className="chart-placeholder"><div className="chart-grid"/><div className="chart-line"><span/><span/><span/><span/><span/><span/><span/></div><div className="chart-badge">LIVE DATA</div></div><div className="analysis-footer"><span>Last analysis: {analyzed?'just now':'not run'}</span><button onClick={()=>setAnalyzed(true)}><ScanSearch size={13}/> Analyze setup</button></div></section><aside className="analysis-rail"><Metric label="Trend" value={analyzed?'Bullish':'Pending'} accent/><Metric label="Structure" value={analyzed?'Higher highs':'—'}/><Metric label="Momentum" value={analyzed?'Strong':'—'}/><Metric label="Risk" value={analyzed?'Moderate':'—'}/></aside></div></div>}
function Metric({label,value,accent}){return <div className="metric"><small>{label}</small><b className={accent?'accent':''}>{value}</b></div>}
function Step({n,title,text}){return <div className="step"><span>{n}</span><div><b>{title}</b><small>{text}</small></div></div>}
function initials(v){return String(v||'K').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'K'}
