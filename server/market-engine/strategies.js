import {displacement} from './structure.js';
import {latestSweep} from './liquidity.js';
import {fvg,orderBlocks,nearestTarget} from './levels.js';
import {executionConfirmation,tradeGeometry} from './execution.js';

function thesisBase(direction){return direction==='BULLISH'||direction==='BEARISH';}
function macroDirection(layers){return layers.find(x=>x.structure.direction!=='NEUTRAL')?.structure.direction||'NEUTRAL';}

function reversalEvidence(execution,macro,execDir){
  if(!thesisBase(execDir)||!thesisBase(macro)||execDir===macro)return false;
  const shift=execution.structure.structureBreak||execution.structure.choch||execution.structure.mss;
  const sweep=execution.liquidity?.recentSweep?.find(x=>
    x.age<=8&&(execDir==='BULLISH'?x.side==='SELL_SIDE':x.side==='BUY_SIDE')
  );
  return !!shift&&shift.direction===execDir&&!!sweep;
}

function directionFor(layers,execution,strategy){
  const macro=macroDirection(layers),execDir=execution.structure.direction;
  if(!thesisBase(execDir))return macro;
  const reversal=['LIQUIDITY_REVERSAL','SMC','CRT'].includes(strategy);
  if(reversal&&reversalEvidence(execution,macro,execDir))return execDir;
  return macro!=='NEUTRAL'?macro:execDir;
}

export const STRATEGIES={
  TOP_DOWN:{name:'Top-Down'},
  PULLBACK:{name:'CRT Pullback'},
  BREAKOUT:{name:'Breakout & Retest'},
  SMC:{name:'SMC'},
  MSNR:{name:'MSNR'},
  PRICE_ACTION:{name:'Price Action'},
  LIQUIDITY_REVERSAL:{name:'Liquidity Reversal'},
  CRT:{name:'CRT'}
};

export function evaluateStrategy({strategy,layers,execution,price}){
  const s=execution.structure,direction=directionFor(layers,execution,strategy),failures=[],evidence=[];
  if(!thesisBase(direction))return {direction:'NEUTRAL',failures:['Market structure is unclear.'],evidence};

  const macro=macroDirection(layers),execDir=s.direction;
  const isReversal=['SMC','LIQUIDITY_REVERSAL','CRT'].includes(strategy);
  const isValidReversal=isReversal&&reversalEvidence(execution,macro,execDir);
  if(macro!=='NEUTRAL'&&direction!==macro&&!isValidReversal)
    failures.push('The execution direction conflicts with the dominant higher-timeframe market structure.');

  const aligned=layers.filter(x=>x.structure.direction===direction).length;
  const sweep=latestSweep(execution.liquidity,direction,6);
  const disp=displacement(execution.candles,direction);
  const conf=executionConfirmation(execution.candles,direction);

  if(strategy==='TOP_DOWN'){
    if(aligned<2)failures.push('The higher-timeframe structure does not confirm the proposed direction.');
    if(s.direction!==direction)failures.push('Execution structure does not match the higher-timeframe direction.');
    if(!s.mss&&!s.bos&&!conf?.confirmed)failures.push('No current execution confirmation.');
    evidence.push('Higher-timeframe trend → protected swing → execution BOS/continuation.');
  }else if(strategy==='PULLBACK'){
    if(!disp)failures.push('No meaningful directional impulse/displacement.');
    if(s.direction!==direction)failures.push('Execution structure does not support continuation.');
    if(!execution.pullback)failures.push('No qualified structural pullback location.');
    evidence.push('Impulse → protected structure → retracement into value → continuation.');
  }else if(strategy==='BREAKOUT'){
    if(!execution.breakout)failures.push('No established structural level with a decisive breakout.');
    if(!execution.retest)failures.push('Breakout has not produced a confirmed retest.');
    if(!conf?.confirmed&&!execution.retest)failures.push('Retest lacks continuation confirmation.');
    evidence.push('Established swing level → decisive BOS → accepted retest.');
  }else if(strategy==='SMC'){
    if(!sweep)failures.push('No meaningful opposing liquidity sweep.');
    if(!disp)failures.push('No displacement after the liquidity event.');
    if(!(s.mss||s.choch||s.bos))failures.push('No structural shift after the liquidity event.');
    const poi=[...fvg(execution.candles,direction),...orderBlocks(execution.candles,direction)];
    if(!poi.length)failures.push('No objectively identifiable fresh POI.');
    else{
      const related=sweep?poi.some(z=>z.index>=sweep.index):true;
      if(!related)failures.push('POI is not causally related to the recent liquidity event.');
      else evidence.push('Fresh POI near '+(poi[0].mid??poi[0].low??'structure'));
    }
    if(macro!==direction&&!isValidReversal)failures.push('SMC reversal is missing a confirmed HTF conflict-resolution sequence.');
    evidence.push('Liquidity sweep → MSS/CHoCH → displacement → POI → protected invalidation.');
  }else if(strategy==='MSNR'){
    if(!execution.msnrLevel)failures.push('No fresh structurally significant support/resistance level.');
    else if(execution.msnrLevel.consumed)failures.push('Decision level is too heavily consumed.');
    if(!execution.msnrReaction)failures.push('No qualifying reaction at the decision level.');
    evidence.push('Structural level → reaction → structure-aligned continuation.');
  }else if(strategy==='PRICE_ACTION'){
    if(!execution.priceActionLevel)failures.push('No meaningful structural level.');
    if(!execution.priceActionReaction)failures.push('No qualifying price-action interaction.');
    evidence.push('Meaningful structure → arrival → rejection/engulfing in trend direction.');
  }else if(strategy==='LIQUIDITY_REVERSAL'){
    if(!sweep)failures.push('No meaningful liquidity sweep.');
    if(!sweep||sweep.age>8)failures.push('Liquidity event is not recent enough.');
    if(!s.mss&&!s.choch)failures.push('No structural shift after the sweep.');
    if(!disp)failures.push('No displacement confirming reversal.');
    if(macro!==direction&&!isValidReversal)failures.push('Reversal lacks the required HTF conflict-resolution sequence.');
    evidence.push('Liquidity taken → failure → MSS/CHoCH → displacement → reversal entry.');
  }else if(strategy==='CRT'){
    if(!execution.crt?.sweep)failures.push('No valid CRT range sweep.');
    if(!execution.crt?.reclaim)failures.push('Sweep did not reclaim the reference range.');
    if(!s.mss&&!s.choch&&!s.bos)failures.push('No structural confirmation after CRT reclaim.');
    evidence.push('Reference range → one-sided sweep → reclaim → protected invalidation → opposite liquidity.');
  }

  if(failures.length)return {direction,failures:[...new Set(failures)],evidence};

  const rawPoi=[...fvg(execution.candles,direction),...orderBlocks(execution.candles,direction)]
    .filter(z=>Number.isFinite(z.low)&&Number.isFinite(z.high));
  const atrValue=execution.structure.atr||price*.001;
  // A POI is only actionable while it is still between current price and the
  // structural invalidation. Old/far-away POIs must never manufacture an entry.
  const smcPoi=rawPoi.filter(z=>{
    const mid=Number(z.mid??((z.low+z.high)/2));
    if(!Number.isFinite(mid)||Math.abs(mid-price)>atrValue*3)return false;
    return direction==='BULLISH' ? mid>=(execution.structure.protectedLow?.price??-Infinity) : mid<=(execution.structure.protectedHigh?.price??Infinity);
  });
  const smcEntry=smcPoi.length?Number(smcPoi[0].mid??((smcPoi[0].low+smcPoi[0].high)/2)):null;
export function resolveEntry({strategy,execution,direction,price,atrValue,structure:s,confirmation:conf}){
  const levelByStrategy={
    TOP_DOWN:null,
    PULLBACK:execution.pullback?.level,
    BREAKOUT:execution.retest?.level,
    SMC:execution._smcEntry,
    MSNR:execution.msnrLevel?.level,
    PRICE_ACTION:execution.priceActionLevel?.level,
    LIQUIDITY_REVERSAL:null,
    CRT:execution.crt?.entryZone
  };
  let level=levelByStrategy[strategy];
  if(strategy==='PULLBACK'&&execution.pullback){
    const [z1,z2]=execution.pullback.retracementZone||[];
    const lo=Math.min(z1??level,z2??level),hi=Math.max(z1??level,z2??level);
    const leg=execution.pullback.impulse||0;
    const fibs=direction==='BULLISH'
      ? [hi,lo+leg*.5,lo].filter(v=>v<price).sort((a,b)=>b-a)
      : [lo,hi-leg*.5,hi].filter(v=>v>price).sort((a,b)=>a-b);
    level=fibs[0]??null;
  }
  const protectedLevel=direction==='BULLISH'
    ? s.protectedLow?.price
    : s.protectedHigh?.price;
  const distance=Math.abs((Number.isFinite(level)?level:price)-price);
  const limitDistance=Math.max(atrValue*1.25,price*.003);
  const levelAhead=Number.isFinite(level)&&(direction==='BULLISH'?level<price:level>price);
  const levelValid=Number.isFinite(level)&&(
    direction==='BULLISH'?level>=(protectedLevel??-Infinity):level<=(protectedLevel??Infinity)
  );
  const limitEligible=['PULLBACK','SMC'].includes(strategy);
  const candidateLimit=limitEligible&&levelAhead&&levelValid&&
    distance>=Math.max(price*.0004,atrValue*.08)&&distance<=limitDistance?level:null;

  const latestEvent=s.mss||s.choch||s.bos;
  const latestEventFresh=!!latestEvent&&Number(latestEvent.age)<=1;
  const triggerClose=execution.candles?.at(-1)?.close;
  const triggerDistance=Number.isFinite(triggerClose)?Math.abs(price-triggerClose):Infinity;
  const marketTrigger=!!conf?.confirmed||latestEventFresh||
    (strategy==='BREAKOUT'&&!!execution.retest&&Number(execution.retest.age??99)<=1)||
    (['MSNR','PRICE_ACTION'].includes(strategy)&&(execution.msnrReaction||execution.priceActionReaction))||
    (strategy==='CRT'&&!!execution.crt?.reclaim&&Number(execution.crt.sweep?.age??99)<=1);
  const marketNotExtended=triggerDistance<=Math.max(atrValue*.6,price*.0015);
  const breakoutFresh=strategy==='BREAKOUT'
    ?!!execution.retest&&Number(execution.retest.age??99)<=1:true;
  const crtFresh=strategy==='CRT'
    ?!!execution.crt?.sweep&&Number(execution.crt.sweep.age??99)<=2:true;
  const marketAllowed=marketTrigger&&marketNotExtended&&breakoutFresh&&crtFresh;
  if(candidateLimit!=null)return{orderType:'LIMIT',entry:candidateLimit,marketEntry:price};
  if(marketAllowed)return{orderType:'MARKET',entry:price,marketEntry:price};
  return{orderType:'NO_SETUP',entry:null,marketEntry:price};
}

  const entryPlan=resolveEntry({strategy,execution:{...execution,_smcEntry:smcEntry},direction,price,atrValue,structure:s,confirmation:conf});
  if(entryPlan.orderType==='NO_SETUP')return {direction,failures:['No actionable entry: the trigger is stale or price has moved away from the planned execution level.'],evidence};
  const orderType=entryPlan.orderType;
  const entry=entryPlan.entry;
  const target=execution.crt?.target
    ||execution.breakout?.target
    ||nearestTarget(execution.candles,direction,entry)?.level;

  // Continuation trades invalidate at the protected external swing.
  // Reversal trades may use the actual liquidity-sweep extreme when that extreme
  // is the event that defines the thesis. No generic nearest-swing fallback.
  const protectedInvalidation=direction==='BULLISH'
    ? execution.structure.protectedLow?.price
    : execution.structure.protectedHigh?.price;
  const reversalInvalidation=isReversal&&isValidReversal
    ? (direction==='BULLISH'
      ? execution.liquidity?.recentSweep?.find(x=>x.age<=8&&x.side==='SELL_SIDE')?.extreme
      : execution.liquidity?.recentSweep?.find(x=>x.age<=8&&x.side==='BUY_SIDE')?.extreme)
    : null;
  const structuralInvalidation=Number.isFinite(reversalInvalidation)
    ? reversalInvalidation
    : protectedInvalidation;

  const trade=tradeGeometry(execution.candles,direction,entry,target,structuralInvalidation);
  if(!trade)return {direction,failures:['No logical structural invalidation/target pair provides at least 2R.'],evidence};

  trade.orderType=orderType;
  trade.marketEntry=entryPlan.marketEntry;
  trade.entryReason=orderType==='LIMIT'
    ? 'Planned entry at a live structural retracement/POI'
    : 'Market entry only after current structure is confirmed';
  trade.invalidationSource=Number.isFinite(reversalInvalidation)
    ? 'Liquidity sweep extreme'
    : direction==='BULLISH'
      ? 'Protected external swing low'
      : 'Protected external swing high';
  return {direction,trade,failures:[],evidence};
}
