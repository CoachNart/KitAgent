import admin from 'firebase-admin';
import fs from 'node:fs';
import { authenticate, requireActiveAccess } from '../access.js';
import { aggregate, closedCandles, validateCandles, EXECUTION_TIMEFRAMES } from './data.js';
import { STRATEGIES } from './strategies.js';
import { analyzeOne, fetchPrice, fetchTf } from './index.js';

const SCAN_LIMIT = 18;
const MIN_PUBLISHED = 5;
const SCAN_WINDOW_MS = 24*60*60*1000;
const AUTO_DOC = 'scanner/daily';
function getAdmin(){if(admin.apps.length)return admin;const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,path=process.env.GOOGLE_APPLICATION_CREDENTIALS;if(raw){admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw.trim().replace(/^['\"]|['\"]$/g,'')))});return admin}if(path&&fs.existsSync(path)){admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(path,'utf8')))});return admin}throw Object.assign(new Error('Firebase Admin credentials are missing.'),{code:'FIREBASE_ADMIN_CREDENTIALS_MISSING'})}
function toMs(v){if(!v)return 0;if(typeof v.toMillis==='function')return v.toMillis();if(typeof v.toDate==='function')return v.toDate().getTime();if(typeof v==='number')return v;const n=Date.parse(v);return Number.isFinite(n)?n:0}

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(payload));
}

function dayKey(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const get=k=>parts.find(x=>x.type===k)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function topSymbols(){
  const u=new URL('https://api.bybit.com/v5/market/tickers');
  u.searchParams.set('category','linear');
  const r=await fetch(u);
  if(!r.ok)throw new Error('Bybit market scanner unavailable');
  const b=await r.json();
  if(b.retCode!==0)throw new Error(b.retMsg||'Bybit market scanner unavailable');
  return (b.result?.list||[])
    .filter(x=>/USDT$/.test(x.symbol)&&Number(x.lastPrice)>0&&Number(x.turnover24h)>0)
    .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h))
    .slice(0,SCAN_LIMIT)
    .map(x=>({symbol:x.symbol,turnover24h:Number(x.turnover24h)}));
}

async function candlesFor(symbol){
  // Use the same native Bybit execution candles as Market Analysis.
  // Do not synthesize 30m/2H from lower timeframes: that can make the
  // Scanner and Market Analysis disagree about the exact same structure.
  const [m15Raw,m30Raw,h1Raw,h2Raw,h4Raw]=await Promise.all([
    fetchTf('perpetual',symbol,'15m'),
    fetchTf('perpetual',symbol,'30m'),
    fetchTf('perpetual',symbol,'1H'),
    fetchTf('perpetual',symbol,'2H'),
    fetchTf('perpetual',symbol,'4H')
  ]);
  return {
    '15m':closedCandles(m15Raw,'15m'),
    '30m':closedCandles(m30Raw,'30m'),
    '1H':closedCandles(h1Raw,'1H'),
    '2H':closedCandles(h2Raw,'2H'),
    '4H':closedCandles(h4Raw,'4H')
  };
}

function candidateScore(result){
  if(!result?.trade||!result?.grade)return -1;
  if(result.direction==='BULLISH' && !(result.trade.stop<result.trade.entry && result.trade.target>result.trade.entry))return -1;
  if(result.direction==='BEARISH' && !(result.trade.stop>result.trade.entry && result.trade.target<result.trade.entry))return -1;
  if(!['A+','A','B'].includes(result.grade.grade))return -1;
  const rr=Number(result.trade.rr)||0;
  return result.grade.score*100+Math.min(rr,6)*8;
}

function toSetup(market,strategy,result,price){
  const score=candidateScore(result);
  if(score<0)return null;
  const trade=result.trade;
  const bias=result.direction==='BULLISH'?'LONG':'SHORT';
  return {
    id:`${market.symbol}-${strategy}-${result.tf}`,
    symbol:market.symbol.replace(/USDT$/,'/USDT'),
    providerSymbol:market.symbol,
    strategy:STRATEGIES[strategy]?.name||strategy,
    strategyKey:strategy,
    bias,
    timeframe:result.tf,
    grade:result.grade.grade,
    score:result.grade.score,
    confidence:result.grade.score,
    entry:trade.entry,
    orderType:trade.orderType||'MARKET',
    marketEntry:trade.marketEntry??price.mid,
    entryReason:trade.entryReason||null,
    stopLoss:trade.stop,
    takeProfit:trade.target,
    rr:Number(trade.rr.toFixed(2)),
    regime:result.regime,
    evidence:result.evidence||[],
    layers:result.layers||[],
    structureDirection:result.structure?.direction||result.direction,
    liquidity:result.liquidity?.recentSweep?.length||0,
    generatedFor:dayKey(),
    source:'Bybit linear perpetuals',
    rankScore:score
  };
}

async function scanSymbol(market){
  try{
    const price=await fetchPrice('perpetual',market.symbol);
    const all=await candlesFor(market.symbol);
    const valid=Object.entries(all).every(([tf,c])=>validateCandles(c,tf).valid);
    if(!valid)return [];
    const candidates=[];
    for(const [strategy] of Object.entries(STRATEGIES)){
      for(const tf of EXECUTION_TIMEFRAMES){
        try{
          const result=await analyzeOne('perpetual',market.symbol,strategy,tf,all,price.mid);
          const setup=toSetup(market,strategy,result,price);
          if(setup)candidates.push(setup);
        }catch{}
      }
    }
    return candidates.sort((a,b)=>b.rankScore-a.rankScore);
  }catch{return []}
}

export async function dailySetups(){
  const markets=await topSymbols();
  const scanned=await Promise.all(markets.map(scanSymbol));
  const flat=scanned.flat();
  const bestBySymbol=new Map();
  for(const setup of flat){
    const existing=bestBySymbol.get(setup.symbol);
    if(!existing||setup.rankScore>existing.rankScore)bestBySymbol.set(setup.symbol,setup);
  }
  let setups=[...bestBySymbol.values()].sort((a,b)=>b.rankScore-a.rankScore);
  // The Daily Setups board has a hard five-setup publication cap.
  // A symbol gets one primary setup, then only the top five qualified symbols
  // are published. Never expose 6–10 setups and never manufacture weak ones.
  setups=setups.slice(0,MIN_PUBLISHED);
  return {
    dayKey:dayKey(),
    generatedAt:new Date().toISOString(),
    target:MIN_PUBLISHED,
    published:setups.length,
    scanUniverse:markets.length,
    setups,
    source:'Bybit linear perpetuals',
    status:setups.length>=MIN_PUBLISHED?'TARGET_MET':'QUALITY_SET_BELOW_TARGET'
  };
}

async function runAutoScan(){
  const ref=getAdmin().firestore().doc(AUTO_DOC),now=Date.now();
  const snap=await ref.get(),current=snap.exists?snap.data():{},generatedAt=toMs(current.generatedAt);
  if(current.scanState==='running'&&now-toMs(current.scanStartedAt)<15*60*1000)return {ok:false,code:'SCAN_IN_PROGRESS',error:'The automatic daily scanner is already running.'};
  if(generatedAt&&now-generatedAt<SCAN_WINDOW_MS&&Array.isArray(current.setups))return {ok:true,source:'auto',...current,remainingMs:SCAN_WINDOW_MS-(now-generatedAt)};
  await ref.set({scanState:'running',scanStartedAt:new Date().toISOString(),dayKey:dayKey()},{merge:true});
  try{const result=await dailySetups();await ref.set({...result,scanState:'ready',scanMode:'automatic',persistedAt:new Date().toISOString()},{merge:true});return {ok:true,source:'auto',...result,remainingMs:SCAN_WINDOW_MS};}
  catch(error){await ref.set({scanState:'idle',lastError:String(error?.message||error),lastErrorAt:new Date().toISOString()},{merge:true});throw error;}
}
async function runManualScan(uid){
  const db=getAdmin().firestore(),ref=db.collection('users').doc(uid).collection('scanner').doc('usage'),now=Date.now();
  const reservation=await db.runTransaction(async tx=>{const snap=await tx.get(ref),last=snap.exists?toMs(snap.data()?.lastManualScanAt):0,remaining=last?SCAN_WINDOW_MS-(now-last):0;if(remaining>0)return {allowed:false,remainingMs:remaining};tx.set(ref,{lastManualScanAt:new Date(now).toISOString(),lastManualScanId:String(now),updatedAt:new Date(now).toISOString()},{merge:true});return {allowed:true,remainingMs:SCAN_WINDOW_MS};});
  if(!reservation.allowed)return {ok:false,code:'MANUAL_SCAN_CONSUMED',error:'Your scanner scan for this 24-hour period has already been used.',remainingMs:reservation.remainingMs};
  try{const result=await dailySetups();return {ok:true,source:'manual',...result,remainingMs:SCAN_WINDOW_MS};}
  catch(error){await ref.set({lastManualScanAt:null,lastManualScanId:null,updatedAt:new Date().toISOString()},{merge:true});throw error;}
}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'Method not allowed'});
  try{
    const mode=new URL(req.url||'', 'http://localhost').searchParams.get('mode')||'auto',cronAuth=String(req.headers.authorization||''),isCron=Boolean(process.env.CRON_SECRET)&&cronAuth==='Bearer '+process.env.CRON_SECRET;
    if(isCron){const result=await runAutoScan();return json(res,result.ok?200:409,result);}
    const auth=await authenticate(req);await requireActiveAccess(auth.uid);
    const usageRef=getAdmin().firestore().collection('users').doc(auth.uid).collection('scanner').doc('usage'),usageSnap=await usageRef.get(),lastManual=usageSnap.exists?toMs(usageSnap.data()?.lastManualScanAt):0,manualRemainingMs=lastManual?Math.max(0,SCAN_WINDOW_MS-(Date.now()-lastManual)):0;
    if(mode==='manual'){const result=await runManualScan(auth.uid);return json(res,result.ok?200:429,result);}
    const result=await runAutoScan();return json(res,result.ok?200:409,{...result,manualRemainingMs});
  }catch(e){return json(res,500,{ok:false,error:e?.message||'Daily setup scan failed',code:'DAILY_SETUP_SCAN_ERROR'});
  }
}
