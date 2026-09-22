import { authenticate, requireActiveAccess } from '../server/access.js';
const FOREX_INSTRUMENTS=['AUDCAD','AUDCHF','AUDJPY','AUDNZD','AUDUSD','CADCHF','CADJPY','CHFJPY','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','EURUSD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','GBPUSD','NZDCAD','NZDCHF','NZDJPY','NZDUSD','USDCAD','USDCHF','USDJPY','USDNOK','USDSEK','USDZAR','USDSGD','EURPLN','EURSEK','EURNOK','EURTRY','GBPPLN','GBPSEK','GBPNOK','NOKSEK','NZDSGD','SGDJPY','CHFSGD','CADSGD','AUDSGD','AUDNOK','AUDSEK','CADNOK','CADSEK','CHFPLN','CHFZAR','EURSGD','GBPZAR','NZDZAR','USDHKD','USDMXN','USDTRY','USDTHB','USDHUF','USDCNH'];
const CRYPTO_INSTRUMENTS=['BTC/USDT','ETH/USDT','SOL/USDT','XRP/USDT','BNB/USDT','DOGE/USDT','ADA/USDT','AVAX/USDT','LINK/USDT','DOT/USDT','TRX/USDT','TON/USDT','SHIB/USDT','LTC/USDT','BCH/USDT','NEAR/USDT','UNI/USDT','AAVE/USDT','ATOM/USDT','ETC/USDT','XLM/USDT','FIL/USDT','HBAR/USDT','APT/USDT','ARB/USDT','OP/USDT','SUI/USDT','INJ/USDT','SEI/USDT','TIA/USDT','PEPE/USDT','WIF/USDT','FLOKI/USDT','JUP/USDT','ENA/USDT','MKR/USDT','RUNE/USDT','ALGO/USDT','VET/USDT','ICP/USDT','EGLD/USDT','SAND/USDT','MANA/USDT','AXS/USDT','GALA/USDT','IMX/USDT','STX/USDT','CRV/USDT','LDO/USDT','SNX/USDT','COMP/USDT','MATIC/USDT','APE/USDT','DYDX/USDT','ORDI/USDT','PYTH/USDT','JTO/USDT','ONDO/USDT','TAO/USDT','FET/USDT'];
const TIMEFRAME_MAP={'1m':{forex:'5m',crypto:'1m',metals:'5m'},'5m':{forex:'5m',crypto:'5m',metals:'5m'},'15m':{forex:'15m',crypto:'15m',metals:'15m'},'30m':{forex:'30m',crypto:'30m',metals:'30m'},'1H':{forex:'1h',crypto:'1h',metals:'1h'},'4H':{forex:'4h',crypto:'4h',metals:'4h'},'1D':{forex:'1d',crypto:'1d',metals:'1d'},'1W':{forex:'1wk',crypto:'1w',metals:'1wk'}};
const TIMEFRAME_LADDER={
  '1W':{bias:'1W',structure:'1D',entry:'4H'},
  '1D':{bias:'1D',structure:'4H',entry:'1H'},
  '4H':{bias:'1D',structure:'4H',entry:'1H'},
  '1H':{bias:'4H',structure:'1H',entry:'1H'},
  '30m':{bias:'4H',structure:'1H',entry:'30m'},
  '15m':{bias:'1H',structure:'15m',entry:'15m'},
  '5m':{bias:'1H',structure:'15m',entry:'5m'},
  '1m':{bias:'15m',structure:'5m',entry:'1m'}
};
const allowedIntervals=new Set(['1m','5m','15m','30m','4H','1H','1D','1W']);
function json(res,status,payload){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');res.end(JSON.stringify(payload))}
function sma(v,n){if(v.length<n)return null;return v.slice(-n).reduce((a,b)=>a+b,0)/n}
function ema(v,n){if(v.length<n)return null;let e=sma(v.slice(0,n),n),k=2/(n+1);for(let i=n;i<v.length;i++)e=v[i]*k+e*(1-k);return e}
function rsi(v,n=14){if(v.length<n+1)return 50;let g=0,l=0;for(let i=1;i<=n;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}let ag=g/n,al=l/n;for(let i=n+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n}if(al===0)return 100;return 100-100/(1+ag/al)}
function atr(c,n=14){if(c.length<n+1)return null;const t=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1];t.push(Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close)))}return sma(t.slice(-n),n)}
function roundPrice(v){if(v==null||!Number.isFinite(Number(v)))return null;v=Number(v);if(v>=1000)return Number(v.toFixed(2));if(v>=100)return Number(v.toFixed(3));if(v>=1)return Number(v.toFixed(5));if(v>=.1)return Number(v.toFixed(6));return Number(v.toPrecision(7))}
function normalize(rows){return rows.map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)})).filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite))}
function aggregateFourHour(c){const g=new Map(),b=14400000;for(const x of c){const k=Math.floor(x.time/b)*b;if(!g.has(k))g.set(k,[]);g.get(k).push(x)}return [...g].sort((a,b)=>a[0]-b[0]).map(([time,a])=>({time,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a.at(-1).close,volume:a.reduce((s,x)=>s+x.volume,0)}))}
const CFD_INSTRUMENTS=[
  {symbol:'XAUUSD',providerSymbol:'XAUUSD=X',name:'Gold / US Dollar',type:'CFD'},
  {symbol:'XAGUSD',providerSymbol:'XAGUSD=X',name:'Silver / US Dollar',type:'CFD'},
  {symbol:'US30',providerSymbol:'^DJI',name:'Dow Jones 30',type:'CFD'},
  {symbol:'US500',providerSymbol:'^GSPC',name:'S&P 500',type:'CFD'},
  {symbol:'NAS100',providerSymbol:'^IXIC',name:'Nasdaq 100',type:'CFD'},
  {symbol:'UK100',providerSymbol:'^FTSE',name:'FTSE 100',type:'CFD'},
  {symbol:'GER40',providerSymbol:'^GDAXI',name:'DAX 40',type:'CFD'},
  {symbol:'FRA40',providerSymbol:'^FCHI',name:'CAC 40',type:'CFD'},
  {symbol:'JP225',providerSymbol:'^N225',name:'Nikkei 225',type:'CFD'},
  {symbol:'HK50',providerSymbol:'^HSI',name:'Hang Seng',type:'CFD'},
  {symbol:'USOIL',providerSymbol:'CL=F',name:'WTI Crude Oil',type:'CFD'},
  {symbol:'UKOIL',providerSymbol:'BZ=F',name:'Brent Crude Oil',type:'CFD'}
];
function normalizeInstrumentList(rows){return [...new Map(rows.map(x=>[x.symbol,x])).values()];}
async function fetchYahoo(symbol,interval){const ri=interval==='4h'?'1h':interval,range=['5m','15m','30m'].includes(ri)?'7d':ri==='1h'?'3mo':ri==='1d'?'1y':'5y';let err='Forex data provider unavailable';for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com'])try{const r=await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${ri}&events=div%2Csplits`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});if(!r.ok){err=`Forex data provider returned ${r.status}`;continue}const body=await r.json(),q=body?.chart?.result?.[0]?.indicators?.quote?.[0],rows=(body?.chart?.result?.[0]?.timestamp||[]).map((t,i)=>[t*1000,q?.open?.[i],q?.high?.[i],q?.low?.[i],q?.close?.[i],q?.volume?.[i]||0]).filter(x=>x[4]!=null),c=normalize(rows);if(c.length<60){err='Forex provider returned insufficient candles';continue}return interval==='4h'?aggregateFourHour(c):c}catch(e){err=e?.message||err}throw new Error(err)}
const BYBIT_INTERVAL={'1m':'1','5m':'5','15m':'15','30m':'30','1H':'60','4H':'240','1D':'D','1W':'W'};
async function fetchBybit(symbol,timeframe){const r=await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${BYBIT_INTERVAL[timeframe]}&limit=300`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Bybit returned ${r.status}`);const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list)||!body.result.list.length)throw new Error(body?.retMsg||'Bybit returned no perpetual candles');return normalize(body.result.list.slice().reverse().map(x=>[x[0],x[1],x[2],x[3],x[4],x[5]]))}
async function candlesFor(market,symbol,timeframe){const mapped=TIMEFRAME_MAP[timeframe]?.[market==='forex'?'forex':'crypto'];if(!mapped)throw new Error('Unsupported timeframe');if(market==='forex')return fetchYahoo(`${symbol}=X`,mapped);if(market==='metals'){const cfd=CFD_INSTRUMENTS.find(x=>x.symbol===symbol);try{return await fetchYahoo(cfd?.providerSymbol||symbol,mapped)}catch(e){const fallback={XAUUSD:'GC=F',XAGUSD:'SI=F',US30:'^DJI',US500:'^GSPC',NAS100:'^IXIC',UK100:'^FTSE',GER40:'^GDAXI',FRA40:'^FCHI',JP225:'^N225',HK50:'^HSI',USOIL:'CL=F',UKOIL:'BZ=F'}[symbol];if(!fallback)throw e;return fetchYahoo(fallback,mapped)}}const clean=symbol.replace(/[^A-Z0-9]/gi,'');if(market==='perpetual')return fetchBybit(clean,timeframe);throw new Error('Unsupported market data source')}
function pivotHigh(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].high<=c[i-j].high)return false;for(let j=1;j<=right;j++)if(c[i].high<c[i+j].high)return false;return true}
function pivotLow(c,i,left=2,right=2){if(i<left||i>=c.length-right)return false;for(let j=1;j<=left;j++)if(c[i].low>=c[i-j].low)return false;for(let j=1;j<=right;j++)if(c[i].low>c[i+j].low)return false;return true}
function confirmedSwings(c){
  const highs=[],lows=[];for(let i=2;i<c.length-2;i++){if(pivotHigh(c,i))highs.push({p:c[i].high,i});if(pivotLow(c,i))lows.push({p:c[i].low,i});}return {highs,lows};
}
function structureBreak(c,bias,lookback=30){
  const st=marketStructure(c),start=Math.max(2,c.length-lookback);
  const refs=bias==='LONG'?st.highs:st.lows;
  for(const ref of refs.filter(x=>x.i>=start&&x.i<c.length-2).slice().reverse()){
    for(let i=ref.i+1;i<c.length;i++){
      if((bias==='LONG'&&c[i].close>ref.p)||(bias==='SHORT'&&c[i].close<ref.p))
        return {type:'BOS',level:ref.p,index:ref.i,breakIndex:i};
    }
  }
  return null;
}
function displacement(c,bias){
  if(c.length<8)return false;const last=c.at(-1),body=Math.abs(last.close-last.open),range=last.high-last.low,avg=c.slice(-7,-1).reduce((s,x)=>s+(x.high-x.low),0)/6;
  if(!range||body<range*.55||range<avg*1.15)return false;
  return bias==='LONG'?last.close>last.open&&last.close>=last.high-range*.25:last.close<last.open&&last.close<=last.low+range*.25;
}
function liquiditySweep(c,bias){
  const st=marketStructure(c),start=Math.max(2,c.length-20);
  if(bias==='LONG'){const ref=st.lows.filter(x=>x.i>=start&&x.i<c.length-2).at(-1);if(ref){for(let i=ref.i+1;i<c.length;i++)if(c[i].low<ref.p&&c[i].close>ref.p)return {type:'SELL-SIDE SWEEP',level:ref.p,index:i};}}
  if(bias==='SHORT'){const ref=st.highs.filter(x=>x.i>=start&&x.i<c.length-2).at(-1);if(ref){for(let i=ref.i+1;i<c.length;i++)if(c[i].high>ref.p&&c[i].close<ref.p)return {type:'BUY-SIDE SWEEP',level:ref.p,index:i};}}
  return null;
}
function fairValueGaps(c,bias){
  const out=[];for(let i=2;i<c.length;i++){const a=c[i-2],d=c[i];if(bias==='LONG'&&d.low>a.high)out.push({low:a.high,high:d.low,mid:(a.high+d.low)/2,index:i,type:'BULLISH FVG'});if(bias==='SHORT'&&d.high<a.low)out.push({low:d.high,high:a.low,mid:(d.high+a.low)/2,index:i,type:'BEARISH FVG'});}return out.filter(x=>x.index>=Math.max(2,c.length-80));
}
function orderBlockCandidates(c,bias){
  const out=[];for(let i=Math.max(2,c.length-60);i<c.length-1;i++){const x=c[i],n=c[i+1],body=Math.abs(x.close-x.open),nbody=Math.abs(n.close-n.open);
    if(bias==='LONG'&&x.close<x.open&&n.close>x.high&&nbody>=body*.9)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,type:'BULLISH ORDER BLOCK'});
    if(bias==='SHORT'&&x.close>x.open&&n.close<x.low&&nbody>=body*.9)out.push({low:x.low,high:x.high,mid:(x.low+x.high)/2,index:i,type:'BEARISH ORDER BLOCK'});
  }return out;
}
function entryZones(c,bias,current,a,maxAge=24){
  const zones=[...fairValueGaps(c,bias),...orderBlockCandidates(c,bias)].filter(z=>z.index<c.length-2);
  // A LIMIT setup is a live execution plan, not a historical zone bookmark.
  // Once price has travelled too far from an old FVG/OB, the original
  // imbalance may already be mitigated or structurally invalid. Keep zones
  // reasonably fresh and close enough to current price to remain executable.
  const maxDistance=Math.max(a*2.25,current*.0125);
  return zones.filter(z=>{
    const ahead=bias==='LONG'?z.mid<current:z.mid>current;
    const age=c.length-1-z.index;
    const distance=Math.abs(current-z.mid);
    return ahead&&age<=maxAge&&distance<=maxDistance;
  }).sort((x,y)=>Math.abs(current-x.mid)-Math.abs(current-y.mid));
}
function liquidityCandidates(c,bias,entry,a){
  const st=marketStructure(c),source=bias==='LONG'?st.highs:st.lows;
  const tolerance=Math.max(a*.18,entry*.0006),groups=[];
  for(const swing of source.filter(x=>x.i>=Math.max(0,c.length-120))){
    if(!Number.isFinite(swing.p))continue;
    const valid=bias==='LONG'?swing.p>entry:swing.p<entry;
    if(!valid)continue;
    let group=groups.find(g=>Math.abs(g.level-swing.p)<=tolerance);
    if(!group){group={level:swing.p,touches:0,lastIndex:swing.i};groups.push(group);}
    group.touches+=1;group.lastIndex=Math.max(group.lastIndex,swing.i);
  }
  const recentExtreme=bias==='LONG'
    ?Math.max(...c.slice(-80).map(x=>x.high))
    :Math.min(...c.slice(-80).map(x=>x.low));
  if(Number.isFinite(recentExtreme)&&(bias==='LONG'?recentExtreme>entry:recentExtreme<entry)){
    const group=groups.find(g=>Math.abs(g.level-recentExtreme)<=tolerance);
    if(group)group.touches+=1;
    else groups.push({level:recentExtreme,touches:1,lastIndex:c.length-1});
  }
  return groups.map(g=>({...g,distance:Math.abs(g.level-entry),type:g.touches>=2
    ?(bias==='LONG'?'EQUAL HIGHS / BUY-SIDE LIQUIDITY':'EQUAL LOWS / SELL-SIDE LIQUIDITY')
    :(bias==='LONG'?'SWING HIGH / BUY-SIDE LIQUIDITY':'SWING LOW / SELL-SIDE LIQUIDITY')
  })).sort((x,y)=>x.distance-y.distance);
}
function chooseLiquidityTarget(c,bias,entry,a){const candidates=liquidityCandidates(c,bias,entry,a);if(!candidates.length)return null;const chosen=candidates[0],buffer=Math.max(a*.08,entry*.00015),target=bias==='LONG'?chosen.level-buffer:chosen.level+buffer;if((bias==='LONG'&&target<=entry)||(bias==='SHORT'&&target>=entry))return null;return{target,type:chosen.type,liquidityLevel:chosen.level,touches:chosen.touches,distancePct:Number((chosen.distance*100).toFixed(2)),reason:`Targeting ${chosen.type.toLowerCase()} at ${roundPrice(chosen.level)}; TP is placed just before the liquidity to account for reaction.`}}
function protectiveStop(c,bias,entry,a){
  const st=marketStructure(c),sweep=liquiditySweep(c,bias),buffer=Math.max(a*.16,entry*.00025);
  const swings=bias==='LONG'?st.lows:st.highs;
  const recent=swings.filter(x=>x.i>=Math.max(0,c.length-50)&& (bias==='LONG'?x.p<entry:x.p>entry));
  let invalidation=bias==='LONG'
    ?(recent.at(-1)?.p??st.protectedLow??Math.min(...c.slice(-20).map(x=>x.low)))
    :(recent.at(-1)?.p??st.protectedHigh??Math.max(...c.slice(-20).map(x=>x.high)));
  if(sweep)invalidation=bias==='LONG'?Math.min(invalidation,sweep.level):Math.max(invalidation,sweep.level);
  let stop=bias==='LONG'?invalidation-buffer:invalidation+buffer;
  const maxRisk=Math.max(a*2.2,entry*.025);
  if(bias==='LONG')stop=Math.max(stop,entry-maxRisk);else stop=Math.min(stop,entry+maxRisk);
  return stop;
}
function structuralEntryCandidates(c,bias,current,a){
  const zones=entryZones(c,bias,current,a),sweep=liquiditySweep(c,bias),bos=structureBreak(c,bias,36),candidates=[];
  for(const z of zones)candidates.push({entry:z.mid,zone:z});
  if(sweep)candidates.push({entry:bias==='LONG'?sweep.level+a*.10:sweep.level-a*.10,zone:sweep});
  if(bos)candidates.push({entry:current,zone:bos});
  return candidates.sort((x,y)=>Math.abs(current-x.entry)-Math.abs(current-y.entry));
}
function stopForEntry(c,bias,entry,a){return protectiveStop(c,bias,entry,a);}
function targetPool(c,bias,entry,a){
  const structural=liquidityCandidates(c,bias,entry,a).map(x=>x.level).filter(Number.isFinite);
  const window=c.slice(-80);
  const previous=c.slice(-160,-80);
  const extremes=bias==='LONG'
    ?[Math.max(...window.map(x=>x.high)),...(previous.length?[Math.max(...previous.map(x=>x.high))]:[])]
    : [Math.min(...window.map(x=>x.low)),...(previous.length?[Math.min(...previous.map(x=>x.low))]:[])];
  const maxDistance=Math.max(a*8,entry*.04);
  return [...new Set([...structural,...extremes])]
    .filter(level=>Number.isFinite(level))
    .filter(level=>bias==='LONG'?level>entry&&level-entry<=maxDistance:level<entry&&entry-level<=maxDistance)
    .sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function evaluateTrade(c,bias,entry,a,minRR=2.25){
  const stop=stopForEntry(c,bias,entry,a),risk=Math.abs(entry-stop),minimumRisk=Math.max(a*.65,entry*.001);
  if(!risk||!Number.isFinite(risk)||risk<minimumRisk)return null;
  const pools=targetPool(c,bias,entry,a);
  const buffer=Math.max(a*.08,entry*.00015);
  const candidates=pools.map(level=>{
    const target=bias==='LONG'?level-buffer:level+buffer;
    const reward=Math.abs(target-entry);
    return {level,target,reward,rr:reward/risk};
  }).filter(x=>Number.isFinite(x.target)&&x.rr>=minRR);
  if(!candidates.length)return null;
  const chosen=candidates[0];
  const target2Candidate=pools.slice(1).map(level=>{
    const target=bias==='LONG'?level-buffer:level+buffer;
    return {target,rr:Math.abs(target-entry)/risk};
  }).find(x=>x.rr>chosen.rr&&Math.abs(x.target-chosen.target)>a*.3);
  return {
    entry,
    stop,
    risk,
    target:chosen.target,
    targetLiquidity:chosen.level,
    target2:target2Candidate?.target??null,
    target2Liquidity:target2Candidate?.target??null,
    rr:chosen.rr
  };
}
function marketStructure(c){
  const {highs,lows}=confirmedSwings(c),h=highs.slice(-8),l=lows.slice(-8);
  const recentH=h.slice(-4),recentL=l.slice(-4),lastH=h.at(-1)?.p??null,lastL=l.at(-1)?.p??null;
  const prevH=h.at(-2)?.p??null,prevL=l.at(-2)?.p??null;
  const higherHigh=prevH!=null&&lastH>prevH,lowerHigh=prevH!=null&&lastH<prevH;
  const higherLow=prevL!=null&&lastL>prevL,lowerLow=prevL!=null&&lastL<prevL;
  const risingHighs=recentH.length>=3&&recentH.slice(1).every((x,i)=>x.p>recentH[i].p);
  const fallingHighs=recentH.length>=3&&recentH.slice(1).every((x,i)=>x.p<recentH[i].p);
  const risingLows=recentL.length>=3&&recentL.slice(1).every((x,i)=>x.p>recentL[i].p);
  const fallingLows=recentL.length>=3&&recentL.slice(1).every((x,i)=>x.p<recentL[i].p);
  const close=c.at(-1)?.close??null;
  const bullishBreak=lastH!=null&&close>lastH;
  const bearishBreak=lastL!=null&&close<lastL;
  let trend='RANGE';
  if((risingHighs&&risingLows)||bullishBreak)trend='LONG';
  else if((fallingHighs&&fallingLows)||bearishBreak)trend='SHORT';
  else if(higherHigh&&higherLow)trend='LONG';
  else if(lowerHigh&&lowerLow)trend='SHORT';
  return {
    trend,higherHigh,higherLow,lowerHigh,lowerLow,risingHighs,risingLows,fallingHighs,fallingLows,
    bullishBreak,bearishBreak,lastHigh:lastH,lastLow:lastL,
    protectedHigh:trend==='SHORT'?(prevH??lastH):lastH,
    protectedLow:trend==='LONG'?(prevL??lastL):lastL,
    highs,lows
  };
}
function structureBias(st){return st.trend==='LONG'||st.trend==='SHORT'?st.trend:'WAIT'}
function opposite(a,b){return (a==='LONG'&&b==='SHORT')||(a==='SHORT'&&b==='LONG')}
function topDownDecision(htf,mtf,ltf){
  const higherBias=structureBias(htf);
  const middleBias=structureBias(mtf);
  const entryBias=structureBias(ltf);
  // Higher-timeframe structure is authoritative. The execution timeframe is
  // confirmation, not a second directional engine: a RANGE on the entry TF
  // means "waiting for confirmation", while an actual opposite structure is
  // a hard conflict. This prevents the old exact-alignment gate from turning
  // every otherwise valid pullback into WAIT.
  const bias=higherBias;
  const hardConflict=(higherBias!=='WAIT'&&middleBias!=='WAIT'&&opposite(higherBias,middleBias));
  const middleAligned=higherBias!=='WAIT'&&middleBias===higherBias;
  const entryConfirmed=entryBias===higherBias;
  const structureAligned=Boolean(middleAligned && (entryConfirmed || entryBias==='WAIT'));
  return {bias,higherBias,middleBias,entryBias,conflict:hardConflict,structureAligned,middleAligned,entryConfirmed};
}
function setupQuality(c,bias,entry,trade,e20,e50,r,confirmation){
  if(!trade)return {score:0,grade:'WAIT',structure:marketStructure(c)};const st=marketStructure(c);let score=0;
  if(st.trend===bias)score+=2;if(confirmation?.bos)score+=2;if(confirmation?.sweep)score+=2;if(confirmation?.displacement)score+=2;
  if((bias==='LONG'&&e20>e50)||(bias==='SHORT'&&e20<e50))score+=1;
  if((bias==='LONG'&&r>=48&&r<=70)||(bias==='SHORT'&&r>=30&&r<=52))score+=1;if(trade.rr>=3)score+=2;else if(trade.rr>=2.25)score+=1;
  return {score,grade:score>=9?'A':score>=7?'B':'C',structure:st};
}

const STRATEGIES={
  TOP_DOWN:{name:'Top-Down',short:'HTF structure first',description:'Starts with higher-timeframe structure, then requires the middle and execution layers to provide a tradable confirmation.',objective:'Trade only when the higher-timeframe storyline and a current execution condition agree.',rules:['Higher timeframe establishes direction.','Middle timeframe confirms or exposes a hard conflict.','Execution timeframe supplies a current market or fresh limit entry.','No synthetic levels when the required evidence is missing.']},
  PULLBACK:{name:'Pullback',short:'Impulse → retracement → continuation',description:'Waits for a real directional impulse, then looks for a fresh FVG or order block retracement that remains valid inside the higher-timeframe direction.',objective:'Enter continuation after price retraces into a qualified, still-live execution zone.',rules:['HTF direction must be established.','A recent directional impulse must exist.','Price must be retracing into a fresh FVG or order block.','The zone must be unmitigated, close enough to execute and offer at least 2.25R.','A broken or stale zone is rejected.']},
  BREAKOUT:{name:'Breakout',short:'Close → displacement → continuation',description:'Requires a structural level to break with a decisive candle close and displacement. Wick-only breaks are rejected.',objective:'Participate only after price proves acceptance beyond a meaningful structure level.',rules:['HTF direction must support the break.','A recent BOS must be present.','The break must have decisive displacement, not a wick-only breach.','The current price must remain close enough to the confirmed break leg for execution.','Insufficient RR or stale breaks are rejected.']},
  SMC:{name:'SMC',short:'Liquidity → displacement → BOS → POI',description:'Uses a Smart Money Concepts sequence: liquidity sweep, displacement, break of structure and a fresh FVG/order-block point of interest.',objective:'Trade the post-liquidity repricing leg rather than guessing direction before the displacement.',rules:['HTF direction is the directional filter.','A meaningful opposing liquidity pool must be swept and reclaimed.','Displacement must follow the sweep.','BOS/structure confirmation must be present.','Entry must use a fresh FVG or order block when price is away from the immediate execution point.']},
  MSNR:{name:'MSNR',short:'Malaysian Support & Resistance',description:'Uses the Malaysian Support and Resistance framework: higher-timeframe storyline, fresh key levels, V/A formations, SBR/RBS flips and kissing-candle base zones, followed by lower-timeframe confirmation.',objective:'Wait for price to return to a fresh MSNR level and prove the reaction before execution.',rules:['Daily/4H storyline establishes the directional context.','Fresh, unmitigated support/resistance must be identified.','SBR/RBS flips and V/A turning structures are treated as level evidence.','Kissing-candle overlap can define the reaction base.','A tap alone is not an entry; lower-timeframe BOS or engulfing confirmation is required.','If the level is stale, already mitigated or lacks confirmation, no setup is issued.']},
  PRICE_ACTION:{name:'Price Action',short:'Structure + candle confirmation',description:'Focuses on market structure, rejection and engulfing behaviour without requiring an SMC-specific liquidity sequence.',objective:'Use clean structural price action to confirm continuation or reversal at a meaningful level.',rules:['HTF structure provides the directional context.','Price must interact with a meaningful recent swing or zone.','A clear rejection or engulfing confirmation is required.','The invalidation must sit beyond the structure being traded.','Target must be a real structural/liquidity level with at least 2.25R.']},
  LIQUIDITY_REVERSAL:{name:'Liquidity Reversal',short:'Sweep → reclaim → reversal',description:'Targets reversals only after price takes a recent swing/liquidity level and closes back through it with displacement.',objective:'Avoid catching falling knives by waiting for the sweep and reclaim to become observable evidence.',rules:['A recent swing high/low must be swept.','Price must reclaim the swept level.','Displacement must confirm the reversal leg.','The stop belongs beyond the swept structure.','No reversal setup is issued without a genuine sweep.']}
};
const STRATEGY_KEYS=new Set(Object.keys(STRATEGIES));
function normalizeStrategy(v){const key=String(v||'TOP_DOWN').toUpperCase();return STRATEGY_KEYS.has(key)?key:'TOP_DOWN'}
function candleEngulfing(c,bias){
  if(c.length<2)return false;
  const p=c.at(-2),x=c.at(-1);
  if(bias==='LONG')return p.close<p.open&&x.close>x.open&&x.open<=p.close&&x.close>=p.open;
  if(bias==='SHORT')return p.close>p.open&&x.close<x.open&&x.open>=p.close&&x.close<=p.open;
  return false;
}
function rejectionCandle(c,bias){
  if(!c.length)return false;
  const x=c.at(-1),range=x.high-x.low;if(!range)return false;
  const upper=x.high-Math.max(x.open,x.close),lower=Math.min(x.open,x.close)-x.low;
  return bias==='LONG'?(lower/range>=.45&&x.close>x.low+range*.55):(upper/range>=.45&&x.close<x.high-range*.55);
}
function msnrLevels(c,bias){
  const st=marketStructure(c),levels=[],last=c.at(-1)?.close;
  const source=bias==='LONG'?st.lows:st.highs;
  for(const x of source.slice(-10)){
    if((bias==='LONG'&&x.p<last)||(bias==='SHORT'&&x.p>last))levels.push({level:x.p,index:x.i,type:bias==='LONG'?'SUPPORT':'RESISTANCE'});
  }
  const oppositeSource=bias==='LONG'?st.highs:st.lows;
  for(const x of oppositeSource.slice(-10)){
    const later=c.slice(x.i+1);
    const flipped=bias==='LONG'?later.some(k=>k.close>x.p)&&last>x.p:later.some(k=>k.close<x.p)&&last<x.p;
    if(flipped)levels.push({level:x.p,index:x.i,type:bias==='LONG'?'RBS':'SBR'});
  }
  for(let i=Math.max(1,c.length-30);i<c.length-1;i++){
    const a=c[i],b=c[i+1],overlapLow=Math.max(a.low,b.low),overlapHigh=Math.min(a.high,b.high);
    if(overlapLow<overlapHigh)levels.push({level:(overlapLow+overlapHigh)/2,index:i,type:'KISSING CANDLE BASE'});
  }
  return levels.filter(x=>Number.isFinite(x.level)&&c.length-1-x.index<=80).sort((a,b)=>Math.abs(last-a.level)-Math.abs(last-b.level));
}
function msnrFormation(c,bias){
  if(c.length<6)return null;
  const x=c.at(-1),range=Math.max(x.high-x.low,1e-12);
  const v=bias==='LONG'&&x.close>x.open&&x.low<=Math.min(...c.slice(-6,-1).map(k=>k.low))&&x.close>x.low+range*.55;
  const a=bias==='SHORT'&&x.close<x.open&&x.high>=Math.max(...c.slice(-6,-1).map(k=>k.high))&&x.close<x.high-range*.55;
  return v?'V FORMATION':a?'A FORMATION':null;
}
function strategyPlan(candlesByTf,ladder,strategy,bias,instrumentSymbol,executionTimeframe){
  const key=normalizeStrategy(strategy),info=STRATEGIES[key],htf=candlesByTf[ladder.bias],mtf=candlesByTf[ladder.structure],ltf=candlesByTf[ladder.entry],current=candlesByTf[executionTimeframe];
  const base=analyzeCandles(current,bias,instrumentSymbol,executionTimeframe),a=atr(current),last=current.at(-1);
  const htfBias=structureBias(marketStructure(htf)),evidence=[],failures=[];
  let valid=false,planEntry=base.entry,planOrder=base.orderType,planReason='',strategyTrade=null;
  const baseReady=Boolean(base.tradeReady&&base.entry!=null&&base.stopLoss!=null&&base.takeProfit1!=null);
  const validTrade=t=>Boolean(t&&t.rr>=2.25&&Number.isFinite(t.stop)&&Number.isFinite(t.target));
  if(key==='TOP_DOWN'){
    valid=baseReady;
    planReason=valid?'Higher-timeframe structure is confirmed and the base execution engine has a valid trade plan.':'Directional context exists, but no fully validated execution plan is present.';
    evidence.push('Higher timeframe establishes direction.','Middle timeframe is checked for conflict.','Execution timeframe supplies the final trade condition.');
  } else if(key==='PULLBACK'){
    const impulse=structureBreak(current,bias,48),zones=entryZones(current,bias,last.close,a,24),zone=zones[0],distance=zone?Math.abs(last.close-zone.mid):Infinity;
    strategyTrade=zone?evaluateTrade(current,bias,zone.mid,a,2.25):null;
    valid=Boolean(validTrade(strategyTrade)&&impulse&&zone&&distance>Math.max(a*.12,last.close*.0004));
    if(valid){planEntry=zone.mid;planOrder='LIMIT';planReason='A recent directional impulse is retracing into a fresh FVG/order-block zone.'}
    else planReason='Waiting for a fresh pullback into a qualified, executable FVG/order-block zone after a real impulse.';
    evidence.push(impulse?'Recent directional impulse confirmed.':'No recent directional impulse.',zone?zone.type+' remains available.':'No fresh pullback zone is available.');
  } else if(key==='BREAKOUT'){
    const bos=structureBreak(current,bias,36),fresh=bos&&bos.breakIndex>=current.length-12,disp=displacement(current,bias);
    strategyTrade=evaluateTrade(current,bias,last.close,a,2.25);
    valid=Boolean(validTrade(strategyTrade)&&bos&&fresh&&disp);
    if(valid){planEntry=last.close;planOrder='MARKET';}
    planReason=valid?'A structure level closed through with current displacement; the breakout is still actionable.':'Waiting for a decisive close through structure with displacement. Wick-only breaks are rejected.';
    evidence.push(bos?'Recent BOS detected.':'No recent BOS.',disp?'Displacement confirmed.':'No displacement confirmation.',fresh?'Break is recent.':'Break is stale.');
  } else if(key==='SMC'){
    const sweep=liquiditySweep(current,bias),bos=structureBreak(current,bias,48),disp=displacement(current,bias),zones=[...fairValueGaps(current,bias),...orderBlockCandidates(current,bias)].filter(z=>z.index>=current.length-25);
    const smcZone=zones[0],smcEntry=smcZone?.mid??last.close;
    strategyTrade=evaluateTrade(current,bias,smcEntry,a,2.25);
    valid=Boolean(validTrade(strategyTrade)&&sweep&&bos&&disp&&(zones.length||base.orderType==='MARKET'));
    if(valid){planEntry=smcEntry;planOrder=smcZone?'LIMIT':'MARKET';}
    planReason=valid?'Liquidity was swept, displacement followed and structure confirmed; the entry is tied to a fresh SMC point of interest.':'Waiting for the full SMC sequence: liquidity sweep, displacement, BOS and a fresh POI.';
    evidence.push(sweep?sweep.type+' confirmed.':'No qualifying liquidity sweep.',disp?'Displacement confirmed.':'No displacement.',bos?'BOS confirmed.':'No BOS.',zones[0]?.type||'No fresh FVG/order block.');
  } else if(key==='MSNR'){
    const levels=msnrLevels(htf,bias),level=levels.find(z=>Math.abs(last.close-z.level)<=Math.max(a*1.5,last.close*.0025)),formation=msnrFormation(ltf,bias),bos=structureBreak(ltf,bias,24),engulf=candleEngulfing(ltf,bias),confirm=Boolean(bos||engulf);
    const msnrEntry=level?.level??last.close;
    strategyTrade=evaluateTrade(current,bias,msnrEntry,a,2.25);
    valid=Boolean(validTrade(strategyTrade)&&htfBias===bias&&level&&confirm);
    if(valid){planEntry=msnrEntry;planOrder=msnrEntry!==last.close?'LIMIT':'MARKET';}
    planReason=valid?'Price tapped a fresh MSNR level and lower-timeframe confirmation is present.':'Waiting for a fresh MSNR support/resistance level to be tapped and confirmed on the lower timeframe.';
    evidence.push(htfBias===bias?'HTF storyline agrees with direction.':'HTF storyline does not support this direction.',level?level.type+' level at '+roundPrice(level.level):'No fresh MSNR level in range.',formation||'No V/A formation detected.',confirm?'Lower-timeframe confirmation present.':'No BOS, engulfing or rejection confirmation.');
  } else if(key==='PRICE_ACTION'){
    const level=msnrLevels(current,bias)[0],engulf=candleEngulfing(current,bias),reject=rejectionCandle(current,bias);
    strategyTrade=evaluateTrade(current,bias,last.close,a,2.25);
    valid=Boolean(validTrade(strategyTrade)&&level&&(engulf||reject));
    if(valid){planEntry=last.close;planOrder='MARKET';}
    planReason=valid?'Price interacted with a recent structural level and printed a confirming candle.':'Waiting for price to reach a meaningful structure level and print rejection or engulfing confirmation.';
    evidence.push(level?'Recent structural level is nearby.':'No nearby structural level.',engulf?'Engulfing confirmation.':reject?'Rejection confirmation.':'No candle confirmation.');
  } else if(key==='LIQUIDITY_REVERSAL'){
    const sweep=liquiditySweep(current,bias),disp=displacement(current,bias),reclaim=sweep&&((bias==='LONG'&&last.close>sweep.level)||(bias==='SHORT'&&last.close<sweep.level));
    strategyTrade=evaluateTrade(current,bias,last.close,a,2.25);
    valid=Boolean(validTrade(strategyTrade)&&sweep&&disp&&reclaim);
    if(valid){planEntry=last.close;planOrder='MARKET';}
    planReason=valid?'A recent liquidity sweep was reclaimed with displacement; reversal execution is confirmed.':'Waiting for a genuine liquidity sweep, reclaim and displacement before considering a reversal.';
    evidence.push(sweep?sweep.type+' confirmed.':'No genuine liquidity sweep.',reclaim?'Sweep level reclaimed.':'No reclaim yet.',disp?'Displacement confirms reversal.':'No displacement.');
  }
  // A strategy may be valid for a pending LIMIT even when the current candle is not a MARKET trigger.
  // Only use real structural levels/POIs with a complete stop/target calculation; never invent an entry.
  if(!valid && bias!=='WAIT' && htfBias===bias){
    const currentPrice=last.close;
    const maxZoneDistance=Math.max(a*3.5,currentPrice*.03);
    let candidate=null,candidateTrade=null,candidateReason='';
    if(key==='PULLBACK'){
      const zones=entryZones(current,bias,currentPrice,a,60).filter(z=>Math.abs(currentPrice-z.mid)<=maxZoneDistance);
      for(const z of zones){const t=evaluateTrade(current,bias,z.mid,a,2.25);if(validTrade(t)){candidate={...z,entry:z.mid};candidateTrade=t;break;}}
      if(candidate){candidateReason='A live directional pullback zone is available. The limit order is anchored to the real FVG/order block and invalidated beyond structure.';evidence.push(candidate.type+' is a live executable pullback zone.');}
    } else if(key==='BREAKOUT'){
      const bos=structureBreak(current,bias,60);
      if(bos&&bos.breakIndex>=Math.max(0,current.length-36)){const t=evaluateTrade(current,bias,bos.level,a,2.25);if(validTrade(t)){candidate={entry:bos.level,type:'BREAKOUT RETEST',index:bos.breakIndex};candidateTrade=t;candidateReason='The structure break is confirmed; the order is staged at the broken level for a retest instead of chasing the current price.';evidence.push('Confirmed BOS is available for a retest LIMIT.');}}
    } else if(key==='SMC'){
      const zones=[...fairValueGaps(current,bias),...orderBlockCandidates(current,bias)].filter(z=>z.index>=current.length-60).filter(z=>Math.abs(currentPrice-z.mid)<=maxZoneDistance);
      const zone=zones[0];
      if(zone){const t=evaluateTrade(current,bias,zone.mid,a,2.25);if(validTrade(t)){candidate={...zone,entry:zone.mid};candidateTrade=t;candidateReason='A fresh SMC point of interest is available below/above current price; the limit is anchored to that real FVG/order block while price is away from execution.';evidence.push(zone.type+' is a live SMC point of interest.');}}
    } else if(key==='MSNR'){
      const levels=msnrLevels(htf,bias).filter(z=>Math.abs(currentPrice-z.level)<=maxZoneDistance);
      const level=levels[0];
      // MSNR confirmation remains required for a market entry. A LIMIT is only staged when price is already at/inside the level and the complete risk/target model is valid.
      if(level&&Math.abs(currentPrice-level.level)<=Math.max(a*.75,currentPrice*.0015)){const t=evaluateTrade(current,bias,level.level,a,2.25);if(validTrade(t)){candidate={entry:level.level,type:level.type,index:level.index};candidateTrade=t;candidateReason='Price is at a qualified MSNR level. The limit is anchored to the live level; lower-timeframe confirmation is still recorded as the strategy trigger.';evidence.push(level.type+' level is currently being tested.');}}
    }
    if(candidate&&candidateTrade){
      valid=true;strategyTrade=candidateTrade;planEntry=candidate.entry;planOrder='LIMIT';planReason=candidateReason;
    }
  }
  if(!valid){
    for(const x of evidence)if(/No |Waiting|not support|stale/i.test(x))failures.push(x);
    return {...base,strategy:key,strategyName:info.name,strategyShort:info.short,marketRegime:htfBias||'WAIT',strategyValid:false,strategyReady:false,strategyEvidence:evidence,strategyFailures:failures,strategyReason:planReason||info.description,tradeReady:false,orderType:'NO_SETUP',entry:null,limitEntry:null,stopLoss:null,takeProfit1:null,takeProfit2:null,riskReward:'—',riskRewardValue:null,quality:'NO SETUP',setupStatus:'NO SETUP',setupReason:planReason||'No strategy-valid setup is present.'};
  }
  const finalTrade=strategyTrade||base;
  return {...base,strategy:key,strategyName:info.name,strategyShort:info.short,marketRegime:htfBias,strategyValid:true,strategyReady:true,strategyEvidence:evidence,strategyFailures:[],strategyReason:planReason,entry:planEntry??finalTrade.entry,limitEntry:planOrder==='LIMIT'?(planEntry??finalTrade.entry):null,stopLoss:roundPrice(finalTrade.stop??base.stopLoss),takeProfit1:roundPrice(finalTrade.target??base.takeProfit1),takeProfit2:roundPrice(finalTrade.target2??base.takeProfit2),riskReward:finalTrade.rr!=null?'1:'+Number(finalTrade.rr).toFixed(2):base.riskReward,riskRewardValue:finalTrade.rr??base.riskRewardValue,orderType:planOrder,tradeReady:true,setupStatus:'TRADE READY',setupReason:planReason};
}

function analyzeCandles(c,forcedBias=null,instrumentSymbol='',executionTimeframe='1H'){
  if(c.length<60)throw new Error('Not enough candles for a reliable setup ('+c.length+' received)');
  const closes=c.map(x=>x.close),last=c.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c);if(![e20,e50,a].every(Number.isFinite))throw new Error('Indicators could not be calculated from market data');
  const confirmationWindow={ '1m':8,'5m':8,'15m':10,'30m':10,'1H':12,'4H':8,'1D':6,'1W':4 }[executionTimeframe]||10;
  const limitZoneAge={ '1m':12,'5m':16,'15m':24,'30m':24,'1H':24,'4H':12,'1D':8,'1W':6 }[executionTimeframe]||24;
  const st=marketStructure(c),rawScore=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0),engineBias=st.trend!=='RANGE'?st.trend:(rawScore>=2?'LONG':rawScore<=-2?'SHORT':'WAIT'),bias=forcedBias||engineBias;
  let trade=null,orderType='WAIT',entry=last.close,limitEntry=null,setupReason='No clean opportunity at the current price.';
  const bos=structureBreak(c,bias,36),sweep=liquiditySweep(c,bias),freshSweep=sweep&&sweep.index>=c.length-confirmationWindow,freshBos=bos&&bos.breakIndex>=c.length-confirmationWindow;
  let impulse=false,impulseIndex=-1;
  for(let i=Math.max(0,c.length-6);i<c.length;i++){
    const tail=c.slice(0,i+1);
    if(displacement(tail,bias)){impulse=true;impulseIndex=i;}
  }
  const freshImpulse=impulse&&impulseIndex>=c.length-confirmationWindow,confirmation={bos:freshBos,sweep:freshSweep,displacement:freshImpulse};
  // Confirmation can mature over several candles. A valid bullish/bearish
  // structure should not disappear simply because displacement was not the
  // literal last candle. Prefer a live MARKET execution when price remains
  // close to the confirmed break/sweep leg; otherwise use a fresh LIMIT zone.
  const confirmationAge=Math.min(
    freshBos&&bos?.breakIndex!=null?c.length-1-bos.breakIndex:99,
    freshSweep&&sweep?.index!=null?c.length-1-sweep.index:99
  );
  const liveImpulseAge=freshImpulse?c.length-1-impulseIndex:99;
  const matureConfirmation=Boolean((freshBos||freshSweep)&&impulse&&confirmationAge<=confirmationWindow&&liveImpulseAge<=confirmationWindow);
  if(bias!=='WAIT'){
    const marketTrade=evaluateTrade(c,bias,last.close,a,2.25),marketQuality=setupQuality(c,bias,last.close,marketTrade,e20,e50,r,{...confirmation,displacement:impulse}),marketConfirmed=Boolean(matureConfirmation);
    if(marketTrade&&marketConfirmed&&marketQuality.score>=7){trade=marketTrade;orderType='MARKET';entry=last.close;setupReason=freshSweep?'Liquidity was swept and reclaimed, followed by displacement. Current price is the confirmed execution point.':'Structure broke with displacement and current price is still inside the valid execution leg.';}
    else{
      const candidates=structuralEntryCandidates(c,bias,last.close,a).filter(candidate=>!candidate.zone||candidate.zone.index==null||c.length-1-candidate.zone.index<=limitZoneAge);let best=null,bestTrade=null,bestQuality={score:0};
      for(const candidate of candidates){const t=evaluateTrade(c,bias,candidate.entry,a,2.25),zone=candidate.zone,zoneBonus=zone?.type?.includes('FVG')||zone?.type?.includes('ORDER BLOCK')?2:0,q2=setupQuality(c,bias,candidate.entry,t,e20,e50,r,confirmation);if(t&&q2.score+zoneBonus>bestQuality.score){best=candidate;bestTrade=t;bestQuality={...q2,score:q2.score+zoneBonus};}}
      const validLimit=Boolean(bestTrade&&best?.zone&&(best.zone.type?.includes('FVG')||best.zone.type?.includes('ORDER BLOCK'))&&bestQuality.score>=5);
      if(validLimit){trade=bestTrade;orderType='LIMIT';entry=best.entry;limitEntry=best.entry;setupReason='Price is away from the confirmed execution zone. The limit entry is anchored to a real FVG or order block, with invalidation beyond structure and target at external liquidity.';}
      else if(marketTrade&&marketConfirmed&&marketQuality.score>=5){trade=marketTrade;orderType='MARKET';entry=last.close;setupReason='Confirmed structure and displacement remain valid; current price is still inside the active execution leg.';}
      else if(marketTrade&&freshBos&&impulse&&marketQuality.score>=6&&confirmationAge<=confirmationWindow&&liveImpulseAge<=confirmationWindow){trade=marketTrade;orderType='MARKET';entry=last.close;setupReason='Recent structure break and displacement remain active; current price is a valid market execution point.';}
      else setupReason='Bias exists, but there is no confirmed market entry or structurally valid pullback zone with a legitimate target.';
    }
  }
  const confidence=Math.min(94,Math.max(38,Math.round(45+(st.trend===bias?10:0)+(freshBos?12:0)+(freshSweep?10:0)+(impulse?8:0)+(((bias==='LONG'&&e20>e50)||(bias==='SHORT'&&e20<e50))?5:0)+(((bias==='LONG'&&r>=48&&r<=70)||(bias==='SHORT'&&r>=30&&r<=52))?5:0))));
  const stop=trade?.stop??null,risk=trade?.risk??null,riskPct=entry>0&&risk!=null?(risk/entry)*100:null,target1=trade?.target??null,target2=trade?.target2??null,targetRisk=trade?.rr??null,q3=setupQuality(c,bias,entry,trade,e20,e50,r,confirmation);
  const tradeReady=Boolean(trade&&target1!=null&&targetRisk>=2.25&&q3.score>=6),status=tradeReady?(targetRisk>=3?'A-GRADE':'QUALITY'):'WAIT';
  const liquidity=tradeReady&&trade.targetLiquidity!=null?{
    target:target1,
    liquidityLevel:trade.targetLiquidity,
    type:liquidityCandidates(c,bias,entry,a).find(x=>Math.abs(x.level-trade.targetLiquidity)<=Math.max(a*.18,entry*.0006))?.type||'STRUCTURAL LIQUIDITY',
    touches:liquidityCandidates(c,bias,entry,a).find(x=>Math.abs(x.level-trade.targetLiquidity)<=Math.max(a*.18,entry*.0006))?.touches||0,
    distancePct:Number((Math.abs(trade.targetLiquidity-entry)*100/entry).toFixed(2)),
    reason:'Target is the nearest qualified external liquidity level within the risk model; TP is placed just before that liquidity.'
  }:null;
  const stopDistance=tradeReady?Math.abs(entry-stop):null,stopDistancePct=tradeReady&&entry?(stopDistance/entry)*100:null,instrumentKey=String(instrumentSymbol||''),priceUnitLabel=(instrumentKey.includes('/')&&!instrumentKey.includes('USDT'))?'pips':'price units',pipMultiplier=(instrumentKey.includes('/')&&!instrumentKey.includes('USDT'))?(instrumentKey.includes('JPY')?100:10000):1,stopDistanceUnits=tradeReady?stopDistance*pipMultiplier:null;
  return {bias,engineBias,confidence,entry:roundPrice(tradeReady?entry:null),marketEntry:roundPrice(last.close),limitEntry:roundPrice(limitEntry),orderType:tradeReady?orderType:'WAIT',stopLoss:roundPrice(tradeReady?stop:null),takeProfit1:roundPrice(tradeReady?target1:null),takeProfit2:roundPrice(tradeReady?target2:null),riskReward:tradeReady?'1:'+targetRisk.toFixed(2):'—',riskPercent:tradeReady?Number(riskPct.toFixed(2)):null,stopDistance:tradeReady?roundPrice(stopDistance):null,stopDistancePct:tradeReady?Number(stopDistancePct.toFixed(3)):null,stopDistanceUnits:tradeReady?Number(stopDistanceUnits.toFixed(2)):null,priceUnitLabel,structuralInvalidation:tradeReady?roundPrice(stop):null,tradeReady,riskRewardValue:tradeReady?Number(targetRisk.toFixed(2)):null,quality:status,qualityScore:q3.score,marketStructure:q3.structure?.trend||st.trend,setupStatus:tradeReady?'TRADE READY':'WAIT',setupReason,rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),swingHigh:roundPrice(Math.max(...c.slice(-30).map(x=>x.high))),swingLow:roundPrice(Math.min(...c.slice(-30).map(x=>x.low))),liquidityTarget:liquidity?roundPrice(liquidity.liquidityLevel):null,liquidityType:liquidity?.type||'No confirmed target',liquidityTouches:liquidity?.touches||0,liquidityDistancePct:liquidity?.distancePct||null,liquidityReason:tradeReady?(liquidity?.reason||'Target is derived from a legitimate structural/liquidity level.'):'No target is shown because no quality trade is currently available.',confirmation:{bos:Boolean(freshBos),sweep:Boolean(freshSweep),displacement:Boolean(impulse)},timestamp:last.time};
}
function buildTopDown(candlesByTf,ladder){
  const htf=marketStructure(candlesByTf[ladder.bias]),mtf=marketStructure(candlesByTf[ladder.structure]),ltf=marketStructure(candlesByTf[ladder.entry]);
  const d=topDownDecision(htf,mtf,ltf);
  return {bias:d.bias,higherBias:d.higherBias,middleBias:d.middleBias,entryBias:d.entryBias,conflict:d.conflict,structureAligned:d.structureAligned,higherStructure:htf,middleStructure:mtf,entryStructure:ltf};
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{if(String(req.query?.action||'')==='header'){const r=await fetch('https://api.bybit.com/v5/market/tickers?category=linear',{headers:{Accept:'application/json'}});if(!r.ok)return json(res,502,{error:'Bybit ticker provider unavailable'});const body=await r.json();if(body?.retCode!==0||!Array.isArray(body?.result?.list))return json(res,502,{error:body?.retMsg||'Bybit ticker provider unavailable'});const wanted=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT']);const result=body.result.list.filter(x=>wanted.has(x.symbol)).map(x=>({symbol:x.symbol,lastPrice:x.lastPrice,price24hPcnt:x.price24hPcnt}));return json(res,200,{ok:true,result});} const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');if(req.query?.action==='instruments'){
      if(market==='metals'){
        const query=String(req.query?.q||'').trim().toUpperCase();
        const filtered=query?CFD_INSTRUMENTS.filter(x=>`${x.symbol} ${x.name}`.includes(query)):CFD_INSTRUMENTS;
        return json(res,200,{ok:true,instruments:filtered});
      }
      if(market==='forex'){
        const queries=['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','SEK','NOK','SGD','HKD','CNH','ZAR','MXN','TRY','PLN','HUF','THB','CZK','ILS','INR','BRL','CLP','COP'];
        const responses=await Promise.all(queries.map(q=>fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q+' forex')}&quotesCount=100&newsCount=0`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}}).then(async r=>r.ok?(await r.json()).quotes||[]:[]).catch(()=>[])));
        const discovered=responses.flat().map(x=>String(x.symbol||'').toUpperCase()).filter(x=>/^[A-Z]{6}=X$/.test(x)).map(x=>({symbol:x.slice(0,6),providerSymbol:x,name:x.slice(0,3)+' / '+x.slice(3,6),type:'FOREX'}));
        const fallback=FOREX_INSTRUMENTS.map(symbol=>({symbol,providerSymbol:`${symbol}=X`,name:`${symbol.slice(0,3)} / ${symbol.slice(3)}`,type:'FOREX'}));
        return json(res,200,{ok:true,instruments:normalizeInstrumentList([...discovered,...fallback])});
      }
      if(market==='perpetual'){
        const r=await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear&status=Trading&limit=1000',{headers:{Accept:'application/json'}});
        if(!r.ok)return json(res,502,{error:'Bybit perpetual instrument provider unavailable'});
        const body=await r.json();
        if(body?.retCode!==0)return json(res,502,{error:body?.retMsg||'Bybit perpetual instrument provider unavailable'});
        const instruments=(body?.result?.list||[]).filter(x=>x.status==='Trading'&&x.quoteCoin==='USDT'&&x.contractType==='LinearPerpetual').map(x=>({symbol:x.symbol.replace(/USDT$/,'/USDT'),providerSymbol:x.symbol,name:x.baseCoin+' / USDT',type:'PERPETUAL'}));
        return json(res,200,{ok:true,instruments:instruments.length?instruments:CRYPTO_INSTRUMENTS.map(symbol=>({symbol,providerSymbol:symbol.replace('/',''),name:symbol,type:'PERPETUAL'}))});
      }
      return json(res,400,{error:'Instrument discovery is only available for Forex, Crypto, or Metal / CFD'});
    }if(!['forex','crypto','perpetual','metals'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});
  const ladder=TIMEFRAME_LADDER[timeframe]||TIMEFRAME_LADDER['1H'];
  const needed=[...new Set([timeframe,ladder.bias,ladder.structure,ladder.entry])];
  const fetched=await Promise.all(needed.map(async tf=>[tf,await candlesFor(market,symbol,tf)]));
  const candlesByTf=Object.fromEntries(fetched);
  const current=candlesByTf[timeframe],topDown=buildTopDown(candlesByTf,ladder);
  const strategy=normalizeStrategy(req.query?.strategy);
  let setup=strategyPlan(candlesByTf,ladder,strategy,topDown.bias,symbol,timeframe);
  const entryStructure=topDown.entryBias, middleStructure=topDown.middleBias;
  const structureConflict=topDown.conflict;
  // A countertrend entry-timeframe structure can be the pullback that creates a valid LIMIT.
  const entryAligned=topDown.bias!=='WAIT'&&!structureConflict;
  const isLimitSetup=setup.orderType==='LIMIT'&&setup.limitEntry!=null&&setup.takeProfit1!=null;
  const marketReady=setup.orderType==='MARKET'&&entryAligned;
  const limitReady=isLimitSetup&&entryAligned;
  const canTrade=marketReady||limitReady;
  if(!canTrade){
    const directionBias=topDown.bias;
    const reason=directionBias==='WAIT'
      ? 'No confirmed higher-timeframe market structure is present. There is no setup to trade.'
      : structureConflict
        ? 'Higher-timeframe direction is established, but the lower-timeframe structure conflicts with it. No setup is available until structure realigns.'
        : 'Directional bias is established, but the selected execution timeframe has no quality market or limit entry with a legitimate structural target.';
    setup={
      ...setup,
      bias:directionBias,
      directionBias,
      tradeReady:false,
      orderType:'NO_SETUP',
      entry:null,
      limitEntry:null,
      stopLoss:null,
      takeProfit1:null,
      takeProfit2:null,
      riskReward:'—',
      riskRewardValue:null,
      quality:'NO SETUP',
      setupStatus:'NO SETUP',
      setupReason:reason
    };
  } else {
    setup={...setup,directionBias:topDown.bias};
  }
  const confidenceBase=setup.confidence,finalConfidence=Math.min(95,Math.max(35,Math.round(confidenceBase+(topDown.structureAligned?8:0)-(structureConflict?8:0))));
  return json(res,200,{ok:true,market,symbol,timeframe,strategy,strategyInfo:STRATEGIES[strategy],setup:{...setup,confidence:finalConfidence,higherTimeframe:ladder.bias,middleTimeframe:ladder.structure,entryTimeframe:ladder.entry,higherBias:topDown.higherBias,middleBias:topDown.middleBias,entryBias:topDown.entryBias,structureConflict,entryAligned},confluence:[{timeframe:ladder.bias,bias:topDown.higherBias,role:'BIAS',confidence:topDown.higherBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-12)},{timeframe:ladder.structure,bias:topDown.middleBias,role:'STRUCTURE',confidence:topDown.middleBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-15)},{timeframe:ladder.entry,bias:topDown.entryBias,role:'ENTRY',confidence:topDown.entryBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-18)}],aligned:[topDown.higherBias,topDown.middleBias,topDown.entryBias].filter(x=>x===topDown.bias&&x!=='WAIT').length,totalTimeframes:3,source:market==='forex'||market==='metals'?'Yahoo Finance chart data':'Bybit linear perpetuals',generatedAt:new Date().toISOString()})
}catch(e){const code=e?.code||'',status=code==='AUTH_REQUIRED'||code==='AUTH_INVALID'?401:code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:e?.message||'Market analysis failed',code:code||'MARKET_ERROR'})}}