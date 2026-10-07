import {authenticate,requireActiveAccess} from '../access.js';
import {normalizeRows,closedCandles,validateCandles,EXECUTION_TIMEFRAMES,roundPrice} from './data.js';
import {structure} from './structure.js';
import {liquidityMap} from './liquidity.js';
import {regime} from './regime.js';
import {evaluateStrategy,STRATEGIES} from './strategies.js';
import {noTrade} from './grading.js';

const BYBIT={'15m':'15','30m':'30','1H':'60','2H':'120','4H':'240'};
const CHAIN={
  '15m':['4H','2H','1H','30m','15m'],
  '30m':['4H','2H','1H','30m'],
  '1H':['4H','2H','1H'],
  '2H':['4H','2H'],
  '4H':['4H']
};

function json(res,status,p){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(p));
}

export async function bybitCandles(symbol,tf){
  const clean=symbol.replace(/[^A-Z0-9]/gi,'');
  const u=new URL('https://api.bybit.com/v5/market/kline');
  u.searchParams.set('category','linear');
  u.searchParams.set('symbol',clean);
  u.searchParams.set('interval',BYBIT[tf]);
  u.searchParams.set('limit','300');
  const r=await fetch(u);
  if(!r.ok)throw new Error('Bybit candles unavailable');
  const b=await r.json();
  if(b.retCode!==0)throw new Error(b.retMsg||'Bybit candles unavailable');
  return normalizeRows(b.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]));
}

export async function bybitInstruments(){
  const u=new URL('https://api.bybit.com/v5/market/instruments-info');
  u.searchParams.set('category','linear');
  u.searchParams.set('status','Trading');
  u.searchParams.set('limit','1000');
  const r=await fetch(u);
  if(!r.ok)throw new Error('Bybit instruments unavailable');
  const b=await r.json();
  if(b.retCode!==0)throw new Error(b.retMsg||'Bybit instruments unavailable');
  return (b.result?.list||[])
    .filter(x=>x.status==='Trading'&&x.quoteCoin==='USDT')
    .map(x=>({
      symbol:x.symbol.replace(/USDT$/,'/USDT'),
      name:x.baseCoin?`${x.baseCoin} / USDT Perpetual`:x.symbol,
      type:'CRYPTO_PERPETUAL',
      providerSymbol:x.symbol,
      baseCoin:x.baseCoin,
      quoteCoin:x.quoteCoin
    }));
}

export async function fetchTf(market,symbol,tf){
  if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');
  return bybitCandles(symbol,tf);
}

export async function fetchPrice(market,symbol){
  if(market!=='perpetual')throw new Error('KitSetups supports Crypto Perpetuals only');
  const clean=symbol.replace(/[^A-Z0-9]/gi,'');
  const u=new URL('https://api.bybit.com/v5/market/tickers');
  u.searchParams.set('category','linear');
  u.searchParams.set('symbol',clean);
  const r=await fetch(u);
  if(!r.ok)throw new Error('Bybit live price unavailable');
  const b=await r.json(),x=b?.result?.list?.[0];
  if(b?.retCode!==0||!x)throw new Error(b?.retMsg||'Bybit live price unavailable');
  const bid=+x.bid1Price,ask=+x.ask1Price,last=+x.lastPrice;
  const mid=bid>0&&ask>0?(bid+ask)/2:last;
  if(!Number.isFinite(mid)||mid<=0)throw new Error('Bybit live price unavailable');
  return{
    bid,ask,mid,
    time:new Date(Number(b.time||Date.now())).toISOString(),
    marketState:'open',
    stale:false,
    spread:Math.max(0,ask-bid)
  };
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
  if(!EXECUTION_TIMEFRAMES.includes(tf))throw new Error('Execution timeframe must be 15m, 30m, 1H, 2H, 4H, or AUTO');
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

export async function analyzeOne(market,symbol,strategy,tf,allCandles,price){
  const order=CHAIN[tf];
  const layers=order.map(x=>({
    tf:x,
    candles:allCandles[x],
    structure:structure(allCandles[x]),
    liquidity:liquidityMap(allCandles[x])
  }));

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

  const grade=result.grade||noTrade(result.failures||[]);
  return{
    tf,
    direction:result.direction,
    grade,
    trade:result.trade||null,
    evidence:result.evidence||[],
    failures:result.failures||[],
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
    msnr:result.msnr||null,
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
    if(!STRATEGIES[strategy])return json(res,400,{ok:false,error:'Unsupported strategy'});
    if(!symbol)return json(res,400,{ok:false,error:'Missing symbol'});
    if(requested!=='AUTO'&&!EXECUTION_TIMEFRAMES.includes(requested))
      return json(res,400,{ok:false,error:'Execution timeframe must be 15m, 30m, 1H, 2H, 4H, or AUTO'});

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
    for(const tf of tfs)results.push(await analyzeOne(market,symbol,strategy,tf,all,price.mid));

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

    const setup=best
      ?{
        tradeReady:true,
        setupStatus:'TRADE READY',
        strategy,
        strategyName:STRATEGIES[strategy].name,
        directionBias:best.direction,
        bias:best.direction==='BULLISH'?'LONG':'SHORT',
        entry:roundPrice(best.trade.entry),
        stopLoss:roundPrice(best.trade.stop),
        takeProfit1:roundPrice(best.trade.target),
        takeProfit2:null,
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
        strategyReason:STRATEGY_REASONS[strategy],
        strategyDetails:best[strategy==='TOP_DOWN'?'topDown':strategy==='PULLBACK'?'pullback':strategy==='BREAKOUT'?'breakoutRetest':strategy==='SMC'?'smc':strategy==='MSNR'?'msnr':'crt']||null,
        structuralInvalidation:best.trade.invalidation,
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
        strategyName:STRATEGIES[strategy].name,
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
        strategyReason:`No ${STRATEGY_REASONS[strategy]||'strategy-specific entry contract'} has fully passed on the evaluated timeframe(s).`,
        debug:{
          selectedTimeframe:null,
          candidates:results.map(x=>({
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
      strategyInfo:STRATEGIES[strategy],
      setup,
      quote:price,
      executionCandidates:results.map(x=>({
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
