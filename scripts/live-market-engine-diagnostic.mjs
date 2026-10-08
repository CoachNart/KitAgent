import { bybitInstruments, fetchTf, fetchPrice, analyzeOne } from '../server/market-engine/index.js';
import { closedCandles, validateCandles, EXECUTION_TIMEFRAMES } from '../server/market-engine/data.js';
import { STRATEGIES } from '../server/market-engine/strategies.js';

const LIMIT=12;
const failures=new Map();
const status=new Map();

function bump(map,key){map.set(key,(map.get(key)||0)+1);}
function addFailure(strategy,tf,message){
  const clean=String(message||'Unknown rejection').trim();
  bump(failures,`${strategy}|${tf}|${clean}`);
}
function addStatus(strategy,tf,result){
  const key=`${strategy}|${tf}`;
  const x=status.get(key)||{evaluations:0,trade:0,A:0,Aplus:0,noTrade:0,directions:{BULLISH:0,BEARISH:0,NEUTRAL:0}};
  x.evaluations++;
  if(result.trade)x.trade++;
  if(result.grade?.grade==='A')x.A++;
  if(result.grade?.grade==='A+')x.Aplus++;
  if(result.grade?.grade==='NO-TRADE')x.noTrade++;
  x.directions[result.direction]=(x.directions[result.direction]||0)+1;
  status.set(key,x);
}

const instruments=await bybitInstruments();
const ranked=instruments
  .filter(x=>x.providerSymbol)
  .slice()
  .sort((a,b)=>String(a.providerSymbol).localeCompare(String(b.providerSymbol)));
const symbols=ranked.slice(0,LIMIT);
if(!symbols.length)throw new Error('No Bybit perpetual instruments available');

console.log('LIVE ENGINE DIAGNOSTIC');
console.log('Symbols:',symbols.map(x=>x.providerSymbol).join(', '));

for(const market of symbols){
  const symbol=market.providerSymbol;
  let price;
  try{price=await fetchPrice('perpetual',symbol);}catch(error){
    console.log(`PRICE ERROR ${symbol}: ${error?.message||error}`);
    continue;
  }
  const all={};
  for(const tf of [...new Set([...EXECUTION_TIMEFRAMES,'1D'])]){
    try{
      all[tf]=closedCandles(await fetchTf('perpetual',symbol,tf),tf);
      const valid=validateCandles(all[tf],tf);
      if(!valid.valid)console.log(`DATA ERROR ${symbol} ${tf}: ${valid.failures.join('; ')}`);
    }catch(error){
      console.log(`DATA ERROR ${symbol} ${tf}: ${error?.message||error}`);
    }
  }

  for(const strategy of Object.keys(STRATEGIES)){
    for(const tf of EXECUTION_TIMEFRAMES){
      try{
        const result=await analyzeOne('perpetual',symbol,strategy,tf,all,price.last);
        addStatus(strategy,tf,result);
        if(!result.trade){
          const reasons=result.failures?.length?result.failures:['No trade returned without an explicit failure'];
          for(const reason of reasons.slice(0,8))addFailure(strategy,tf,reason);
        }
      }catch(error){
        addFailure(strategy,tf,`EXCEPTION: ${error?.message||error}`);
      }
    }
  }
}

console.log('\nRESULT MATRIX');
for(const strategy of Object.keys(STRATEGIES)){
  for(const tf of EXECUTION_TIMEFRAMES){
    const x=status.get(`${strategy}|${tf}`)||{evaluations:0,trade:0,A:0,Aplus:0,noTrade:0,directions:{}};
    console.log(`${strategy.padEnd(10)} ${tf.padEnd(3)} eval=${x.evaluations} trade=${x.trade} A+=${x.Aplus} A=${x.A} noTrade=${x.noTrade} dir=${JSON.stringify(x.directions)}`);
  }
}

console.log('\nTOP REJECTION REASONS');
const rows=[...failures.entries()].sort((a,b)=>b[1]-a[1]).slice(0,80);
for(const [key,count] of rows){
  const [strategy,tf,...reason]=key.split('|');
  console.log(`${String(count).padStart(3)}x ${strategy.padEnd(10)} ${tf.padEnd(3)} ${reason.join('|')}`);
}

const totalTrades=[...status.values()].reduce((n,x)=>n+x.trade,0);
console.log(`\nTOTAL TRADE CANDIDATES: ${totalTrades}`);
if(totalTrades===0)process.exitCode=2;
