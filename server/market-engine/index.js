import {authenticate,requireActiveAccess} from '../access.js';
import {normalizeRows,closedCandles,validateCandles,aggregate,EXECUTION_TIMEFRAMES,roundPrice} from './data.js';
import {structure} from './structure.js';
import {liquidityMap} from './liquidity.js';
import {keyLevels} from './levels.js';
import {regime} from './regime.js';
import {evaluateStrategy,STRATEGIES} from './strategies.js';
import {grade,noTrade} from './grading.js';
const BYBIT={'15m':'15','30m':'30','1H':'60','2H':'120','4H':'240'};
const CHAIN={ '15m':['4H','2H','1H','30m','15m'], '30m':['4H','2H','1H','30m'], '1H':['4H','2H','1H'], '2H':['4H','2H'], '4H':['4H'] };
function json(res,status,p){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(p))}
export async function bybitCandles(symbol,tf){const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/kline');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);u.searchParams.set('interval',BYBIT[tf]);u.searchParams.set('limit','300');const r=await fetch(u);if(!r.ok)throw new Error('Bybit candles unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit candles unavailable');return normalizeRows(b.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
export async function bybitInstruments(){const u=new URL('https://api.bybit.com/v5/market/instruments-info');u.searchParams.set('category','linear');u.searchParams.set('status','Trading');u.searchParams.set('limit','1000');const r=await fetch(u);if(!r.ok)throw new Error('Bybit instruments unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit instruments unavailable');return (b.result?.list||[]).filter(x=>x.status==='Trading'&&x.quoteCoin==='USDT').map(x=>({symbol:x.symbol.replace(/USDT$/,'/USDT'),name:x.baseCoin?`${x.baseCoin} / USDT Perpetual`:x.symbol,type:'CRYPTO_PERPETUAL',providerSymbol:x.symbol,baseCoin:x.baseCoin,quoteCoin:x.quoteCoin}));}
export async function fetchTf(market,symbol,tf){if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');return bybitCandles(symbol,tf)}
export async function fetchPrice(market,symbol){if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/tickers');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);const r=await fetch(u);if(!r.ok)throw new Error('Bybit live price unavailable');const b=await r.json(),x=b?.result?.list?.[0];if(b?.retCode!==0||!x)throw new Error(b?.retMsg||'Bybit live price unavailable');const bid=+x.bid1Price,ask=+x.ask1Price,last=+x.lastPrice,mid=bid>0&&ask>0?(bid+ask)/2:last;if(!Number.isFinite(mid)||mid<=0)throw new Error('Bybit live price unavailable');return{bid,ask,mid,time:new Date(Number(b.time||Date.now())).toISOString(),marketState:'open',stale:false,spread:Math.max(0,ask-bid)}}
function plan(tf){if(tf==='AUTO')return EXECUTION_TIMEFRAMES; if(!EXECUTION_TIMEFRAMES.includes(tf))throw new Error('Execution timeframe must be 15m, 30m, 1H, 2H, 4H, or AUTO');return CHAIN[tf]}
function tfFor(strategy){return strategy==='MSNR'?['4H','2H','1H','30m','15m']:null}
function rejection(candles, level, tolerance, direction){
  const last=candles?.at(-1);
  if(!last||!Number.isFinite(level)||!Number.isFinite(tolerance))return false;
  const touched=last.low<=level+tolerance&&last.high>=level-tolerance;
  if(!touched)return false;
  return direction==='BULLISH'
    ? last.close>last.open&&last.close>=level
    : direction==='BEARISH'
      ? last.close<last.open&&last.close<=level
      : false;
}
function enrichExecution(candles,layers,price){
 const c=candles,s=structure(c),l=liquidityMap(c),lv=keyLevels(c),x=c.at(-1),dir=s.direction,a=s.atr||Math.max(price*.001,1e-9);
 let pullback=null,breakout=null,retest=null,msnrLevel=null,priceActionLevel=null,crt=null;
 if(dir!=='NEUTRAL'){
  const hs=s.swings.highs,ls=s.swings.lows,hi=hs.at(-1),lo=ls.at(-1);
  if(hi&&lo){
   const leg=Math.abs(hi.price-lo.price);
   const lo38=Math.min(hi.price,lo.price)+leg*.382,hi62=Math.min(hi.price,lo.price)+leg*.618;
   const inRetrace=dir==='BULLISH'?price<=hi.price&&price>=lo38&&price<=hi62:price>=lo.price&&price>=lo38&&price<=hi62;
   if(leg>=a*1.5&&inRetrace){const plannedLevel=dir==='BULLISH'?hi62:lo38;pullback={level:plannedLevel,marketPrice:price,impulse:leg,retracementZone:[lo38,hi62]};}
  }
  // Breakout/retest is anchored to a confirmed structural swing, not a
  // rolling high/low that changes every candle. The old implementation used the
  // current rolling boundary for both the breakout and retest, which made a
  // retest impossible on the same candle and usually disappeared on the next.
  const rangePrior=c.slice(-26,-1);
  const rangeAvg=rangePrior.length?rangePrior.reduce((q,z)=>q+z.high-z.low,0)/rangePrior.length:a;
  const compressed=rangePrior.slice(-8).every(z=>(z.high-z.low)<=rangeAvg*1.15);
  const externalLevels=dir==='BULLISH'?s.external.highs:s.external.lows;
  const lastRange=x.high-x.low;
  const displaced=lastRange>=rangeAvg*1.2&&Math.abs(x.close-x.open)/(lastRange||1)>=.55;
  const candidates=[];
  for(const level of externalLevels.slice(-12).reverse()){
   const brokeAt=[...c.keys()].reverse().find(i=>
     i>level.confirmationIndex &&
     (dir==='BULLISH'?c[i].close>level.price:c[i].close<level.price)
   );
   if(!Number.isInteger(brokeAt))continue;
   const after=c.slice(brokeAt+1);
   if(!after.length)continue;
   let retestIndex=-1,retestCandle=null;
   for(let j=0;j<after.length;j++){
    const z=after[j];
    const touched=z.low<=level.price+a*.25&&z.high>=level.price-a*.25;
    const held=touched&&(dir==='BULLISH'?z.close>=level.price:z.close<=level.price);
    const rejected=held&&(dir==='BULLISH'?z.close>z.open:z.close<z.open);
    if(held&&rejected){retestIndex=brokeAt+1+j;retestCandle=z;break;}
   }
   if(retestIndex<0)continue;
   const age=c.length-1-retestIndex;
   if(age>8)continue;
   const continuation=c.slice(retestIndex+1);
   const current=x;
   const currentRange=current.high-current.low;
   const currentBody=Math.abs(current.close-current.open);
   const currentDisplacement=currentRange>=a*1.05&&currentBody/(currentRange||1)>=.5;
   const currentContinuation=dir==='BULLISH'
     ? current.close>current.open&&current.close>=Math.max(level.price,retestCandle.high)
     : current.close<current.open&&current.close<=Math.min(level.price,retestCandle.low);
   const currentAccepted=dir==='BULLISH'?current.close>level.price:current.close<level.price;
   const confirmedNow=age===0
     ? (dir==='BULLISH'?current.close>current.open:current.close<current.open)
     : currentAccepted&&currentContinuation&&currentDisplacement;
   if(!confirmedNow)continue;
   const retestExtreme=dir==='BULLISH'
     ?Math.min(...c.slice(retestIndex, c.length).map(z=>z.low))
     :Math.max(...c.slice(retestIndex, c.length).map(z=>z.high));
   candidates.push({level:level.price,breakIndex:brokeAt,retestIndex,after,age,retestExtreme});
  }
  const latestRetest=candidates[0];
  if(latestRetest){
   retest={level:latestRetest.level,index:latestRetest.retestIndex,invalidation:latestRetest.retestExtreme};
   breakout={level:latestRetest.level,index:latestRetest.breakIndex};
  }
  msnrLevel=lv.find(z=>z.fresh&&!z.consumed&&Math.abs(z.level-price)<=Math.max(a,price*.0025));
  priceActionLevel=lv.find(z=>Math.abs(z.level-price)<=Math.max(a,price*.0025));
  const msnRReact=msnrLevel&&rejection(c,msnrLevel.level,Math.max(a*.35,price*.001),dir);
  const paReact=priceActionLevel&&rejection(c,priceActionLevel.level,Math.max(a*.35,price*.001),dir);
  const parent=layers.find(q=>q.tf==='4H')?.candles?.at(-1)||layers[0]?.candles?.at(-1)||x;
  if(parent){
   const start=c.findIndex(z=>z.time>parent.time),sweepStart=start<0?Math.max(0,c.length-12):start;
   for(let i=sweepStart;i<c.length;i++){
    const k=c[i];
    if(dir==='BULLISH'&&k.low<parent.low&&k.close>parent.low){const later=c.slice(i+1);if(later.some(z=>z.close>k.high)||k.close>parent.low)crt={sweep:{level:parent.low,extreme:k.low,index:i,age:c.length-1-i},reclaim:true,target:parent.high,invalidation:k.low,entryZone:parent.low};}
    if(dir==='BEARISH'&&k.high>parent.high&&k.close<parent.high){const later=c.slice(i+1);if(later.some(z=>z.close<k.low)||k.close<parent.high)crt={sweep:{level:parent.high,extreme:k.high,index:i,age:c.length-1-i},reclaim:true,target:parent.low,invalidation:k.high,entryZone:parent.high};}
   }
  }
  if(msnRReact)msnrLevel={...msnrLevel,reaction:true};if(paReact)priceActionLevel={...priceActionLevel,reaction:true};
 }
 return {candles:c,structure:s,liquidity:l,levels:lv,regime:regime(c,s),pullback,breakout,retest,msnrLevel,msnrReaction:!!msnrLevel?.reaction,priceActionLevel,priceActionReaction:!!priceActionLevel?.reaction,crt,entry:price};
}
export async function analyzeOne(market,symbol,strategy,tf,allCandles,price){
 const order=CHAIN[tf],layers=order.map(x=>({tf:x,candles:allCandles[x],structure:structure(allCandles[x]),liquidity:liquidityMap(allCandles[x])}));
 const execution=enrichExecution(allCandles[tf],layers,price);
 const result=evaluateStrategy({strategy,layers,execution,price});
 const hard=[];
 for(const l of layers){const v=validateCandles(l.candles, l.tf);if(!v.valid)hard.push(l.tf+': '+v.failures.join(', '));}
 if(hard.length)return {tf,direction:'NEUTRAL',grade:noTrade(hard),failures:hard,evidence:[]};
 const features={htfAlignment:layers.filter(x=>x.structure.direction===result.direction).length>=Math.min(2,layers.length),structureClarity:execution.structure.direction!=='NEUTRAL',liquidity:!!execution.liquidity.pools.length||!!execution.liquidity.recentSweep.length,location:!!(execution.pullback||execution.msnrLevel||execution.priceActionLevel||execution.crt),confirmation:!!(execution.structure.mss||execution.structure.choch||execution.structure.bos),target:!!result.trade?.target,rr:result.trade?.rr||0,hardFailures:result.failures};
 const g=result.failures.length?noTrade(result.failures):grade(features);
 return {tf,direction:result.direction,grade:g,trade:result.trade,evidence:result.evidence,failures:result.failures,debug:{hardFilters:result.failures,structure:execution.structure,regime:execution.regime,liquidity:execution.liquidity,levels:execution.levels,entry:result.trade?.entry||null,stop:result.trade?.stop||null,target:result.trade?.target||null,rr:result.trade?.rr||null},layers:layers.map(x=>({tf:x.tf,direction:x.structure.direction,state:x.structure.state,bos:x.structure.bos,choch:x.structure.choch,mss:x.structure.mss})),regime:execution.regime,structure:execution.structure,liquidity:execution.liquidity,marketContext:{executionDirection:execution.structure.direction,protectedHigh:execution.structure.protectedHigh?.price??null,protectedLow:execution.structure.protectedLow?.price??null,latestBOS:execution.structure.bos?{direction:execution.structure.bos.direction,level:execution.structure.bos.level,age:execution.structure.bos.age??null}:null,latestCHoCH:execution.structure.choch?{direction:execution.structure.choch.direction,level:execution.structure.choch.level,age:execution.structure.choch.age??null}:null,latestMSS:execution.structure.mss?{direction:execution.structure.mss.direction,level:execution.structure.mss.level,age:execution.structure.mss.age??null}:null}};
}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 if(String(req.query?.action||'')==='instruments'){try{const market=String(req.query.market||'perpetual').toLowerCase();if(market!=='perpetual')return json(res,400,{ok:false,error:'KitSetups supports Crypto Perpetuals only'});return json(res,200,{ok:true,instruments:await bybitInstruments()})}catch(e){return json(res,502,{ok:false,error:e.message})}}
 if(String(req.query?.action||'')==='header'){try{const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT'];const rows=[];for(const symbol of symbols){try{const u=new URL('https://api.bybit.com/v5/market/tickers');u.searchParams.set('category','linear');u.searchParams.set('symbol',symbol);const r=await fetch(u);const b=await r.json();const x=b?.result?.list?.[0];if(x)rows.push({symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt})}catch{}}return json(res,200,{ok:true,result:rows})}catch(e){return json(res,502,{ok:false,error:e.message})}}
 try{
  const auth=await authenticate(req);await requireActiveAccess(auth.uid);
  const market=String(req.query.market||'perpetual').toLowerCase(),symbol=String(req.query.symbol||'').trim().toUpperCase(),strategy=String(req.query.strategy||'TOP_DOWN').toUpperCase().replace(/[-\s]/g,'_'),requested=String(req.query.timeframe||'AUTO');
  if(market!=='perpetual')return json(res,400,{ok:false,error:'KitSetups supports Crypto Perpetuals only'});
  if(!STRATEGIES[strategy])return json(res,400,{ok:false,error:'Unsupported strategy'});
  if(!symbol)return json(res,400,{ok:false,error:'Missing symbol'});
  if(requested!=='AUTO'&&!EXECUTION_TIMEFRAMES.includes(requested))return json(res,400,{ok:false,error:'Execution timeframe must be 15m, 30m, 1H, 2H, 4H, or AUTO'});
  const price=await fetchPrice(market,symbol),tfs=requested==='AUTO'?EXECUTION_TIMEFRAMES:[requested];
  const needed=[...new Set(tfs.flatMap(tf=>CHAIN[tf]))],all={};
  for(const tf of needed){const raw=await fetchTf(market,symbol,tf);all[tf]=closedCandles(raw,tf);const v=validateCandles(all[tf],tf);if(!v.valid)throw new Error(tf+': '+v.failures.join(', '));}
  const results=[];for(const tf of tfs)results.push(await analyzeOne(market,symbol,strategy,tf,all,price.mid));
  const viable=results.filter(x=>['A+','A','B'].includes(x.grade.grade)&&x.trade&&(
    x.direction==='BULLISH' ? x.trade.stop < x.trade.entry && x.trade.target > x.trade.entry :
    x.direction==='BEARISH' ? x.trade.stop > x.trade.entry && x.trade.target < x.trade.entry : false
  ));
  viable.sort((a,b)=>b.grade.score-a.grade.score||b.trade.rr-a.trade.rr);
  const best=viable[0]||null;
  const setup=best?{tradeReady:true,setupStatus:'TRADE READY',strategy,strategyName:STRATEGIES[strategy].name,directionBias:best.direction,bias:best.direction==='BULLISH'?'LONG':'SHORT',entry:roundPrice(best.trade.entry),stopLoss:roundPrice(best.trade.stop),takeProfit1:roundPrice(best.trade.target),takeProfit2:null,riskReward:'1:'+best.trade.rr.toFixed(2),riskRewardValue:+best.trade.rr.toFixed(2),orderType:best.trade.orderType||'MARKET',marketEntry:roundPrice(best.trade.marketEntry??price.mid),entryReason:best.trade.entryReason||null,confidence:best.grade.score,quality:best.grade.grade,entryTimeframe:best.tf,analysisTimeframes:CHAIN[best.tf],higherTimeframe:CHAIN[best.tf][0],middleTimeframe:CHAIN[best.tf].at(-2),marketRegime:best.regime,strategyEvidence:best.evidence,strategyFailures:[],structuralInvalidation:best.trade.invalidation,invalidationSource:best.trade.invalidationSource||null,strategyReason:'All required strategy conditions passed.',tradeBreakdown:{direction:best.direction==='BULLISH'?'LONG':'SHORT',timeframe:best.tf,analysisTimeframes:CHAIN[best.tf],structure:best.structure,marketContext:best.marketContext,trade:best.trade,orderType:best.trade.orderType||'MARKET',entryReason:best.trade.entryReason||null,invalidationSource:best.trade.invalidationSource||null},debug:{selectedTimeframe:best.tf,candidates:results.map(x=>({timeframe:x.tf,grade:x.grade,failures:x.failures,structure:x.structure,regime:x.regime,liquidity:x.liquidity,marketContext:x.marketContext}))},structureEvidence:{layers:best.layers,liquidity:best.liquidity,protectedHigh:best.structure.protectedHigh?.price,protectedLow:best.structure.protectedLow?.price,latestBOS:best.marketContext?.latestBOS||null,latestCHoCH:best.marketContext?.latestCHoCH||null,latestMSS:best.marketContext?.latestMSS||null}}:{tradeReady:false,setupStatus:'NO TRADE',strategy,strategyName:STRATEGIES[strategy].name,directionBias:'WAIT',bias:'WAIT',entry:null,stopLoss:null,takeProfit1:null,takeProfit2:null,riskReward:'—',riskRewardValue:null,orderType:'NO_SETUP',confidence:0,quality:'NO-TRADE',entryTimeframe:requested==='AUTO'?'AUTO':requested,analysisTimeframes:requested==='AUTO'?EXECUTION_TIMEFRAMES:CHAIN[requested],strategyEvidence:results.flatMap(x=>x.evidence).slice(0,8),strategyFailures:[...new Set(results.flatMap(x=>x.failures))].slice(0,8),strategyReason:'No execution timeframe contains a complete strategy thesis with valid structure, confirmation, invalidation, target and minimum 2R.',debug:{selectedTimeframe:null,candidates:results.map(x=>({timeframe:x.tf,grade:x.grade,failures:x.failures,structure:x.structure,regime:x.regime,liquidity:x.liquidity}))}};
  return json(res,200,{ok:true,market,symbol,timeframe:requested,strategy,strategyInfo:STRATEGIES[strategy],setup,quote:price,executionCandidates:results.map(x=>({timeframe:x.tf,grade:x.grade.grade,score:x.grade.score,direction:x.direction,failures:x.failures,evidence:x.evidence,regime:x.regime,layers:x.layers})),generatedAt:new Date().toISOString(),source:'Bybit linear perpetuals'});
 }catch(e){return json(res,500,{ok:false,error:e?.message||'Market analysis failed',code:e?.code||'MARKET_ENGINE_ERROR'})}
}
