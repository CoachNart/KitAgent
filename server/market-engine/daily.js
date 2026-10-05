import { authenticate, requireActiveAccess } from '../access.js';
import { aggregate, closedCandles, validateCandles, EXECUTION_TIMEFRAMES } from './data.js';
import { STRATEGIES } from './strategies.js';
import { analyzeOne, fetchPrice, fetchTf } from './index.js';

const SCAN_LIMIT = 18;
const MIN_PUBLISHED = 5;

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
  const [m15Raw,h1Raw,h4Raw]=await Promise.all([
    fetchTf('perpetual',symbol,'15m'),
    fetchTf('perpetual',symbol,'1H'),
    fetchTf('perpetual',symbol,'4H')
  ]);
  const m15=closedCandles(m15Raw,'15m');
  const h1=closedCandles(h1Raw,'1H');
  const h4=closedCandles(h4Raw,'4H');
  return {'15m':m15,'30m':aggregate(m15,'30m'),'1H':h1,'2H':aggregate(h1,'2H'),'4H':h4};
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
  // A symbol gets one primary setup for the daily board. This prevents five
  // variants of the same coin from consuming the day's slots.
  setups=setups.slice(0,10);
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

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{ok:false,error:'Method not allowed'});
  try{
    const auth=await authenticate(req);
    await requireActiveAccess(auth.uid);
    const result=await dailySetups();
    return json(res,200,{ok:true,...result});
  }catch(e){
    return json(res,500,{ok:false,error:e?.message||'Daily setup scan failed',code:'DAILY_SETUP_SCAN_ERROR'});
  }
}
