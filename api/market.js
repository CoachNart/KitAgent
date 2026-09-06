const TIMEFRAME_MAP={
  '1m':{forex:'5m',crypto:'1m'},'5m':{forex:'5m',crypto:'5m'},'15m':{forex:'15m',crypto:'15m'},'30m':{forex:'30m',crypto:'30m'},'1H':{forex:'1h',crypto:'1h'},'4H':{forex:'4h',crypto:'4h'},'1D':{forex:'1d',crypto:'1d'},'1W':{forex:'1wk',crypto:'1w'}
};
const CONFLUENCE=['1H','4H','1D'];
const allowedIntervals=new Set(['1m','5m','15m','30m','4H','1H','1D','1W']);

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
function sma(values,n){if(values.length<n)return null;return values.slice(-n).reduce((a,b)=>a+b,0)/n;}
function ema(values,n){if(values.length<n)return null;let e=sma(values.slice(0,n),n),k=2/(n+1);for(let i=n;i<values.length;i++)e=values[i]*k+e*(1-k);return e;}
function rsi(values,n=14){if(values.length<n+1)return 50;let gain=0,loss=0;for(let i=1;i<=n;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}let avgGain=gain/n,avgLoss=loss/n;for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];avgGain=(avgGain*(n-1)+Math.max(d,0))/n;avgLoss=(avgLoss*(n-1)+Math.max(-d,0))/n}if(avgLoss===0)return 100;return 100-(100/(1+avgGain/avgLoss));}
function atr(candles,n=14){if(candles.length<n+1)return null;const trs=[];for(let i=1;i<candles.length;i++){const c=candles[i],p=candles[i-1];trs.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)))}return sma(trs.slice(-n),n);}
function roundPrice(value){if(value>=1000)return Number(value.toFixed(2));if(value>=100)return Number(value.toFixed(3));if(value>=1)return Number(value.toFixed(5));if(value>=0.1)return Number(value.toFixed(6));return Number(value.toPrecision(7));}
function normalize(rows){return rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)})).filter(x=>Number.isFinite(x.open)&&Number.isFinite(x.high)&&Number.isFinite(x.low)&&Number.isFinite(x.close));}
function aggregateFourHour(candles){const groups=new Map(),bucket=4*60*60*1000;for(const c of candles){const key=Math.floor(c.time/bucket)*bucket;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c)}return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([time,g])=>({time,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g.at(-1).close,volume:g.reduce((s,x)=>s+x.volume,0)}));}

async function fetchYahoo(symbol,interval){
  const requestInterval=interval==='4h'?'1h':interval;
  const range=['1m','5m','15m','30m'].includes(requestInterval)?'7d':requestInterval==='1h'?'3mo':requestInterval==='1d'?'1y':'5y';
  const hosts=['query1.finance.yahoo.com','query2.finance.yahoo.com'];
  let lastError='Forex data provider unavailable';
  for(const host of hosts){
    try{
      const url=`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${requestInterval}&events=div%2Csplits`;
      const r=await fetch(url,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});
      if(!r.ok){lastError=`Forex data provider returned ${r.status}`;continue;}
      const body=await r.json();const result=body?.chart?.result?.[0];
      if(!result){lastError=body?.chart?.error?.description||'No forex market data returned';continue;}
      const q=result.indicators?.quote?.[0];
      const rows=(result.timestamp||[]).map((t,i)=>[t*1000,q?.open?.[i],q?.high?.[i],q?.low?.[i],q?.close?.[i],q?.volume?.[i]||0]).filter(x=>x[4]!=null);
      const candles=normalize(rows);if(candles.length<60){lastError='Forex provider returned insufficient candles';continue;}
      return interval==='4h'?aggregateFourHour(candles):candles;
    }catch(error){lastError=error?.message||lastError}
  }
  throw new Error(lastError);
}
async function fetchBinance(symbol,interval,perpetual){const base=perpetual?'https://fapi.binance.com/fapi/v1/klines':'https://data-api.binance.vision/api/v3/klines';const url=`${base}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`;const r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error(`Crypto data provider returned ${r.status}`);const rows=await r.json();if(!Array.isArray(rows)||!rows.length)throw new Error('No crypto market data returned');return normalize(rows);}
async function candlesFor(market,symbol,timeframe){const mapped=TIMEFRAME_MAP[timeframe]?.[market==='forex'?'forex':'crypto'];if(!mapped)throw new Error('Unsupported timeframe');if(market==='forex')return fetchYahoo(`${symbol}=X`,mapped);return fetchBinance(symbol.replace(/[^A-Z0-9]/gi,''),mapped,market==='perpetual');}
function analyzeCandles(candles){if(candles.length<60)throw new Error(`Not enough candles for a reliable setup (${candles.length} received)`);const closes=candles.map(x=>x.close),last=candles.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes,14),a=atr(candles,14);if(!Number.isFinite(e20)||!Number.isFinite(e50)||!Number.isFinite(a))throw new Error('Indicators could not be calculated from market data');const recent=candles.slice(-30),swingHigh=Math.max(...recent.map(x=>x.high)),swingLow=Math.min(...recent.map(x=>x.low));const trendScore=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0);let bias=trendScore>=2?'LONG':trendScore<=-2?'SHORT':'WAIT';const distance=Math.max(a||Math.abs(swingHigh-swingLow)*0.02,last.close*0.001);let entry=last.close,stop,target1,target2;if(bias==='LONG'){stop=Math.min(swingLow,last.close-distance*1.15);if(stop>=entry)stop=entry-distance;target1=entry+(entry-stop)*1.5;target2=entry+(entry-stop)*2.5}else if(bias==='SHORT'){stop=Math.max(swingHigh,last.close+distance*1.15);if(stop<=entry)stop=entry+distance;target1=entry-(stop-entry)*1.5;target2=entry-(stop-entry)*2.5}else{stop=entry+distance;target1=entry;target2=entry}
const risk=Math.abs(entry-stop);const confidence=Math.min(92,Math.max(42,Math.round(50+Math.abs(trendScore)*7+(r>55||r<45?5:0)+(last.close>e20&&e20>e50||last.close<e20&&e20<e50?5:0))));return{bias,confidence,entry:roundPrice(entry),stopLoss:roundPrice(stop),takeProfit1:roundPrice(target1),takeProfit2:roundPrice(target2),riskReward:risk>0&&bias!=='WAIT'?'1:2.5':'—',rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),swingHigh:roundPrice(swingHigh),swingLow:roundPrice(swingLow),timestamp:last.time};}

export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  try{
    const market=String(req.query?.market||'forex').toLowerCase();const symbol=String(req.query?.symbol||'').trim().toUpperCase();const timeframe=String(req.query?.timeframe||'1H');
    if(!['forex','crypto','perpetual'].includes(market))return json(res,400,{error:'Unsupported market'});
    if(!symbol)return json(res,400,{error:'Missing symbol'});
    if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});
    const current=await candlesFor(market,symbol,timeframe);const setup=analyzeCandles(current);
    const confluence=await Promise.all(CONFLUENCE.map(async tf=>{try{const data=await candlesFor(market,symbol,tf);const a=analyzeCandles(data);return{timeframe:tf,bias:a.bias,confidence:a.confidence}}catch(error){return{timeframe:tf,bias:'UNAVAILABLE',confidence:0,error:error?.message||'Unavailable'}}}));
    const directional=confluence.filter(x=>x.bias==='LONG'||x.bias==='SHORT');
    const longVotes=directional.filter(x=>x.bias==='LONG').length,shortVotes=directional.filter(x=>x.bias==='SHORT').length;
    const inferredBias=longVotes>shortVotes?'LONG':shortVotes>longVotes?'SHORT':'WAIT';
    const finalBias=setup.bias!=='WAIT'?setup.bias:inferredBias;
    const aligned=confluence.filter(x=>x.bias===finalBias&&finalBias!=='WAIT').length;
    const finalConfidence=Math.min(95,Math.max(35,Math.round(setup.confidence+(aligned*4)-(setup.bias==='WAIT'?4:0))));
    const finalSetup=finalBias===setup.bias?setup:{...setup,bias:finalBias,confidence:finalConfidence};
    return json(res,200,{ok:true,market,symbol,timeframe,setup:{...finalSetup,confidence:finalConfidence},confluence,aligned,totalTimeframes:CONFLUENCE.length+1,source:market==='forex'?'Yahoo Finance chart data':market==='perpetual'?'Binance USD-M futures public klines':'Binance spot public klines',generatedAt:new Date().toISOString()});
  }catch(error){return json(res,502,{ok:false,error:error?.message||'Market analysis failed'});}
}
