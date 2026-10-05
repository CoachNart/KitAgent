import {authenticate,requireActiveAccess} from '../../server/access.js';
import {yahooCandles,yahooPrice,yahooInstruments} from '../../server/yahooMarket.js';
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
async function bybitCandles(symbol,tf){const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/kline');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);u.searchParams.set('interval',BYBIT[tf]);u.searchParams.set('limit','300');const r=await fetch(u);if(!r.ok)throw new Error('Bybit candles unavailable');const b=await r.json();if(b.retCode!==0)throw new Error(b.retMsg||'Bybit candles unavailable');return normalizeRows(b.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function fetchTf(market,symbol,tf){if(['forex','commodities','indices'].includes(market))return normalizeRows((await yahooCandles(symbol,tf,market)).rows);return bybitCandles(symbol,tf)}
async function fetchPrice(market,symbol){if(['forex','commodities','indices'].includes(market))return yahooPrice(symbol,market);const clean=symbol.replace(/[^A-Z0-9]/gi,'');const u=new URL('https://api.bybit.com/v5/market/tickers');u.searchParams.set('category','linear');u.searchParams.set('symbol',clean);const r=await fetch(u);if(!r.ok)throw new Error('Bybit live price unavailable');const b=await r.json(),x=b?.result?.list?.[0];if(b?.retCode!==0||!x)throw new Error(b?.retMsg||'Bybit live price unavailable');const bid=+x.bid1Price,ask=+x.ask1Price,last=+x.lastPrice,mid=bid>0&&ask>0?(bid+ask)/2:last;if(!Number.isFinite(mid)||mid<=0)throw new Error('Bybit live price unavailable');return{bid,ask,mid,time:new Date(Number(b.time||Date.now())).toISOString(),marketState:'open',stale:false,spread:Math.max(0,ask-bid)}}
function plan(tf){if(tf==='AUTO')return EXECUTION_TIMEFRAMES; if(!EXECUTION_TIMEFRAMES.includes(tf))throw new Error('Execution timeframe must be 15m, 30m, 1H, 2H, 4H, or AUTO');return CHAIN[tf]}
function tfFor(strategy){return strategy==='MSNR'?['4H','2H','1H','30m','15m']:null}
function enrichExecution(candles,layers,price){
 const c=candles,s=structure(c),l=liquidityMap(c),lv=keyLevels(c),x=c.at(-1),dir=s.direction;
 const near=(arr,side)=>arr.filter(z=>side==='BULLISH'?z.level<price:z.level>price).sort((a,b)=>Math.abs(a.level-price)-Math.abs(b.level-price))[0];
 const pb=near(lv,dir);
 let breakout=null,retest=null;
 if(dir!=='NEUTRAL'){
  const boundary=dir==='BULLISH'?Math.max(...c.slice(-25,-1).map(x=>x.high)):Math.min(...c.slice(-25,-1).map(x=>x.low));
  const broke=dir==='BULLISH'?x.close>boundary:x.close<boundary;
  if(broke&&x.high-x.low>=(c.slice(-21,-1).reduce((a,q)=>a+q.high-q.low,0)/20)*1.15)breakout={level:boundary,index:c.length-1};
  if(!breakout){const lastBreak=c.findLastIndex(q=>dir==='BULLISH'?q.close>boundary:q.close<boundary);if(lastBreak>0){const touched=c.slice(lastBreak+1).some(q=>q.low<=boundary&&q.high>=boundary);if(touched)retest={level:boundary,index:c.length-1,invalidation:dir==='BULLISH'?Math.min(...c.slice(lastBreak+1).map(q=>q.low)):Math.max(...c.slice(lastBreak+1).map(q=>q.high))}}}
 }
 const msnrLevel=lv.find(z=>z.fresh&&!z.consumed&&Math.abs(z.level-price)<=Math.max(s.atr||price*.002,price*.003));
 const priceActionLevel=lv.find(z=>Math.abs(z.level-price)<=Math.max(s.atr||price*.002,price*.0025));
 const msnRReact=msnrLevel&&rejection(c,msnrLevel.level,Math.max(s.atr*.35,price*.001),dir);
 const paReact=priceActionLevel&&rejection(c,priceActionLevel.level,Math.max(s.atr*.35,price*.001),dir);
 const parent=layers.find(x=>x.tf!=='15m')?.candles?.at(-1)||c.at(-1);
 const sweep=l.recentSweep[0];
 const crt=sweep?{sweep:sweep,reclaim:true,target:dir==='BULLISH'?parent.high:parent.low,invalidation:sweep.extreme,entryZone:sweep.level}:null;
 return {candles:c,structure:s,liquidity:l,levels:lv,regime:regime(c,s),pullback:pb&&Math.abs(pb.level-price)<=Math.max(s.atr*1.5,price*.006)?{level:pb.level}:null,breakout,retest,msnrLevel,msnrReaction:!!msnRReact,priceActionLevel,priceActionReaction:!!paReact,crt,entry:price};
}
async function analyzeOne(market,symbol,strategy,tf,allCandles,price){
 const order=CHAIN[tf],layers=order.map(x=>({tf:x,candles:allCandles[x],structure:structure(allCandles[x]),liquidity:liquidityMap(allCandles[x])}));
 const execution=enrichExecution(allCandles[tf],layers,price);
 const result=evaluateStrategy({strategy,layers,execution,price});
 const hard=[];
 for(const l of layers){const v=validateCandles(l.candles, l.tf);if(!v.valid)hard.push(l.tf+': '+v.failures.join(', '));}
 if(hard.length)return {tf,direction:'NEUTRAL',grade:noTrade(hard),failures:hard,evidence:[]};
 const features={htfAlignment:layers.filter(x=>x.structure.direction===result.direction).length>=Math.min(2,layers.length),structureClarity:execution.structure.direction!=='NEUTRAL',liquidity:!!execution.liquidity.pools.length||!!execution.liquidity.recentSweep.length,location:!!(execution.pullback||execution.msnrLevel||execution.priceActionLevel||execution.crt),confirmation:!!(execution.structure.mss||execution.structure.choch||execution.structure.bos),target:!!result.trade?.target,rr:result.trade?.rr||0,hardFailures:result.failures};
 const g=result.failures.length?noTrade(result.failures):grade(features);
 return {tf,direction:result.direction,grade:g,trade:result.trade,evidence:result.evidence,failures:result.failures,layers:layers.map(x=>({tf:x.tf,direction:x.structure.direction,state:x.structure.state,bos:x.structure.bos,choch:x.structure.choch,mss:x.structure.mss})),regime:execution.regime,structure:execution.structure,liquidity:execution.liquidity};
}
export default async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 if(String(req.query?.action||'')==='instruments'){try{const market=String(req.query.market||'forex').toLowerCase();return json(res,200,{ok:true,instruments:['forex','commodities','indices'].includes(market)?yahooInstruments(market):[]})}catch(e){return json(res,502,{ok:false,error:e.message})}}
 try{
  const auth=await authenticate(req);await requireActiveAccess(auth.uid);
  const market=String(req.query.market||'forex').toLowerCase(),symbol=String(req.query.symbol||'').trim().toUpperCase(),strategy=String(req.query.strategy||'TOP_DOWN').toUpperCase().replace(/[-\s]/g,'_'),requested=String(req.query.timeframe||'AUTO');
  if(!STRATEGIES[strategy])return json(res,400,{ok:false,error:'Unsupported strategy'});
  if(!symbol)return json(res,400,{ok:false,error:'Missing symbol'});
  const price=await fetchPrice(market,symbol),tfs=requested==='AUTO'?EXECUTION_TIMEFRAMES:[requested];
  const needed=[...new Set(tfs.flatMap(tf=>CHAIN[tf]))],all={};
  for(const tf of needed){const raw=await fetchTf(market,symbol,tf);all[tf]=closedCandles(raw,tf);const v=validateCandles(all[tf],tf);if(!v.valid)throw new Error(tf+': '+v.failures.join(', '));}
  const results=[];for(const tf of tfs)results.push(await analyzeOne(market,symbol,strategy,tf,all,price.mid));
  const viable=results.filter(x=>['A+','A','B'].includes(x.grade.grade)&&x.trade);
  viable.sort((a,b)=>b.grade.score-a.grade.score||b.trade.rr-a.trade.rr);
  const best=viable[0]||null;
  const setup=best?{tradeReady:true,setupStatus:'TRADE READY',strategy,strategyName:STRATEGIES[strategy].name,directionBias:best.direction,bias:best.direction==='BULLISH'?'LONG':'SHORT',entry:roundPrice(best.trade.entry),stopLoss:roundPrice(best.trade.stop),takeProfit1:roundPrice(best.trade.target),takeProfit2:null,riskReward:'1:'+best.trade.rr.toFixed(2),riskRewardValue:+best.trade.rr.toFixed(2),orderType:Math.abs(best.trade.entry-price.mid)<=Math.max((all[best.tf].at(-1)?.close||price.mid)*.001,1e-9)?'MARKET':'LIMIT',confidence:best.grade.score,quality:best.grade.grade,entryTimeframe:best.tf,analysisTimeframes:CHAIN[best.tf],higherTimeframe:CHAIN[best.tf][0],middleTimeframe:CHAIN[best.tf].at(-2),marketRegime:best.regime,strategyEvidence:best.evidence,strategyFailures:[],strategyReason:'All required strategy conditions passed.',structureEvidence:{layers:best.layers,liquidity:best.liquidity,protectedHigh:best.structure.protectedHigh?.price,protectedLow:best.structure.protectedLow?.price}}:{tradeReady:false,setupStatus:'NO TRADE',strategy,strategyName:STRATEGIES[strategy].name,directionBias:'WAIT',bias:'WAIT',entry:null,stopLoss:null,takeProfit1:null,takeProfit2:null,riskReward:'—',riskRewardValue:null,orderType:'NO_SETUP',confidence:0,quality:'NO-TRADE',entryTimeframe:requested==='AUTO'?'AUTO':requested,analysisTimeframes:requested==='AUTO'?EXECUTION_TIMEFRAMES:CHAIN[requested],strategyEvidence:results.flatMap(x=>x.evidence).slice(0,8),strategyFailures:[...new Set(results.flatMap(x=>x.failures))].slice(0,8),strategyReason:'No execution timeframe contains a complete strategy thesis with valid structure, confirmation, invalidation, target and minimum 2R.'};
  return json(res,200,{ok:true,market,symbol,timeframe:requested,strategy,strategyInfo:STRATEGIES[strategy],setup,quote:price,executionCandidates:results.map(x=>({timeframe:x.tf,grade:x.grade.grade,score:x.grade.score,direction:x.direction,failures:x.failures,evidence:x.evidence,regime:x.regime,layers:x.layers})),generatedAt:new Date().toISOString(),source:['forex','commodities','indices'].includes(market)?'Yahoo Finance':'Bybit linear perpetuals'});
 }catch(e){return json(res,500,{ok:false,error:e?.message||'Market analysis failed',code:e?.code||'MARKET_ENGINE_ERROR'})}
}
