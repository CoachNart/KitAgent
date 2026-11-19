import { closedCandles, validateCandles } from './data.js';
import { analyzeOne, fetchPrice, fetchTf } from './index.js';
import { SMC_MODEL } from './smc.js';

const SCAN_LIMIT=60;
const MAX_PUBLISHED=5;
const MODEL_KEY='SMC';
const MODEL_NAME='Unified Liquidity & Displacement';

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.end(JSON.stringify(payload));
}

export async function topSymbols(){
  let lastError='Bybit market scanner unavailable';
  for(const host of ['https://api.bybit.nl']){
    try{
      const url=new URL('/v5/market/tickers',host);
      url.searchParams.set('category','linear');
      const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok){lastError='Bybit market scanner HTTP '+response.status+' '+response.statusText+' ('+host+')';continue;}
      const body=await response.json();
      if(body.retCode!==0){lastError='Bybit market scanner retCode '+body.retCode+': '+(body.retMsg||'unknown provider error');continue;}
      const symbols=(body.result?.list||[])
        .filter(x=>/USDT$/.test(x.symbol)&&Number(x.lastPrice)>0&&Number(x.turnover24h)>0)
        .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h))
        .slice(0,SCAN_LIMIT)
        .map(x=>({symbol:x.symbol,turnover24h:Number(x.turnover24h)}));
      if(symbols.length)return symbols;
      lastError='Bybit returned no eligible USDT perpetual tickers ('+host+')';
    }catch(error){lastError='Bybit market scanner request failed ('+host+'): '+(error?.message||error);}
  }
  throw new Error(lastError);
}

export async function candlesFor(symbol){
  const [context,execution]=await Promise.all([
    fetchTf('perpetual',symbol,'4H'),
    fetchTf('perpetual',symbol,'1H')
  ]);
  return {
    '4H':closedCandles(context,'4H'),
    '1H':closedCandles(execution,'1H')
  };
}

export function candidateScore(result){
  if(!result?.trade||!result?.grade)return -1;
  if(result.direction==='BULLISH'&&!(result.trade.stop<result.trade.entry&&result.trade.target>result.trade.entry))return -1;
  if(result.direction==='BEARISH'&&!(result.trade.stop>result.trade.entry&&result.trade.target<result.trade.entry))return -1;
  if(!['A+','A'].includes(result.grade.grade)||Number(result.grade.score)<84)return -1;
  const rr=Number(result.trade.rr)||0;
  if(!Number.isFinite(rr)||rr<3)return -1;
  return Number(result.grade.score)*100+Math.min(rr,8)*2;
}

function toSetup(market,result,price){
  const rankScore=candidateScore(result);
  if(rankScore<0)return null;
  const trade=result.trade;
  return {
    id:market.symbol+'-'+MODEL_KEY+'-1H',
    symbol:market.symbol.replace(/USDT$/,'/USDT'),
    providerSymbol:market.symbol,
    strategy:MODEL_NAME,
    strategyKey:MODEL_KEY,
    model:SMC_MODEL,
    bias:result.direction==='BULLISH'?'LONG':'SHORT',
    timeframe:'1H',
    grade:result.grade.grade,
    score:result.grade.score,
    confidence:result.grade.score,
    entry:trade.entry,
    plannedEntry:trade.plannedEntry??null,
    orderType:trade.orderType||'MARKET',
    marketEntry:trade.marketEntry??price.last,
    entryReason:trade.entryReason||null,
    stopLoss:trade.stop,
    takeProfit:trade.target,
    targetSource:trade.targetSource||null,
    targetSelection:trade.targetSelection||null,
    sweepAgeBars:Number.isFinite(trade.sweepAgeBars)?trade.sweepAgeBars:null,
    sweepTime:Number.isFinite(trade.sweepTime)?trade.sweepTime:null,
    rr:Number(trade.rr.toFixed(2)),
    regime:result.regime,
    evidence:result.evidence||[],
    strategyDetails:result.smc||null,
    layers:result.layers||[],
    structureDirection:result.structure?.direction||result.direction,
    source:'Bybit linear perpetuals',
    rankScore
  };
}

export async function scanSymbol(market,diagnostics=null){
  try{
    const [price,all]=await Promise.all([
      fetchPrice('perpetual',market.symbol),
      candlesFor(market.symbol)
    ]);
    for(const tf of ['4H','1H']){
      const validation=validateCandles(all[tf],tf);
      if(!validation.valid){
        if(diagnostics){
          diagnostics.marketDataFailures=(diagnostics.marketDataFailures||0)+1;
          diagnostics.rejections.push({symbol:market.symbol,timeframe:tf,reasons:validation.failures});
        }
        return [];
      }
    }
    const result=await analyzeOne('perpetual',market.symbol,MODEL_KEY,'1H',all,price.last,price);
    if(diagnostics){
      diagnostics.evaluations=(diagnostics.evaluations||0)+1;
      if(result.trade)diagnostics.tradeCandidates=(diagnostics.tradeCandidates||0)+1;
    }
    const setup=toSetup(market,result,price);
    if(!setup&&diagnostics){
      diagnostics.rejections.push({
        symbol:market.symbol,
        timeframe:'1H',
        reasons:(result.failures||result.grade?.hardFailures||['Unified model did not produce a qualifying setup']).slice(0,4)
      });
    }
    return setup?[setup]:[];
  }catch(error){
    if(diagnostics){
      diagnostics.marketDataFailures=(diagnostics.marketDataFailures||0)+1;
      diagnostics.rejections.push({symbol:market.symbol,timeframe:'4H/1H',reasons:[error?.message||String(error)]});
    }
    return [];
  }
}

export async function scanTopQuality(){
  const diagnostics={evaluations:0,tradeCandidates:0,marketDataFailures:0,rejections:[]};
  const markets=await topSymbols();
  // Expand opportunity coverage across the liquid Bybit USDT-perpetual universe
  // without firing every candle request simultaneously. Bounded batches avoid
  // turning a broader scan into a burst of provider rate-limit failures.
  const scanned=[];
  const batchSize=6;
  for(let offset=0;offset<markets.length;offset+=batchSize){
    const batch=markets.slice(offset,offset+batchSize);
    scanned.push(...await Promise.all(batch.map(market=>scanSymbol(market,diagnostics))));
  }
  const setups=scanned.flat().sort((a,b)=>b.rankScore-a.rankScore).slice(0,MAX_PUBLISHED);
  const topRejections=diagnostics.rejections.slice(0,25);
  return {
    generatedAt:new Date().toISOString(),
    scanUniverse:markets.length,
    setups,
    source:'Bybit linear perpetuals',
    model:SMC_MODEL,
    analysisTimeframes:['4H','1H'],
    diagnostics:{
      evaluations:diagnostics.evaluations,
      tradeCandidates:diagnostics.tradeCandidates,
      marketDataFailures:diagnostics.marketDataFailures,
      rejectionSamples:topRejections
    }
  };
}

// The former per-user scanner is retired. All users consume the centrally published board.
export default async function handler(req,res){
  return json(res,410,{
    ok:false,
    error:'Personal scanner has been retired. Use the shared Daily Setups board.',
    code:'PERSONAL_SCANNER_RETIRED'
  });
}
