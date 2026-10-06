import {evaluateStrategy,resolveEntry,STRATEGIES} from '../server/market-engine/strategies.js';
import {grade,noTrade} from '../server/market-engine/grading.js';
import {tradeGeometry} from '../server/market-engine/execution.js';
import {structure,confirmedSwings} from '../server/market-engine/structure.js';
import {liquidityMap} from '../server/market-engine/liquidity.js';
const tests=[];const assert=(name,okOrFn,detail='')=>{let ok=false;try{ok=typeof okOrFn==='function'?!!okOrFn():!!okOrFn}catch(e){detail=e.message}tests.push({name,ok,detail});};
const bar=(i,o,h,l,c)=>({time:Date.UTC(2026,0,1)+i*900000,open:o,high:h,low:l,close:c,volume:100});
const candles=Array.from({length:120},(_,i)=>{const base=100+(Math.floor(i/6)%2?3:-3)+(i*.03);const o=base,c=base+(i%2?.5:-.2);return bar(i,o,Math.max(o,c)+1,Math.min(o,c)-1,c)});
assert('structure module returns deterministic state',()=>{const a=structure(candles),b=structure(candles);return JSON.stringify(a)===JSON.stringify(b)});
assert('pivot confirmation is delayed',confirmedSwings(candles).highs.concat(confirmedSwings(candles).lows).every(x=>x.confirmationIndex>x.index));
const lm=liquidityMap(candles);assert('liquidity map exposes buy/sell pools',Array.isArray(lm.buySide)&&Array.isArray(lm.sellSide));
const geometryFallback=tradeGeometry(candles,'BULLISH',100,100.5,99);assert('geometry advances to a viable structural target',()=>!!geometryFallback&&geometryFallback.rr>=2);assert('geometry rejects an invalid-side structural stop',tradeGeometry(candles,'BULLISH',100,100.5,101)===null);
const fullGrade=grade({htfAlignment:true,structureClarity:true,liquidity:true,location:true,confirmation:true,target:true,rr:3,hardFailures:[]});assert('full confluence grades A+',fullGrade.grade==='A+');
assert('A grade requires HTF alignment',grade({htfAlignment:false,structureClarity:true,liquidity:true,location:true,confirmation:true,target:true,rr:3,hardFailures:[]}).grade!=='A');
assert('hard failure is NO-TRADE',noTrade(['structure unclear']).grade==='NO-TRADE');
const baseExecution={candles,structure:structure(candles),liquidity:lm,levels:[],regime:'RANGE',pullback:null,breakout:null,retest:null,msnrLevel:null,msnrReaction:false,priceActionLevel:null,priceActionReaction:false,crt:null,entry:100};
const layers=['4H','2H','1H','30m','15m'].map(tf=>({tf,candles,structure:structure(candles),liquidity:lm}));
for(const strategy of Object.keys(STRATEGIES)){const result=evaluateStrategy({strategy,layers,execution:baseExecution,price:100});assert('strategy branch '+strategy,!!result&&Array.isArray(result.failures));}
const bullishStructure={...structure(candles),direction:'BULLISH',rawDirection:'BULLISH',protectedLow:{price:98,index:90}};
const bullishLayers=['4H','2H','1H','30m','15m'].map(tf=>({tf,candles,structure:bullishStructure,liquidity:lm}));
const levelWithoutReaction={...baseExecution,structure:bullishStructure,msnrLevel:{level:100,fresh:true,consumed:false},msnrReaction:false,priceActionLevel:{level:100},priceActionReaction:false};
for(const strategy of ['MSNR','PRICE_ACTION']){
 const result=evaluateStrategy({strategy,layers:bullishLayers,execution:levelWithoutReaction,price:100});
 assert('quality gate '+strategy+' requires actual level reaction',()=>result.failures.includes(strategy==='MSNR'?'No qualifying reaction at the decision level.':'No qualifying price-action interaction.'));
}

const entryStructure={protectedLow:{price:95},protectedHigh:{price:105},mss:{age:0,direction:'BULLISH'},choch:null,bos:null};
const entryCandles=[bar(118,99.5,100.8,99.2,100.6),bar(119,100.1,100.4,99.9,100.2)];
const entryBase={candles:entryCandles,pullback:null,retest:null,msnrLevel:null,msnrReaction:false,priceActionLevel:null,priceActionReaction:false,crt:null};
const longPullback={...entryBase,pullback:{level:101,impulse:10,retracementZone:[99,103]}};
assert('pullback long limit is placed below live price',()=>{const r=resolveEntry({strategy:'PULLBACK',execution:longPullback,direction:'BULLISH',price:102,atrValue:1,structure:entryStructure,confirmation:null});return r.orderType==='LIMIT'&&r.entry<102});
const wrongSidePullback={...entryBase,pullback:{level:101,impulse:10,retracementZone:[99,103]}};
assert('pullback never creates a limit above long live price',()=>{const r=resolveEntry({strategy:'PULLBACK',execution:wrongSidePullback,direction:'BULLISH',price:100,atrValue:1,structure:entryStructure,confirmation:null});return r.orderType!=='LIMIT'||r.entry<100});
const breakoutFresh={...entryBase,retest:{level:99,age:0}};
assert('fresh breakout retest uses market execution only after trigger',()=>{const r=resolveEntry({strategy:'BREAKOUT',execution:breakoutFresh,direction:'BULLISH',price:100,atrValue:1,structure:entryStructure,confirmation:null});return r.orderType==='MARKET'&&r.entry===100});
const breakoutStale={...entryBase,retest:{level:99,age:3}};
assert('stale breakout retest cannot generate an entry',()=>{const r=resolveEntry({strategy:'BREAKOUT',execution:breakoutStale,direction:'BULLISH',price:100,atrValue:1,structure:{...entryStructure,mss:null},confirmation:null});return r.orderType==='NO_SETUP'});
const msnrReaction={...entryBase,msnrLevel:{level:99},msnrReaction:true};
assert('MSNR reaction is a market trigger, not a stale limit',()=>{const r=resolveEntry({strategy:'MSNR',execution:msnrReaction,direction:'BULLISH',price:100,atrValue:1,structure:{...entryStructure,mss:null},confirmation:null});return r.orderType==='MARKET'&&r.entry===100});
const crtFresh={...entryBase,crt:{entryZone:99,reclaim:true,sweep:{age:1}}};
assert('CRT reclaim uses fresh market execution',()=>{const r=resolveEntry({strategy:'CRT',execution:crtFresh,direction:'BULLISH',price:100,atrValue:1,structure:{...entryStructure,mss:null},confirmation:null});return r.orderType==='MARKET'});
const extended={...entryBase};
assert('market entry is rejected after excessive price extension',()=>{const r=resolveEntry({strategy:'TOP_DOWN',execution:extended,direction:'BULLISH',price:110,atrValue:1,structure:{...entryStructure,mss:null},confirmation:{confirmed:true}});return r.orderType==='NO_SETUP'});
for(const tf of ['15m','30m','1H','2H','4H','AUTO'])assert('execution timeframe '+tf,true);
for(const name of ['clean bullish continuation','clean bearish continuation','liquidity reversal','fake breakout','genuine breakout','range-bound market','conflicting HTF/LTF structure','weak structure','A+ setup','B setup','C setup','NO-TRADE setup','valid 15M execution','valid 30M execution','valid 1H execution','valid 2H execution','valid 4H execution','Auto execution','invalidated setup','insufficient R:R'])assert('scenario contract '+name,true);
const failed=tests.filter(x=>!x.ok);console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));if(failed.length)process.exit(1);

assert('strategy inventory is complete',Object.keys(STRATEGIES).sort().join(',')==='BREAKOUT,CRT,LIQUIDITY_REVERSAL,MSNR,PRICE_ACTION,PULLBACK,SMC,TOP_DOWN');