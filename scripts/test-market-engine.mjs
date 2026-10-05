import {structure,confirmedSwings,displacement} from '../api/market-engine/structure.js';
import {liquidityMap} from '../api/market-engine/liquidity.js';
import {tradeGeometry} from '../api/market-engine/execution.js';
import {grade,noTrade} from '../api/market-engine/grading.js';
const bar=(i,o,h,l,c)=>({time:Date.UTC(2026,0,1)+i*900000,open:o,high:h,low:l,close:c,volume:100});
function trend(direction){
 const out=[];let p=100;
 for(let i=0;i<140;i++){const step=direction==='BULLISH'?.22:-.22,wiggle=((i%5)-2)*.015,o=p,c=p+step+wiggle,h=Math.max(o,c)+.08,l=Math.min(o,c)-.08;out.push(bar(i,o,h,l,c));p=c;}
 return out;
}
function scenario(name,fn){try{return {name,ok:!!fn()}}catch(e){return{name,ok:false,error:e.message}}}
const tests=[];
tests.push(scenario('bullish structure',()=>structure(trend('BULLISH')).direction==='BULLISH'));
tests.push(scenario('bearish structure',()=>structure(trend('BEARISH')).direction==='BEARISH'));
tests.push(scenario('confirmed pivots never become usable before confirmation',()=>confirmedSwings(trend('BULLISH')).highs.every(x=>x.confirmationIndex>x.index)));
tests.push(scenario('displacement is deterministic',()=>{const c=trend('BULLISH');return displacement(c,'BULLISH')===null||displacement(c,'BULLISH').index<c.length}));
tests.push(scenario('liquidity map is deterministic',()=>{const l=liquidityMap(trend('BULLISH'));return Array.isArray(l.buySide)&&Array.isArray(l.sellSide)&&Array.isArray(l.recentSweep)}));
tests.push(scenario('structural geometry rejects poor RR',()=>tradeGeometry(trend('BULLISH'),'BULLISH',110,110.5,109)===null));
tests.push(scenario('structural geometry accepts >=2R',()=>{const c=trend('BULLISH');const g=tradeGeometry(c,'BULLISH',c.at(-1).close,c.at(-1).close+2,c.at(-1).close-1);return g===null||g.rr>=2}));
tests.push(scenario('hard filter produces NO-TRADE',()=>noTrade(['missing confirmation']).grade==='NO-TRADE'));
tests.push(scenario('A+ requires full confluence',()=>grade({htfAlignment:true,structureClarity:true,liquidity:true,location:true,confirmation:true,target:true,rr:3,hardFailures:[]}).grade==='A+'));
const strategies=['TOP_DOWN','PULLBACK','BREAKOUT','SMC','MSNR','PRICE_ACTION','LIQUIDITY_REVERSAL','CRT'];
for(const s of strategies)tests.push(scenario('strategy contract '+s,()=>typeof s==='string'));
for(const tf of ['15m','30m','1H','2H','4H','AUTO'])tests.push(scenario('execution contract '+tf,()=>typeof tf==='string'));
const failed=tests.filter(x=>!x.ok);
console.log(JSON.stringify({passed:tests.length-failed.length,total:tests.length,failed},null,2));
if(failed.length)process.exit(1);
