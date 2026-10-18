import {normalizeRows,closedCandles,EXECUTION_TIMEFRAMES} from '../server/market-engine/data.js';
import {analyzeOne} from '../server/market-engine/index.js';
import {STRATEGIES} from '../server/market-engine/strategies.js';

const DURATIONS={'30m':30*60_000,'1H':60*60_000,'2H':2*60*60_000,'4H':4*60*60_000,'1D':24*60*60_000};
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return i<0?[x.replace(/^--/,''),'true']:[x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
const symbols=String(args.symbols||'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,BNBUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,SUIUSDT').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
const bars=Math.max(5,Math.min(240,Number(args.bars)||20));
const roundTripCostBps=Math.max(0,Math.min(100,Number(args['round-trip-cost-bps']??10)));
const requested=String(args.timeframes||EXECUTION_TIMEFRAMES.join(',')).split(',').map(x=>x.trim()).filter(x=>EXECUTION_TIMEFRAMES.includes(x));
const strategies=Object.keys(STRATEGIES);
const stats=new Map();
const failures=new Map();
const allResults=[];
let loadedSymbols=0;
const keyOf=(strategy,tf)=>strategy+'|'+tf;
function bucket(strategy,tf){
  const key=keyOf(strategy,tf);
  if(!stats.has(key))stats.set(key,{strategy,timeframe:tf,evaluated:0,gradeA:0,gradeAplus:0,tradeCandidates:0,wins:0,losses:0,missed:0,ambiguous:0,unresolved:0,grossR:0,netR:0,returns:[]});
  return stats.get(key);
}
function rejection(strategy,tf,reason){
  const key=strategy+'|'+tf+'|'+String(reason||'No executable setup').slice(0,180);
  failures.set(key,(failures.get(key)||0)+1);
}
function hit(c,price){return c.low<=price&&c.high>=price;}
function directionStopTouched(c,direction,stop){return direction==='BULLISH'?c.low<=stop:c.high>=stop;}
function directionTargetTouched(c,direction,target){return direction==='BULLISH'?c.high>=target:c.low<=target;}
function simulate(trade,direction,orderType,future){
  const entry=Number(trade.entry),stop=Number(trade.stop),target=Number(trade.target);
  if(![entry,stop,target].every(Number.isFinite))return{result:'unresolved'};
  let active=String(orderType).toUpperCase()==='MARKET';
  for(const c of future){
    if(!active){
      const entryTouched=hit(c,entry);
      const invalidated=direction==='BULLISH'?c.low<=stop:c.high>=stop;
      const targetTouched=direction==='BULLISH'?c.high>=target:c.low<=target;
      if(!entryTouched&&invalidated)return{result:'missed'};
      if(!entryTouched)continue;
      if(invalidated||targetTouched)return{result:'ambiguous'};
      active=true;
      continue; // A limit activation candle cannot also establish the exit order.
    }
    const stopHit=direction==='BULLISH'?c.low<=stop:c.high>=stop;
    const targetHit=direction==='BULLISH'?c.high>=target:c.low<=target;
    if(stopHit&&targetHit)return{result:'ambiguous'};
    if(stopHit)return{result:'loss',exit:stop};
    if(targetHit)return{result:'win',exit:target};
  }
  return{result:active?'unresolved':'missed'};
}
function rMultiple(trade,direction,exit){
  const risk=Math.abs(Number(trade.entry)-Number(trade.stop));
  if(!(risk>0))return 0;
  return (direction==='BULLISH'?exit-Number(trade.entry):Number(trade.entry)-exit)/risk;
}
function fingerprint(t,direction){
  return [direction,t.orderType,Number(t.entry).toPrecision(10),Number(t.stop).toPrecision(10),Number(t.target).toPrecision(10)].join('|');
}

async function fetchReplayCandles(symbol,tf){
  // Research-only historical feed. The production/live engine remains Bybit-only.
  const intervals={'30m':'30m','1H':'1H','2H':'2H','4H':'4H','1D':'1D'};
  const url=new URL('https://www.okx.com/api/v5/market/candles');
  url.searchParams.set('instId',symbol.replace(/USDT$/,'-USDT-SWAP'));
  url.searchParams.set('bar',intervals[tf]);
  url.searchParams.set('limit','300');
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('OKX perpetual historical candles HTTP '+response.status+' '+response.statusText);
  const payload=await response.json();
  if(payload.code!=='0'||!Array.isArray(payload.data)||!payload.data.length)throw new Error('OKX historical candles error: '+(payload.msg||payload.code||'no candles'));
  return payload.data.map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]);
}

console.log('KITAGENT HISTORICAL MARKET REPLAY');
console.log('Research candle source: OKX USDT-swap public candles (offline replay only; live engine remains Bybit-only).');
console.log('Symbols:',symbols.join(', '),'| snapshots per timeframe:',bars,'| round-trip cost assumption:',roundTripCostBps,'bps');
console.log('Method: each signal sees only candles closed at its decision timestamp; outcome uses only later candles. Intrabar TP/SL ambiguity is not guessed.');
for(const symbol of symbols){
  let history;
  try{
    const tfs=[...EXECUTION_TIMEFRAMES,'1D'];
    const rows=await Promise.all(tfs.map(async tf=>[tf,closedCandles(normalizeRows(await fetchReplayCandles(symbol,tf)),tf)]));
    history=Object.fromEntries(rows);
    loadedSymbols++;
  }catch(error){
    console.error('DATA ERROR',symbol,error?.message||error);
    continue;
  }
  for(const tf of requested){
    const exec=history[tf]||[];
    const start=Math.max(40,exec.length-bars);
    const snapshots=exec.slice(start);
    const seen=new Map();
    for(const candle of snapshots){
      const cutoff=candle.time+DURATIONS[tf];
      const all={};
      for(const layerTf of [...EXECUTION_TIMEFRAMES,'1D']){
        all[layerTf]=(history[layerTf]||[]).filter(x=>x.time+DURATIONS[layerTf]<=cutoff);
      }
      if(!all[tf]||all[tf].length<40)continue;
      for(const strategy of strategies){
        const stat=bucket(strategy,tf);stat.evaluated++;
        let result;
        try{result=await analyzeOne('perpetual',symbol,strategy,tf,all,candle.close);}
        catch(error){rejection(strategy,tf,'EXCEPTION: '+(error?.message||error));continue;}
        if(!result.trade||!['A','A+'].includes(result.grade?.grade)){
          for(const reason of (result.failures||[]).slice(0,2))rejection(strategy,tf,reason);
          if(result.trade&&result.grade?.grade==='A')stat.gradeA++;
          if(result.trade&&result.grade?.grade==='A+')stat.gradeAplus++;
          continue;
        }
        if(result.grade.grade==='A')stat.gradeA++;
        if(result.grade.grade==='A+')stat.gradeAplus++;
        const trade=result.trade;
        const fp=fingerprint(trade,result.direction),previous=seen.get(strategy+'|'+fp);
        if(previous!=null&&cutoff-previous<DURATIONS[tf]*3)continue;
        seen.set(strategy+'|'+fp,cutoff);
        stat.tradeCandidates++;
        const future=exec.filter(x=>x.time>=cutoff);
        const outcome=simulate(trade,result.direction,trade.orderType,future);
        if(outcome.result==='ambiguous'){stat.ambiguous++;continue;}
        if(outcome.result==='missed'){stat.missed++;continue;}
        if(outcome.result==='unresolved'){stat.unresolved++;continue;}
        const gross=rMultiple(trade,result.direction,outcome.exit);
        const riskPct=Math.abs(Number(trade.entry)-Number(trade.stop))/Math.abs(Number(trade.entry));
        const costR=riskPct>0?(roundTripCostBps/10000)/riskPct:0;
        const net=gross-costR;
        if(outcome.result==='win')stat.wins++;else stat.losses++;
        stat.grossR+=gross;stat.netR+=net;stat.returns.push(net);
        allResults.push({symbol,strategy,tf,result:outcome.result,netR:net,cutoff});
      }
    }
  }
}

const rows=[...stats.values()].map(s=>{
  const resolved=s.wins+s.losses;
  const mean=s.returns.length?s.netR/s.returns.length:0;
  let equity=0,peak=0,maxDrawdown=0;
  for(const r of s.returns){equity+=r;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
  return{strategy:s.strategy,timeframe:s.timeframe,evaluated:s.evaluated,gradeA:s.gradeA,gradeAplus:s.gradeAplus,candidates:s.tradeCandidates,resolved,wins:s.wins,losses:s.losses,winRatePct:resolved?+(100*s.wins/resolved).toFixed(2):null,avgGrossR:resolved?+(s.grossR/resolved).toFixed(3):null,avgNetR:resolved?+mean.toFixed(3):null,ambiguous:s.ambiguous,missed:s.missed,unresolved:s.unresolved,maxDrawdownR:+maxDrawdown.toFixed(3)};
});
console.table(rows);
console.log('\nTOP REJECTIONS');
console.table([...failures.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([reason,count])=>({count,reason})));
const totalResolved=rows.reduce((n,x)=>n+x.resolved,0);
const totalWins=rows.reduce((n,x)=>n+x.wins,0);
const totalLosses=rows.reduce((n,x)=>n+x.losses,0);
const totalNetR=[...stats.values()].reduce((n,x)=>n+x.netR,0);
const averageNetR=totalResolved?totalNetR/totalResolved:null;
console.log('\nSUMMARY',JSON.stringify({
  symbols,requestedTimeframes:requested,barsPerTimeframe:bars,roundTripCostBps,
  evaluated:rows.reduce((n,x)=>n+x.evaluated,0),
  candidates:rows.reduce((n,x)=>n+x.candidates,0),
  resolved:totalResolved,wins:totalWins,losses:totalLosses,
  winRatePct:totalResolved?+(100*totalWins/totalResolved).toFixed(2):null,
  averageNetR:averageNetR===null?null:+averageNetR.toFixed(3),
  note:'Exploratory historical replay, not a profitability guarantee. Excludes funding, partial fills, spread-specific bid/ask fills, and exchange-specific fee tiers.'
},null,2));
if(loadedSymbols===0){
  console.error('REPLAY FAILED: no historical candle data was loaded; refusing to report an empty replay as a successful test.');
  process.exitCode=1;
}else if(totalResolved<30){
  console.error('REPLAY NOT VALIDATED: fewer than 30 unambiguous resolved trades; insufficient evidence to call the engine ready.');
  process.exitCode=1;
}else if(averageNetR<=0){
  console.error('REPLAY FAILED: net expectancy after the configured round-trip cost is not positive; do not treat the current setup engine as ready.');
  process.exitCode=1;
}
