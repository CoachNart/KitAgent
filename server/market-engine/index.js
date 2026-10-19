import {authenticate,requireActiveAccess} from '../access.js';
import {normalizeRows,closedCandles,validateCandles,EXECUTION_TIMEFRAMES,roundPrice} from './data.js';
import {structure,selectStructuralTarget} from './structure.js';
import {liquidityMap} from './liquidity.js';
import {regime} from './regime.js';
import {evaluateStrategy,STRATEGIES} from './strategies.js';
import {noTrade,validateTradeGeometry,validateEntryExecution,executableTrade} from './grading.js';

const BYBIT={'30m':'30','1H':'60','2H':'120','4H':'240','1D':'D'};
const analysisLayerCache=new WeakMap();
const CHAIN={
  '30m':['4H','2H','1H','30m'],
  '1H':['4H','2H','1H'],
  '2H':['4H','2H'],
  '4H':['1D','4H']
};

function json(res,status,p){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(p));
}

export async function bybitCandles(symbol,tf){
  const clean=symbol.replace(/[^A-Z0-9]/gi,'');
  let lastError='Bybit candles unavailable';
  for(const host of ['https://api.bybit.com','https://api.bytick.com']){
    try{
      const u=new URL('/v5/market/kline',host);
      u.searchParams.set('category','linear');
      u.searchParams.set('symbol',clean);
      u.searchParams.set('interval',BYBIT[tf]);
      u.searchParams.set('limit','300');
      const r=await fetch(u);
      if(!r.ok){lastError='Bybit candles HTTP '+r.status+' '+r.statusText+' ('+host+')';continue;}
      const b=await r.json();
      if(b.retCode!==0){lastError='Bybit candles retCode '+b.retCode+': '+(b.retMsg||'unknown provider error');continue;}
      return normalizeRows(b.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]));
    }catch(error){
      lastError='Bybit candles request failed ('+host+'): '+(error?.message||error);
    }
  }
  throw new Error(lastError);
}

export async function bybitInstruments(){
  let lastError='Bybit instruments unavailable';
  for(const host of ['https://api.bybit.com','https://api.bytick.com']){
    try{
      const u=new URL('/v5/market/instruments-info',host);
      u.searchParams.set('category','linear');
      u.searchParams.set('status','Trading');
      u.searchParams.set('limit','1000');
      const r=await fetch(u);
      if(!r.ok){lastError='Bybit instruments HTTP '+r.status+' '+r.statusText+' ('+host+')';continue;}
      const b=await r.json();
      if(b.retCode!==0){lastError='Bybit instruments retCode '+b.retCode+': '+(b.retMsg||'unknown provider error');continue;}
      const instruments=(b.result?.list||[])
        .filter(x=>x.status==='Trading'&&x.quoteCoin==='USDT')
        .map(x=>({
          symbol:x.symbol.replace(/USDT$/,'/USDT'),
          name:x.baseCoin?`${x.baseCoin} / USDT Perpetual`:x.symbol,
          type:'CRYPTO_PERPETUAL',
          providerSymbol:x.symbol,
          baseCoin:x.baseCoin,
          quoteCoin:x.quoteCoin
        }));
      if(instruments.length)return instruments;
      lastError='Bybit instruments response contained no tradable USDT perpetuals ('+host+')';
    }catch(error){lastError='Bybit instruments request failed ('+host+'): '+(error?.message||error);}
  }
  throw new Error(lastError);
}

export async function fetchTf(market,symbol,tf){
  if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');
  return bybitCandles(symbol,tf);
}

export async function fetchPrice(market,symbol){
  if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');
  const clean=symbol.replace(/[^A-Z0-9]/gi,'');
  let lastError='Bybit live price unavailable';
  for(const host of ['https://api.bybit.com','https://api.bytick.com']){
    try{
      const u=new URL('/v5/market/tickers',host);
      u.searchParams.set('category','linear');
      u.searchParams.set('symbol',clean);
      const r=await fetch(u);
      if(!r.ok){lastError='Bybit live price HTTP '+r.status+' '+r.statusText+' ('+host+')';continue;}
      const b=await r.json(),x=b?.result?.list?.[0];
      if(b?.retCode!==0||!x){lastError='Bybit live price retCode '+(b?.retCode??'missing')+': '+(b?.retMsg||'ticker missing');continue;}
      const bid=+x.bid1Price,ask=+x.ask1Price,last=+x.lastPrice;
      const mid=bid>0&&ask>0?(bid+ask)/2:last;
      if(!Number.isFinite(mid)||mid<=0){lastError='Bybit returned an invalid live quote ('+host+')';continue;}
      return{
        bid,ask,last,mid,
        time:new Date(Number(b.time||Date.now())).toISOString(),
        marketState:'open',
        stale:false,
        spread:Number.isFinite(ask-bid)?Math.max(0,ask-bid):null
      };
    }catch(error){lastError='Bybit live price request failed ('+host+'): '+(error?.message||error);}
  }
  throw new Error(lastError);
}

const STRATEGY_REASONS={
  TOP_DOWN:'HTF alignment → execution BOS → retest & hold → structural continuation target.',
  PULLBACK:'HTF trend → confirmed impulse → 38.2–61.8% retracement → continuation break → structural target.',
  BREAKOUT:'Multi-touch level → decisive closed breakout → retest hold → continuation → structural/range target.',
  SMC:'HTF bias → liquidity sweep/reclaim → MSS + displacement → fresh FVG → FVG retracement entry → opposing liquidity.',
  MSNR:'Fresh MSNR key level → exact candle confirmation → live non-extended entry → opposing MSNR level.',
  CRT:'Completed CRT range → one-sided sweep/reclaim → lower-timeframe sweep → MSS/displacement → retest → opposite range/external target.'
};

function plan(tf){
  if(tf==='AUTO')return EXECUTION_TIMEFRAMES;
  if(!EXECUTION_TIMEFRAMES.includes(tf))throw new Error('Execution timeframe must be 30m, 1H, 2H, 4H, or AUTO');
  return CHAIN[tf];
}

function marketContext(layer){
  const s=layer?.structure;
  return{
    executionDirection:s?.direction||'NEUTRAL',
    protectedHigh:s?.protectedHigh?.price??null,
    protectedLow:s?.protectedLow?.price??null,
    latestBOS:s?.bos?{direction:s.bos.direction,level:s.bos.level,age:s.bos.age??null}:null,
    latestCHoCH:s?.choch?{direction:s.choch.direction,level:s.choch.level,age:s.choch.age??null}:null,
    latestMSS:s?.mss?{direction:s.mss.direction,level:s.mss.level,age:s.mss.age??null}:null
  };
}

export function selectMinimumRRStructuralTarget({trade,direction,candles=[],layers=[],minimumRR=3}={}){
  if(!trade||!Array.isArray(candles)||!candles.length||!['BULLISH','BEARISH'].includes(direction))return null;
  const entry=Number(trade.entry),stop=Number(trade.stop);
  const risk=Math.abs(entry-stop);
  if(![entry,stop].every(Number.isFinite)||!(risk>0))return null;
  // Look only for a real, confirmed structural objective at or beyond the
  // minimum reward distance. Never stretch a target numerically: the selected
  // price must already exist as an eligible execution/HTF swing or liquidity pool.
  const target=selectStructuralTarget(candles,direction,entry,{
    layers,
    minDistance:risk*minimumRR,
    asOf:candles.length-1,
    asOfTime:candles.at(-1)?.time??null
  });
  if(!target)return null;
  const reward=Math.abs(target.price-entry),rr=reward/risk;
  if(!(reward>0&&rr>=minimumRR))return null;
  return {
    ...trade,
    target:target.price,
    reward,
    risk,
    rr,
    targetSource:target.source||'STRUCTURAL_TARGET',
    targetSelection:{price:target.price,source:target.source,quality:target.quality,pool:target.pool,minimumRR}
  };
}

export async function analyzeOne(market,symbol,strategy,tf,allCandles,price,quote=null){
  const order=CHAIN[tf];
  let byTimeframe=analysisLayerCache.get(allCandles);
  if(!byTimeframe){
    byTimeframe=new Map();
    analysisLayerCache.set(allCandles,byTimeframe);
  }
  let layers=byTimeframe.get(tf);
  if(!layers){
    layers=order.map(x=>({
      tf:x,
      candles:allCandles[x],
      structure:structure(allCandles[x]),
      liquidity:liquidityMap(allCandles[x])
    }));
    byTimeframe.set(tf,layers);
  }

  const hard=[];
  for(const layer of layers){
    const v=validateCandles(layer.candles,layer.tf);
    if(!v.valid)hard.push(layer.tf+': '+v.failures.join(', '));
  }
  if(hard.length){
    return{
      tf,
      direction:'NEUTRAL',
      grade:noTrade(hard),
      failures:hard,
      evidence:[],
      layers:layers.map(x=>({tf:x.tf,direction:x.structure.direction,state:x.structure.state})),
      structure:layers.at(-1)?.structure||null,
      marketContext:marketContext(layers.at(-1))
    };
  }

  const execution=layers.at(-1);
  const result=evaluateStrategy({
    strategy,
    layers,
    execution,
    price
  });

  let grade=result.grade||noTrade(result.failures||[]);
  let failures=[...(result.failures||[])];
  const executablePrice=result.direction==='BULLISH'&&Number(quote?.ask)>0?Number(quote.ask):result.direction==='BEARISH'&&Number(quote?.bid)>0?Number(quote.bid):price;
  let trade=executableTrade(result.trade,result.direction,executablePrice);
  if(trade){
    const entryExecution=validateEntryExecution({trade,direction:result.direction,livePrice:executablePrice});
    if(!entryExecution.valid){
      failures.push(...entryExecution.failures);
      grade=noTrade(entryExecution.failures);
      trade=null;
    }
  }
  if(trade){
    let geometry=validateTradeGeometry({trade,direction:result.direction,candles:execution.candles});
    if(!geometry.valid&&geometry.failures.some(x=>x.includes('below the 3R minimum'))){
      const structuralAlternative=selectMinimumRRStructuralTarget({
        trade,direction:result.direction,candles:execution.candles,layers,minimumRR:3
      });
      if(structuralAlternative){
        const alternateGeometry=validateTradeGeometry({trade:structuralAlternative,direction:result.direction,candles:execution.candles});
        if(alternateGeometry.valid){
          trade=structuralAlternative;
          geometry=alternateGeometry;
          failures.push('Target selected from a farther confirmed structural objective to satisfy the 3R minimum; nearer structure remains a potential obstacle.');
        }
      }
    }
    if(!geometry.valid){
      failures.push(...geometry.failures);
      grade=noTrade(geometry.failures);
      trade=null;
    }else if(grade?.confidenceEvidence){
      grade={...grade,confidenceEvidence:[...grade.confidenceEvidence,{type:'TRADE_GEOMETRY',...geometry.metrics,interpretation:'validated at executable entry; minimum 3R required for publication',targetSelection:trade.targetSelection||null}]};
    }
  }
  return{
    tf,
    direction:result.direction,
    grade,
    trade,
    evidence:result.evidence||[],
    failures,
    layers:layers.map(x=>({
      tf:x.tf,
      direction:x.structure.direction,
      state:x.structure.state,
      bos:x.structure.bos,
      choch:x.structure.choch,
      mss:x.structure.mss
    })),
    structure:execution.structure,
    marketContext:marketContext(execution),
    regime:regime(execution.candles,execution.structure),
    topDown:result.topDown||null,
    pullback:result.pullback||null,
    breakoutRetest:result.breakoutRetest||null,
    smc:result.smc||null,
    msnr:result.msnr||null,
    crt:result.crt||null,
    liquidity:execution.liquidity,
    msnrLevels:result.levels||[],
    msnrConfirmations:result.confirmations||[],
    candidates:result.candidates||[]
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});

  if(String(req.query?.action||'')==='instruments'){
    try{
      const market=String(req.query.market||'perpetual').toLowerCase();
      if(market!=='perpetual')return json(res,400,{ok:false,error:'KitSetups supports Crypto Perpetuals only'});
      return json(res,200,{ok:true,instruments:await bybitInstruments()});
    }catch(e){
      return json(res,502,{ok:false,error:e.message});
    }
  }

  if(String(req.query?.action||'')==='header'){
    try{
      const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT'];
      const rows=[];
      for(const symbol of symbols){
        try{
          const u=new URL('https://api.bybit.com/v5/market/tickers');
          u.searchParams.set('category','linear');
          u.searchParams.set('symbol',symbol);
          const r=await fetch(u);
          const b=await r.json();
          const x=b?.result?.list?.[0];
          if(x)rows.push({symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt});
        }catch{}
      }
      return json(res,200,{ok:true,result:rows});
    }catch(e){
      return json(res,502,{ok:false,error:e.message});
    }
  }

  try{
    const auth=await authenticate(req);
    await requireActiveAccess(auth.uid);

    const market=String(req.query.market||'perpetual').toLowerCase();
    const symbol=String(req.query.symbol||'').trim().toUpperCase();
    const strategy=String(req.query.strategy||'TOP_DOWN').toUpperCase().replace(/[-\s]/g,'_');
    const requested=String(req.query.timeframe||'AUTO');

    if(market!=='perpetual')return json(res,400,{ok:false,error:'KitSetups supports Crypto Perpetuals only'});
    if(strategy!=='AUTO'&&!STRATEGIES[strategy])return json(res,400,{ok:false,error:'Unsupported strategy'});
    if(!symbol)return json(res,400,{ok:false,error:'Missing symbol'});
    if(requested!=='AUTO'&&!EXECUTION_TIMEFRAMES.includes(requested))
      return json(res,400,{ok:false,error:'Execution timeframe must be 30m, 1H, 2H, 4H, or AUTO'});

    const price=await fetchPrice(market,symbol);
    const tfs=requested==='AUTO'?EXECUTION_TIMEFRAMES:[requested];
    const needed=[...new Set(tfs.flatMap(tf=>CHAIN[tf]))];
    const all={};

    for(const tf of needed){
      const raw=await fetchTf(market,symbol,tf);
      all[tf]=closedCandles(raw,tf);
      const v=validateCandles(all[tf],tf);
      if(!v.valid)throw new Error(tf+': '+v.failures.join(', '));
    }

    const results=[];
    const strategies=strategy==='AUTO'?Object.keys(STRATEGIES):[strategy];
    for(const strategyKey of strategies){
      for(const tf of tfs){
        const evaluated=await analyzeOne(market,symbol,strategyKey,tf,all,price.last,price);
        results.push({...evaluated,strategyKey});
      }
    }

    const viable=results.filter(x=>
      ['A+','A'].includes(x.grade.grade)&&
      x.trade&&
      (x.direction==='BULLISH'
        ?x.trade.stop<x.trade.entry&&x.trade.target>x.trade.entry
        :x.direction==='BEARISH'
          ?x.trade.stop>x.trade.entry&&x.trade.target<x.trade.entry
          :false)
    );

    viable.sort((a,b)=>b.grade.score-a.grade.score||b.trade.rr-a.trade.rr);
    const best=viable[0]||null;
    const selectedStrategy=best?.strategyKey||(strategy==='AUTO'?'AUTO':strategy);

    const setup=best
      ?{
        tradeReady:true,
        setupStatus:'TRADE READY',
        strategy:selectedStrategy,
        strategyName:STRATEGIES[selectedStrategy].name,
        directionBias:best.direction,
        bias:best.direction==='BULLISH'?'LONG':'SHORT',
        entry:roundPrice(best.trade.entry),
        plannedEntry:best.trade.plannedEntry!=null?roundPrice(best.trade.plannedEntry):null,
        stopLoss:roundPrice(best.trade.stop),
        takeProfit1:roundPrice(best.trade.target),
        takeProfit2:null,
        targetSource:best.trade.targetSource||null,
        targetSelection:best.trade.targetSelection||null,
        riskReward:'1:'+best.trade.rr.toFixed(2),
        riskRewardValue:+best.trade.rr.toFixed(2),
        orderType:best.trade.orderType||'MARKET',
        marketEntry:roundPrice(best.trade.marketEntry??price.mid),
        entryReason:best.trade.entryReason||null,
        confidence:best.grade.score,
        quality:best.grade.grade,
        entryTimeframe:best.tf,
        analysisTimeframes:CHAIN[best.tf],
        higherTimeframe:CHAIN[best.tf][0],
        middleTimeframe:CHAIN[best.tf].at(-2),
        marketRegime:best.structure?.state||null,
        strategyEvidence:best.evidence,
        strategyFailures:[],
        strategyReason:STRATEGY_REASONS[selectedStrategy],
        strategyDetails:best[selectedStrategy==='TOP_DOWN'?'topDown':selectedStrategy==='PULLBACK'?'pullback':selectedStrategy==='BREAKOUT'?'breakoutRetest':selectedStrategy==='SMC'?'smc':selectedStrategy==='MSNR'?'msnr':'crt']||null,
        structuralInvalidation:best.trade.invalidationPrice,
        thesisInvalidation:best.trade.invalidation??null,
        invalidationSource:best.trade.invalidationSource||null,
        tradeBreakdown:{
          direction:best.direction==='BULLISH'?'LONG':'SHORT',
          timeframe:best.tf,
          analysisTimeframes:CHAIN[best.tf],
          structure:best.structure,
          marketContext:best.marketContext,
          trade:best.trade,
          orderType:best.trade.orderType||'MARKET',
          entryReason:best.trade.entryReason||null,
          invalidationSource:best.trade.invalidationSource||null,
          msnr:best.msnr,
          confirmations:best.msnrConfirmations,
          smc:best.smc||null,
          topDown:best.topDown||null,
          pullback:best.pullback||null,
          breakoutRetest:best.breakoutRetest||null,
          crt:best.crt||null
        },
        debug:{
          selectedTimeframe:best.tf,
          candidates:results.map(x=>({
            strategy:x.strategyKey,
            timeframe:x.tf,
            grade:x.grade,
            failures:x.failures,
            msnr:x.msnr,
            confirmations:x.msnrConfirmations,
            smc:x.smc||null,
            candidates:x.candidates
          }))
        },
        structureEvidence:{
          layers:best.layers,
          msnr:best.msnr,
          confirmations:best.msnrConfirmations
        }
      }
      :{
        tradeReady:false,
        setupStatus:'NO TRADE',
        strategy,
        strategyName:strategy==='AUTO'?'Auto · all strategies':STRATEGIES[strategy].name,
        directionBias:'WAIT',
        bias:'WAIT',
        entry:null,
        stopLoss:null,
        takeProfit1:null,
        takeProfit2:null,
        riskReward:'—',
        riskRewardValue:null,
        orderType:'NO_SETUP',
        confidence:0,
        quality:'NO-TRADE',
        entryTimeframe:requested==='AUTO'?'AUTO':requested,
        analysisTimeframes:requested==='AUTO'?EXECUTION_TIMEFRAMES:CHAIN[requested],
        strategyEvidence:results.flatMap(x=>x.evidence).slice(0,8),
        strategyFailures:[...new Set(results.flatMap(x=>x.failures))].slice(0,12),
        strategyReason:strategy==='AUTO'?'No strategy passed the full entry, structure, and trade-geometry checks on the evaluated timeframe(s).':`No ${STRATEGY_REASONS[strategy]||'strategy-specific entry contract'} has fully passed on the evaluated timeframe(s).`,
        debug:{
          selectedTimeframe:null,
          candidates:results.map(x=>({
            strategy:x.strategyKey,
            timeframe:x.tf,
            grade:x.grade,
            failures:x.failures,
            msnr:x.msnr,
            confirmations:x.msnrConfirmations,
            candidates:x.candidates
          }))
        }
      };

    return json(res,200,{
      ok:true,
      market,
      symbol,
      timeframe:requested,
      strategy,
      strategyInfo:strategy==='AUTO'?{name:'Auto · all strategies',status:'READY',strategies:Object.keys(STRATEGIES)}:STRATEGIES[strategy],
      setup,
      quote:price,
      executionCandidates:results.map(x=>({
        strategy:x.strategyKey,
        timeframe:x.tf,
        grade:x.grade.grade,
        score:x.grade.score,
        direction:x.direction,
        failures:x.failures,
        evidence:x.evidence,
        msnr:x.msnr
      })),
      generatedAt:new Date().toISOString(),
      source:'Bybit linear perpetuals'
    });
  }catch(e){
    return json(res,500,{ok:false,error:e?.message||'Market analysis failed',code:e?.code||'MARKET_ENGINE_ERROR'});
  }
}
