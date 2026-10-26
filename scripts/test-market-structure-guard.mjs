import {applyMarketStructureGuard} from '../server/market-engine/strategies.js';

const assert=(name,condition)=>{
  if(!condition)throw new Error('FAIL: '+name);
  console.log('PASS: '+name);
};
const candidate=()=>({direction:'BULLISH',trade:{entry:100,stop:98,target:106},failures:[]});
const layer=(tf,direction)=>({tf,structure:{direction}});

const aligned=applyMarketStructureGuard(candidate(),[
  layer('4H','BULLISH'),layer('2H','BULLISH'),layer('1H','BULLISH')
]);
assert('Aligned bullish structure allows a bullish candidate',aligned.trade!==null&&aligned.marketStructureGuard?.allowed===true);

const counter=applyMarketStructureGuard(candidate(),[
  layer('4H','BULLISH'),layer('2H','BULLISH'),layer('1H','BEARISH')
]);
assert('Bullish candidate is blocked when execution structure is bearish',counter.trade===null&&counter.direction==='NEUTRAL'&&counter.marketStructureGuard?.reason==='TIMEFRAME_STRUCTURE_CONFLICT');

const counterWithConsistentBearishBias=applyMarketStructureGuard(
  {...candidate(),direction:'BULLISH'},
  [layer('4H','BEARISH'),layer('2H','BEARISH'),layer('1H','BEARISH')]
);
assert('Counter-bias trade is blocked even when every timeframe agrees with each other',counterWithConsistentBearishBias.trade===null&&counterWithConsistentBearishBias.marketStructureGuard?.reason==='TRADE_AGAINST_STRUCTURE');

const mixed=applyMarketStructureGuard(candidate(),[
  layer('4H','BULLISH'),layer('2H','NEUTRAL'),layer('1H','BULLISH')
]);
assert('Neutral transition layer does not overrule aligned directional structure',mixed.trade!==null&&mixed.marketStructureGuard?.allowed===true);

const conflict=applyMarketStructureGuard(candidate(),[
  layer('4H','BULLISH'),layer('2H','BEARISH'),layer('1H','BULLISH')
]);
assert('Conflicting directional timeframes block the setup',conflict.trade===null&&conflict.marketStructureGuard?.reason==='TIMEFRAME_STRUCTURE_CONFLICT');

const unclear=applyMarketStructureGuard(candidate(),[
  layer('4H','NEUTRAL'),layer('2H','NEUTRAL'),layer('1H','NEUTRAL')
]);
assert('No confirmed directional structure means no trade',unclear.trade===null&&unclear.marketStructureGuard?.reason==='NO_DIRECTIONAL_STRUCTURE');

const inferredFromSingleBreak=applyMarketStructureGuard(candidate(),[
  {tf:'4H',structure:{direction:'BULLISH',rawDirection:'NEUTRAL'}},
  {tf:'2H',structure:{direction:'BULLISH',rawDirection:'NEUTRAL'}},
  {tf:'1H',structure:{direction:'BULLISH',rawDirection:'NEUTRAL'}}
]);
assert('A direction inferred from one recent break is not accepted as established bias',inferredFromSingleBreak.trade===null&&inferredFromSingleBreak.marketStructureGuard?.reason==='NO_DIRECTIONAL_STRUCTURE');

const invalidated=applyMarketStructureGuard(candidate(),[
  {tf:'4H',structure:{direction:'NEUTRAL',rawDirection:'BULLISH'}},
  {tf:'2H',structure:{direction:'NEUTRAL',rawDirection:'BULLISH'}},
  {tf:'1H',structure:{direction:'NEUTRAL',rawDirection:'BULLISH'}}
]);
assert('A protected-swing invalidation leaves the layer neutral, not bullish',invalidated.trade===null&&invalidated.marketStructureGuard?.reason==='NO_DIRECTIONAL_STRUCTURE');

const opposingTransition=applyMarketStructureGuard(candidate(),[
  {tf:'4H',structure:{direction:'BULLISH',rawDirection:'BULLISH'}},
  {tf:'2H',structure:{direction:'BULLISH',rawDirection:'BULLISH'}},
  {tf:'1H',structure:{direction:'BEARISH',rawDirection:'NEUTRAL'}}
]);
assert('An unresolved bearish break blocks a bullish setup against the higher-timeframe bias',opposingTransition.trade===null&&opposingTransition.marketStructureGuard?.reason==='TRANSITIONAL_STRUCTURE_CONFLICT');

const noCandidate=applyMarketStructureGuard({direction:'BULLISH',trade:null,failures:['No valid entry']},[
  layer('4H','BEARISH'),layer('2H','BEARISH'),layer('1H','BEARISH')
]);
assert('Guard preserves no-trade diagnostics without rewriting them',noCandidate.trade===null&&noCandidate.failures[0]==='No valid entry');
