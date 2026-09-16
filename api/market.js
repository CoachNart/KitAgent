function structuralEntryCandidates(c,bias,current,a){
  const closes=c.map(x=>x.close),e20=ema(closes,20),recent=c.slice(-20);
  const hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low)),mid=(hi+lo)/2;
  const raw=[e20,mid,bias==='LONG'?lo+a*.5:hi-a*.5,current-a,current+a];
  return [...new Set(raw.filter(Number.isFinite).map(Number))].filter(x=>bias==='LONG'?x<current:x>current);
}
function stopForEntry(c,bias,entry,a){
  const pivots=[];
  for(let i=2;i<c.length-2;i++){
    if(bias==='LONG'&&pivotLow(c,i)&&c[i].low<entry)pivots.push(c[i].low);
    if(bias==='SHORT'&&pivotHigh(c,i)&&c[i].high>entry)pivots.push(c[i].high);
  }
  const structural=bias==='LONG'?Math.min(...pivots.slice(-5)):Math.max(...pivots.slice(-5));
  const fallback=bias==='LONG'?Math.min(...c.slice(-20).map(x=>x.low)):Math.max(...c.slice(-20).map(x=>x.high));
  const invalidation=Number.isFinite(structural)?structural:fallback;
  const buffer=Math.max(a*.35,entry*.0005);
  return bias==='LONG'?invalidation-buffer:invalidation+buffer;
}
function targetPool(c,bias,entry,a){
  const out=liquidityCandidates(c,bias,entry,a).map(x=>x.level).filter(Number.isFinite);
  for(let i=2;i<c.length-2;i++){
    if(bias==='LONG'&&pivotHigh(c,i)&&c[i].high>entry)out.push(c[i].high);
    if(bias==='SHORT'&&pivotLow(c,i)&&c[i].low<entry)out.push(c[i].low);
  }
  const recent=c.slice(-40);
  if(bias==='LONG'){const hi=Math.max(...recent.map(x=>x.high));if(hi>entry)out.push(hi)}
  else {const lo=Math.min(...recent.map(x=>x.low));if(lo<entry)out.push(lo)}
  return [...new Set(out.map(Number))].filter(x=>bias==='LONG'?x>entry:x<entry).sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function evaluateTrade(c,bias,entry,a,minRR=2.5){
  const stop=stopForEntry(c,bias,entry,a);if(!Number.isFinite(stop))return null;
  const risk=Math.abs(entry-stop);
  if(!risk||risk<Math.max(a*.25,entry*.0002))return null;
  const targets=targetPool(c,bias,entry,a).map(level=>({level,rr:Math.abs(level-entry)/risk})).filter(x=>x.rr>=minRR).sort((x,y)=>x.rr-y.rr);
  if(!targets.length)return null;
  const t=targets[0],second=targets.find(x=>Math.abs(x.level-t.level)>a*.15);
  return {entry,stop,risk,target:t.level,target2:second?.level??null,rr:t.rr};
}
function classifySetup(c,bias,a){const st=marketStructure(c),s=detectLiquiditySweep(c,bias,a),d=detectDisplacement(c,bias,a);return{type:s.detected&&d.detected?'REVERSAL-CONFIRMATION':st.trend===bias?'CONTINUATION':'PULLBACK',sweep:s,displacement:d}}
function detectLiquiditySweep(c,bias,a){const p=protectedLevels(c),x=c.at(-1);if(!x)return{detected:false,type:null,level:null};if(bias==='LONG'&&Number.isFinite(p.protectedLow)&&x.low<p.protectedLow-a*.05&&x.close>p.protectedLow)return{detected:true,type:'SELL-SIDE',level:p.protectedLow};if(bias==='SHORT'&&Number.isFinite(p.protectedHigh)&&x.high>p.protectedHigh+a*.05&&x.close<p.protectedHigh)return{detected:true,type:'BUY-SIDE',level:p.protectedHigh};return{detected:false,type:null,level:null}}
function detectDisplacement(c,bias,a){const x=c.at(-1),p=c.slice(-6,-1),avg=p.reduce((s,v)=>s+v.high-v.low,0)/Math.max(1,p.length),range=x.high-x.low,body=Math.abs(x.close-x.open),dir=bias==='LONG'?x.close>x.open&&x.close>=x.low+range*.65:bias==='SHORT'?x.close<x.open&&x.close<=x.high-range*.65:false;return{detected:dir&&range>=Math.max(a*.65,avg*1.05)&&body>=Math.max(a*.4,avg*.55),body,range}}
function setupQuality(c,bias,entry,trade,e20,e50,r){
  if(!trade)return {score:0,grade:'NO SETUP',structure:marketStructure(c),setupType:'NONE',sweep:false,displacement:false};
  const st=marketStructure(c),a=atr(c)||0,event=classifySetup(c,bias,a);let score=0;
  if(st.trend===bias)score+=3;
  if((bias==='LONG'&&e20>e50)||(bias==='SHORT'&&e20<e50))score+=1;
  if((bias==='LONG'&&r>=50&&r<=68)||(bias==='SHORT'&&r>=32&&r<=50))score+=1;
  if(event.displacement.detected)score+=2;
  if(event.sweep.detected)score+=2;
  if(trade.rr>=3)score+=3;else if(trade.rr>=2.5)score+=2;else if(trade.rr>=2.3)score+=1;
  const grade=score>=9?'A':score>=7?'B':'C';
  return {score,grade,structure:st,setupType:event.type,sweep:event.sweep.detected,displacement:event.displacement.detected,sweepType:event.sweep.type||null,sweepLevel:event.sweep.level||null};
}
function analyzeCandles(c,forcedBias=null,instrumentSymbol=''){
  if(c.length<60)throw new Error('Not enough candles for a reliable setup ('+c.length+' received)');
  const closes=c.map(x=>x.close),last=c.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c);
  if(![e20,e50,a].every(Number.isFinite))throw new Error('Indicators could not be calculated from market data');
  const recent=c.slice(-30),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low)),st=marketStructure(c);
  const score=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0);
  const engineBias=st.trend!=='RANGE'?st.trend:(score>=2?'LONG':score<=-2?'SHORT':'WAIT'),bias=forcedBias||engineBias;
  let trade=null,orderType='WAIT',entry=last.close,limitEntry=null,setupReason='No clean opportunity at the current price.';
  if(bias!=='WAIT'){
    const marketTrade=evaluateTrade(c,bias,last.close,a,2.5),marketQuality=setupQuality(c,bias,last.close,marketTrade,e20,e50,r);
    if(marketTrade&&marketQuality.score>=2){trade=marketTrade;orderType='MARKET';entry=last.close;setupReason='Current price offers a valid structural entry with a real target and acceptable reward-to-risk.';}
    else {
      const candidates=structuralEntryCandidates(c,bias,last.close,a);let candidate=null,limitTrade=null,limitQuality={score:0};
      for(const x of candidates){const t=evaluateTrade(c,bias,x,a,2.5);const q=setupQuality(c,bias,x,t,e20,e50,r);if(t&&q.score>limitQuality.score){candidate=x;limitTrade=t;limitQuality=q}}
      if(limitTrade&&limitQuality.score>=2){trade=limitTrade;orderType='LIMIT';entry=candidate;limitEntry=candidate;setupReason='Current price is less attractive; a defined pullback entry offers cleaner structure and a real target.';}
      else setupReason='Directional bias exists, but price is not offering a clean market or limit entry with a legitimate target.';
    }
  }
  const confidence=Math.min(92,Math.max(42,Math.round(50+Math.abs(score)*7+(st.trend===bias?7:0)+(r>55||r<45?5:0))));
  const stop=trade?.stop??null,risk=trade?.risk??null,riskPct=entry>0&&risk!=null?(risk/entry)*100:null,target1=trade?.target??null,target2=trade?.target2??null,targetRisk=trade?.rr??null,q=setupQuality(c,bias,entry,trade,e20,e50,r);
  const tradeReady=Boolean(trade&&target1!=null&&targetRisk>=2.5&&q.score>=3),status=tradeReady?(q.grade==='A'?'A-GRADE':q.grade==='B'?'QUALITY':'ACCEPTABLE'):'WAIT',liquidity=target1?chooseLiquidityTarget(c,bias,entry,a):null;
  const stopDistance=tradeReady?Math.abs(entry-stop):null;
  const stopDistancePct=tradeReady&&entry?((stopDistance/entry)*100):null;
  const instrumentKey=String(instrumentSymbol||'');
  const priceUnitLabel=(instrumentKey.includes('/')&& !instrumentKey.includes('USDT'))?'pips':'price units';
  const pipMultiplier=(instrumentKey.includes('/')&& !instrumentKey.includes('USDT'))?(instrumentKey.includes('JPY')?100:10000):1;
  const stopDistanceUnits=tradeReady?stopDistance*pipMultiplier:null;
  return {bias,engineBias,confidence,entry:roundPrice(tradeReady?entry:null),marketEntry:roundPrice(last.close),limitEntry:roundPrice(limitEntry),orderType:tradeReady?orderType:'WAIT',stopLoss:roundPrice(tradeReady?stop:null),takeProfit1:roundPrice(tradeReady?target1:null),takeProfit2:roundPrice(tradeReady?target2:null),riskReward:tradeReady?'1:'+targetRisk.toFixed(2):'—',riskPercent:tradeReady?Number(riskPct.toFixed(2)):null,stopDistance:tradeReady?roundPrice(stopDistance):null,stopDistancePct:tradeReady?Number(stopDistancePct.toFixed(3)):null,stopDistanceUnits:tradeReady?Number(stopDistanceUnits.toFixed(2)):null,priceUnitLabel,structuralInvalidation:tradeReady?roundPrice(stop):null,tradeReady,riskRewardValue:tradeReady?Number(targetRisk.toFixed(2)):null,quality:status,qualityScore:q.score,marketStructure:q.structure?.trend||st.trend,setupStatus:tradeReady?'TRADE READY':'WAIT',setupReason,rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),swingHigh:roundPrice(hi),swingLow:roundPrice(lo),liquidityTarget:liquidity?roundPrice(liquidity.liquidityLevel):null,liquidityType:liquidity?.type||'No confirmed target',liquidityTouches:liquidity?.touches||0,liquidityDistancePct:liquidity?.distancePct||null,liquidityReason:tradeReady?(liquidity?.reason||'Target is derived from a legitimate structural/liquidity level.'):'No target is shown because no quality trade is currently available.',protectedHigh:roundPrice(q.structure?.protectedHigh),protectedLow:roundPrice(q.structure?.protectedLow),setupType:q.setupType,sweepDetected:q.sweep, sweepType:q.sweepType, sweepLevel:roundPrice(q.sweepLevel),displacementConfirmed:q.displacement,qualityGrade:q.grade,timestamp:last.time};
}
function aggregateCandles(c,bars){
  if(!Number.isInteger(bars)||bars<2)return c;
  const out=[];
  for(let i=0;i<c.length;i+=bars){
    const g=c.slice(i,i+bars);if(g.length<bars)continue;
    out.push({time:g[0].time,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g.at(-1).close,volume:g.reduce((s,x)=>s+x.volume,0)});
  }
  return out;
}
function backtestResult(c,baseMinutes,biasTf='4H',entryTf='15m'){
  const step=Math.max(1,Math.floor(30/baseMinutes)),results=[];let wins=0,losses=0,signals=0;
  for(let i=Math.max(240,60*step);i<c.length-20;i+=step){
    const slice=c.slice(0,i);
    const entry=analyzeCandles(slice,null,'BACKTEST');
    if(!entry.tradeReady||!['MARKET','LIMIT'].includes(entry.orderType))continue;
    signals++;
    const ep=entry.entry,sl=entry.stopLoss,tp=entry.takeProfit1;
    let outcome='OPEN';
    for(let j=i+1;j<c.length;j++){
      const bar=c[j],hitStop=entry.bias==='LONG'?bar.low<=sl:bar.high>=sl,hitTp=entry.bias==='LONG'?bar.high>=tp:bar.low<=tp;
      if(hitStop&&hitTp){outcome='LOSS';break}
      if(hitStop){outcome='LOSS';break}
      if(hitTp){outcome='WIN';break}
    }
    if(outcome==='WIN')wins++;else if(outcome==='LOSS')losses++;
    if(results.length<50)results.push({time:c[i].time,bias:entry.bias,entry:ep,stop:sl,target:tp,rr:entry.riskRewardValue,outcome});
  }
  const closed=wins+losses;
  return {signals,wins,losses,open:signals-closed,winRate:closed?Number((wins/closed*100).toFixed(2)):null,lossRate:closed?Number((losses/closed*100).toFixed(2)):null,sample:results,method:'Same structural entry/stop/target engine replayed forward on historical candles. This is a diagnostic backtest, not a guarantee of future performance.'};
}
function topDownDecision(htf,mtf,ltf){const higherBias=htf?.trend==='LONG'||htf?.trend==='SHORT'?htf.trend:'WAIT',middleBias=mtf?.trend==='LONG'||mtf?.trend==='SHORT'?mtf.trend:'WAIT',entryBias=ltf?.trend==='LONG'||ltf?.trend==='SHORT'?ltf.trend:'WAIT';const conflict=higherBias!=='WAIT'&&((middleBias!=='WAIT'&&middleBias!==higherBias)||(entryBias!== 'WAIT'&&entryBias!==higherBias&&entryBias!==middleBias));const bias=higherBias!=='WAIT'?higherBias:middleBias!=='WAIT'?middleBias:entryBias;const structureAligned=!conflict&&bias!=='WAIT'&&(middleBias==='WAIT'||middleBias===bias)&&(entryBias==='WAIT'||entryBias===bias);return{bias,higherBias,middleBias,entryBias,conflict,structureAligned}}
function buildTopDown(candlesByTf,ladder){
  const htf=marketStructure(candlesByTf[ladder.bias]),mtf=marketStructure(candlesByTf[ladder.structure]),ltf=marketStructure(candlesByTf[ladder.entry]);
  const d=topDownDecision(htf,mtf,ltf);
  return {bias:d.bias,higherBias:d.higherBias,middleBias:d.middleBias,entryBias:d.entryBias,conflict:d.conflict,structureAligned:d.structureAligned,higherStructure:htf,middleStructure:mtf,entryStructure:ltf};
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');if(req.query?.action==='instruments'){if(market!=='metals')return json(res,400,{error:'Instrument discovery is only available for Metals / CFD'});const query=String(req.query?.q||'').trim();if(!query)return json(res,200,{ok:true,instruments:[]});const r=await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=25&newsCount=0`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});if(!r.ok)return json(res,502,{error:'Instrument provider unavailable'});const body=await r.json();const instruments=(body?.quotes||[]).filter(x=>['FUTURE','INDEX','ETF','CURRENCY'].includes(String(x.quoteType||'').toUpperCase())).map(x=>{const raw=String(x.symbol||'').toUpperCase();const symbol=raw==='XAUUSD=X'?'XAU/USD':raw==='XAGUSD=X'?'XAG/USD':raw;return {symbol,providerSymbol:raw,name:x.longname||x.shortname||x.symbol,type:String(x.quoteType||'').toUpperCase(),exchange:x.exchange||x.fullExchangeName||''};}).filter((x,i,a)=>a.findIndex(y=>y.symbol===x.symbol)===i).slice(0,20);return json(res,200,{ok:true,instruments});}if(!['forex','crypto','perpetual','metals'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});
  if(req.query?.action==='backtest'){const bt=await candlesFor(market,symbol,timeframe);const baseMinutes=timeframe==='15m'?15:timeframe==='30m'?30:timeframe==='1H'?60:timeframe==='4H'?240:timeframe==='1D'?1440:5;return json(res,200,{ok:true,market,symbol,timeframe,backtest:backtestResult(bt,baseMinutes),generatedAt:new Date().toISOString()})}
  const ladder=TIMEFRAME_LADDER[timeframe]||TIMEFRAME_LADDER['1H'];
  const needed=[...new Set([timeframe,ladder.bias,ladder.structure,ladder.entry])];
  const fetched=await Promise.all(needed.map(async tf=>[tf,await candlesFor(market,symbol,tf)]));
  const candlesByTf=Object.fromEntries(fetched);
  const current=candlesByTf[timeframe],topDown=buildTopDown(candlesByTf,ladder);
  let setup=analyzeCandles(current,topDown.bias,symbol);
  const entryStructure=topDown.entryBias, middleStructure=topDown.middleBias;
  const structureConflict=topDown.conflict;
  const entryAligned=topDown.bias!=='WAIT'&&(entryStructure===topDown.bias||entryStructure==='WAIT');
  const isLimitSetup=setup.orderType==='LIMIT'&&setup.limitEntry!=null&&setup.takeProfit1!=null;
  const marketReady=setup.orderType==='MARKET'&&entryAligned&&!structureConflict&&(topDown.middleBias===topDown.bias||topDown.middleBias==='WAIT');
  const limitReady=isLimitSetup&&entryAligned&&!structureConflict&&(topDown.middleBias===topDown.bias||topDown.middleBias==='WAIT');
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
  return json(res,200,{ok:true,market,symbol,timeframe,setup:{...setup,confidence:finalConfidence,higherTimeframe:ladder.bias,middleTimeframe:ladder.structure,entryTimeframe:ladder.entry,higherBias:topDown.higherBias,middleBias:topDown.middleBias,entryBias:topDown.entryBias,structureConflict,entryAligned},confluence:[{timeframe:ladder.bias,bias:topDown.higherBias,role:'BIAS',confidence:topDown.higherBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-12)},{timeframe:ladder.structure,bias:topDown.middleBias,role:'STRUCTURE',confidence:topDown.middleBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-15)},{timeframe:ladder.entry,bias:topDown.entryBias,role:'ENTRY',confidence:topDown.entryBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-18)}],aligned:[topDown.higherBias,topDown.middleBias,topDown.entryBias].filter(x=>x===topDown.bias&&x!=='WAIT').length,totalTimeframes:3,source:market==='forex'||market==='metals'?'Yahoo Finance chart data':market==='perpetual'?'Binance USD-M futures with Bybit linear fallback':'Binance spot klines',generatedAt:new Date().toISOString()})
}catch(e){const code=e?.code||'',status=code==='AUTH_REQUIRED'||code==='AUTH_INVALID'?401:code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:e?.message||'Market analysis failed',code:code||'MARKET_ERROR'})}}function structuralEntryCandidates(c,bias,current,a){
  const closes=c.map(x=>x.close),e20=ema(closes,20),recent=c.slice(-30);
  const hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low)),mid=(hi+lo)/2;
  const raw=[e20,mid,bias==='LONG'?lo+a*.25:hi-a*.25,current-(bias==='LONG'?a*.35:-a*.35)];
  return [...new Set(raw.filter(Number.isFinite).map(Number))]
    .filter(x=>bias==='LONG'?x<current:x>current)
    .sort((x,y)=>Math.abs(x-current)-Math.abs(y-current));
}
function stopForEntry(c,bias,entry,a){
  const pivots=[];
  for(let i=2;i<c.length-2;i++){
    if(bias==='LONG'&&pivotLow(c,i)&&c[i].low<entry)pivots.push({price:c[i].low,index:i});
    if(bias==='SHORT'&&pivotHigh(c,i)&&c[i].high>entry)pivots.push({price:c[i].high,index:i});
  }
  const recent=pivots.slice(-6);
  const invalidation=bias==='LONG'
    ? (recent.length?Math.max(...recent.map(x=>x.price)):Math.min(...c.slice(-20).map(x=>x.low)))
    : (recent.length?Math.min(...recent.map(x=>x.price)):Math.max(...c.slice(-20).map(x=>x.high)));
  const buffer=Math.max(a*.18,entry*.00035);
  return bias==='LONG'?invalidation-buffer:invalidation+buffer;
}
function targetPool(c,bias,entry,a){
  const out=liquidityCandidates(c,bias,entry,a).map(x=>x.level).filter(Number.isFinite);
  for(let i=2;i<c.length-2;i++){
    if(bias==='LONG'&&pivotHigh(c,i)&&c[i].high>entry)out.push(c[i].high);
    if(bias==='SHORT'&&pivotLow(c,i)&&c[i].low<entry)out.push(c[i].low);
  }
  return [...new Set(out.map(Number))]
    .filter(x=>bias==='LONG'?x>entry:x<entry)
    .sort((x,y)=>bias==='LONG'?x-y:y-x);
}
function evaluateTrade(c,bias,entry,a,minRR=2.5){
  const stop=stopForEntry(c,bias,entry,a),risk=Math.abs(entry-stop);
  if(!Number.isFinite(stop)||!risk)return null;
  const targets=targetPool(c,bias,entry,a)
    .map(level=>({level,rr:Math.abs(level-entry)/risk}))
    .filter(x=>x.rr>=minRR)
    .sort((x,y)=>x.rr-y.rr);
  if(!targets.length)return null;
  const t=targets[0],second=targets.find(x=>Math.abs(x.level-t.level)>a*.15);
  return {entry,stop,risk,target:t.level,target2:second?.level??null,rr:t.rr};
}
function setupQuality(c,bias,entry,trade,e20,e50,r){
  if(!trade)return {score:0,grade:'NO SETUP',structure:marketStructure(c),setupType:'NONE',sweep:false,displacement:false};
  const st=marketStructure(c),a=atr(c)||0,event=classifySetup(c,bias,a);let score=0;
  if(st.trend===bias)score+=3;
  if((bias==='LONG'&&e20>e50)||(bias==='SHORT'&&e20<e50))score+=1;
  if((bias==='LONG'&&r>=50&&r<=68)||(bias==='SHORT'&&r>=32&&r<=50))score+=1;
  if(event.displacement.detected)score+=2;
  if(event.sweep.detected)score+=2;
  if(trade.rr>=3)score+=3;else if(trade.rr>=2.5)score+=2;else if(trade.rr>=2.3)score+=1;
  const grade=score>=9?'A':score>=7?'B':'C';
  return {score,grade,structure:st,setupType:event.type,sweep:event.sweep.detected,displacement:event.displacement.detected,sweepType:event.sweep.type||null,sweepLevel:event.sweep.level||null};
}
function analyzeCandles(c,forcedBias=null,instrumentSymbol=''){
  if(c.length<60)throw new Error('Not enough candles for a reliable setup ('+c.length+' received)');
  const closes=c.map(x=>x.close),last=c.at(-1),e20=ema(closes,20),e50=ema(closes,50),r=rsi(closes),a=atr(c);
  if(![e20,e50,a].every(Number.isFinite))throw new Error('Indicators could not be calculated from market data');
  const recent=c.slice(-30),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low)),st=marketStructure(c);
  const score=(last.close>e20?1:-1)+(e20>e50?1:-1)+(r>52?1:r<48?-1:0);
  const engineBias=st.trend!=='RANGE'?st.trend:(score>=2?'LONG':score<=-2?'SHORT':'WAIT'),bias=forcedBias||engineBias;
  let trade=null,orderType='WAIT',entry=last.close,limitEntry=null,setupReason='No clean opportunity at the current price.';
  if(bias!=='WAIT'){
    const marketTrade=evaluateTrade(c,bias,last.close,a,2.5),marketQuality=setupQuality(c,bias,last.close,marketTrade,e20,e50,r);
    if(marketTrade&&marketQuality.score>=2){trade=marketTrade;orderType='MARKET';entry=last.close;setupReason='Current price offers a valid structural entry with a real target and acceptable reward-to-risk.';}
    else {
      const candidates=structuralEntryCandidates(c,bias,last.close,a);let candidate=null,limitTrade=null,limitQuality={score:0};
      for(const x of candidates){const t=evaluateTrade(c,bias,x,a,2.5);const q=setupQuality(c,bias,x,t,e20,e50,r);if(t&&q.score>limitQuality.score){candidate=x;limitTrade=t;limitQuality=q}}
      if(limitTrade&&limitQuality.score>=2){trade=limitTrade;orderType='LIMIT';entry=candidate;limitEntry=candidate;setupReason='Current price is less attractive; a defined pullback entry offers cleaner structure and a real target.';}
      else setupReason='Directional bias exists, but price is not offering a clean market or limit entry with a legitimate target.';
    }
  }
  const confidence=Math.min(92,Math.max(42,Math.round(50+Math.abs(score)*7+(st.trend===bias?7:0)+(r>55||r<45?5:0))));
  const stop=trade?.stop??null,risk=trade?.risk??null,riskPct=entry>0&&risk!=null?(risk/entry)*100:null,target1=trade?.target??null,target2=trade?.target2??null,targetRisk=trade?.rr??null,q=setupQuality(c,bias,entry,trade,e20,e50,r);
  const tradeReady=Boolean(trade&&target1!=null&&targetRisk>=2.5&&q.score>=3),status=tradeReady?(q.grade==='A'?'A-GRADE':q.grade==='B'?'QUALITY':'ACCEPTABLE'):'WAIT',liquidity=target1?chooseLiquidityTarget(c,bias,entry,a):null;
  const stopDistance=tradeReady?Math.abs(entry-stop):null;
  const stopDistancePct=tradeReady&&entry?((stopDistance/entry)*100):null;
  const instrumentKey=String(instrumentSymbol||'');
  const priceUnitLabel=(instrumentKey.includes('/')&& !instrumentKey.includes('USDT'))?'pips':'price units';
  const pipMultiplier=(instrumentKey.includes('/')&& !instrumentKey.includes('USDT'))?(instrumentKey.includes('JPY')?100:10000):1;
  const stopDistanceUnits=tradeReady?stopDistance*pipMultiplier:null;
  return {bias,engineBias,confidence,entry:roundPrice(tradeReady?entry:null),marketEntry:roundPrice(last.close),limitEntry:roundPrice(limitEntry),orderType:tradeReady?orderType:'WAIT',stopLoss:roundPrice(tradeReady?stop:null),takeProfit1:roundPrice(tradeReady?target1:null),takeProfit2:roundPrice(tradeReady?target2:null),riskReward:tradeReady?'1:'+targetRisk.toFixed(2):'—',riskPercent:tradeReady?Number(riskPct.toFixed(2)):null,stopDistance:tradeReady?roundPrice(stopDistance):null,stopDistancePct:tradeReady?Number(stopDistancePct.toFixed(3)):null,stopDistanceUnits:tradeReady?Number(stopDistanceUnits.toFixed(2)):null,priceUnitLabel,structuralInvalidation:tradeReady?roundPrice(stop):null,tradeReady,riskRewardValue:tradeReady?Number(targetRisk.toFixed(2)):null,quality:status,qualityScore:q.score,marketStructure:q.structure?.trend||st.trend,setupStatus:tradeReady?'TRADE READY':'WAIT',setupReason,rsi:Number(r.toFixed(2)),ema20:roundPrice(e20),ema50:roundPrice(e50),atr:roundPrice(a),price:roundPrice(last.close),swingHigh:roundPrice(hi),swingLow:roundPrice(lo),liquidityTarget:liquidity?roundPrice(liquidity.liquidityLevel):null,liquidityType:liquidity?.type||'No confirmed target',liquidityTouches:liquidity?.touches||0,liquidityDistancePct:liquidity?.distancePct||null,liquidityReason:tradeReady?(liquidity?.reason||'Target is derived from a legitimate structural/liquidity level.'):'No target is shown because no quality trade is currently available.',protectedHigh:roundPrice(q.structure?.protectedHigh),protectedLow:roundPrice(q.structure?.protectedLow),setupType:q.setupType,sweepDetected:q.sweep, sweepType:q.sweepType, sweepLevel:roundPrice(q.sweepLevel),displacementConfirmed:q.displacement,qualityGrade:q.grade,timestamp:last.time};
}
function aggregateCandles(c,bars){
  if(!Number.isInteger(bars)||bars<2)return c;
  const out=[];
  for(let i=0;i<c.length;i+=bars){
    const g=c.slice(i,i+bars);if(g.length<bars)continue;
    out.push({time:g[0].time,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g.at(-1).close,volume:g.reduce((s,x)=>s+x.volume,0)});
  }
  return out;
}
function backtestResult(c,baseMinutes,biasTf='4H',entryTf='15m'){
  const step=Math.max(1,Math.floor(30/baseMinutes)),results=[];let wins=0,losses=0,signals=0;
  for(let i=Math.max(240,60*step);i<c.length-20;i+=step){
    const slice=c.slice(0,i);
    const entry=analyzeCandles(slice,null,'BACKTEST');
    if(!entry.tradeReady||!['MARKET','LIMIT'].includes(entry.orderType))continue;
    signals++;
    const ep=entry.entry,sl=entry.stopLoss,tp=entry.takeProfit1;
    let outcome='OPEN';
    for(let j=i+1;j<c.length;j++){
      const bar=c[j],hitStop=entry.bias==='LONG'?bar.low<=sl:bar.high>=sl,hitTp=entry.bias==='LONG'?bar.high>=tp:bar.low<=tp;
      if(hitStop&&hitTp){outcome='LOSS';break}
      if(hitStop){outcome='LOSS';break}
      if(hitTp){outcome='WIN';break}
    }
    if(outcome==='WIN')wins++;else if(outcome==='LOSS')losses++;
    if(results.length<50)results.push({time:c[i].time,bias:entry.bias,entry:ep,stop:sl,target:tp,rr:entry.riskRewardValue,outcome});
  }
  const closed=wins+losses;
  return {signals,wins,losses,open:signals-closed,winRate:closed?Number((wins/closed*100).toFixed(2)):null,lossRate:closed?Number((losses/closed*100).toFixed(2)):null,sample:results,method:'Same structural entry/stop/target engine replayed forward on historical candles. This is a diagnostic backtest, not a guarantee of future performance.'};
}
function topDownDecision(htf,mtf,ltf){const higherBias=htf?.trend==='LONG'||htf?.trend==='SHORT'?htf.trend:'WAIT',middleBias=mtf?.trend==='LONG'||mtf?.trend==='SHORT'?mtf.trend:'WAIT',entryBias=ltf?.trend==='LONG'||ltf?.trend==='SHORT'?ltf.trend:'WAIT';const conflict=higherBias!=='WAIT'&&((middleBias!=='WAIT'&&middleBias!==higherBias)||(entryBias!== 'WAIT'&&entryBias!==higherBias&&entryBias!==middleBias));const bias=higherBias!=='WAIT'?higherBias:middleBias!=='WAIT'?middleBias:entryBias;const structureAligned=!conflict&&bias!=='WAIT'&&(middleBias==='WAIT'||middleBias===bias)&&(entryBias==='WAIT'||entryBias===bias);return{bias,higherBias,middleBias,entryBias,conflict,structureAligned}}
function buildTopDown(candlesByTf,ladder){
  const htf=marketStructure(candlesByTf[ladder.bias]),mtf=marketStructure(candlesByTf[ladder.structure]),ltf=marketStructure(candlesByTf[ladder.entry]);
  const d=topDownDecision(htf,mtf,ltf);
  return {bias:d.bias,higherBias:d.higherBias,middleBias:d.middleBias,entryBias:d.entryBias,conflict:d.conflict,structureAligned:d.structureAligned,higherStructure:htf,middleStructure:mtf,entryStructure:ltf};
}
export default async function handler(req,res){if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});try{const decoded=await authenticate(req);await requireActiveAccess(decoded.uid);const market=String(req.query?.market||'forex').toLowerCase(),symbol=String(req.query?.symbol||'').trim().toUpperCase(),timeframe=String(req.query?.timeframe||'1H');if(req.query?.action==='instruments'){if(market!=='metals')return json(res,400,{error:'Instrument discovery is only available for Metals / CFD'});const query=String(req.query?.q||'').trim();if(!query)return json(res,200,{ok:true,instruments:[]});const r=await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=25&newsCount=0`,{headers:{'User-Agent':'KitAgent/1.0','Accept':'application/json'}});if(!r.ok)return json(res,502,{error:'Instrument provider unavailable'});const body=await r.json();const instruments=(body?.quotes||[]).filter(x=>['FUTURE','INDEX','ETF','CURRENCY'].includes(String(x.quoteType||'').toUpperCase())).map(x=>{const raw=String(x.symbol||'').toUpperCase();const symbol=raw==='XAUUSD=X'?'XAU/USD':raw==='XAGUSD=X'?'XAG/USD':raw;return {symbol,providerSymbol:raw,name:x.longname||x.shortname||x.symbol,type:String(x.quoteType||'').toUpperCase(),exchange:x.exchange||x.fullExchangeName||''};}).filter((x,i,a)=>a.findIndex(y=>y.symbol===x.symbol)===i).slice(0,20);return json(res,200,{ok:true,instruments});}if(!['forex','crypto','perpetual','metals'].includes(market))return json(res,400,{error:'Unsupported market'});if(!symbol)return json(res,400,{error:'Missing symbol'});if(!allowedIntervals.has(timeframe))return json(res,400,{error:'Unsupported timeframe'});
  if(req.query?.action==='backtest'){const bt=await candlesFor(market,symbol,timeframe);const baseMinutes=timeframe==='15m'?15:timeframe==='30m'?30:timeframe==='1H'?60:timeframe==='4H'?240:timeframe==='1D'?1440:5;return json(res,200,{ok:true,market,symbol,timeframe,backtest:backtestResult(bt,baseMinutes),generatedAt:new Date().toISOString()})}
  const ladder=TIMEFRAME_LADDER[timeframe]||TIMEFRAME_LADDER['1H'];
  const needed=[...new Set([timeframe,ladder.bias,ladder.structure,ladder.entry])];
  const fetched=await Promise.all(needed.map(async tf=>[tf,await candlesFor(market,symbol,tf)]));
  const candlesByTf=Object.fromEntries(fetched);
  const current=candlesByTf[timeframe],topDown=buildTopDown(candlesByTf,ladder);
  let setup=analyzeCandles(current,topDown.bias,symbol);
  const entryStructure=topDown.entryBias, middleStructure=topDown.middleBias;
  const structureConflict=topDown.conflict;
  const entryAligned=topDown.bias!=='WAIT'&&(entryStructure===topDown.bias||entryStructure==='WAIT');
  const isLimitSetup=setup.orderType==='LIMIT'&&setup.limitEntry!=null&&setup.takeProfit1!=null;
  const marketReady=setup.orderType==='MARKET'&&entryAligned&&!structureConflict&&(topDown.middleBias===topDown.bias||topDown.middleBias==='WAIT');
  const limitReady=isLimitSetup&&entryAligned&&!structureConflict&&(topDown.middleBias===topDown.bias||topDown.middleBias==='WAIT');
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
  return json(res,200,{ok:true,market,symbol,timeframe,setup:{...setup,confidence:finalConfidence,higherTimeframe:ladder.bias,middleTimeframe:ladder.structure,entryTimeframe:ladder.entry,higherBias:topDown.higherBias,middleBias:topDown.middleBias,entryBias:topDown.entryBias,structureConflict,entryAligned},confluence:[{timeframe:ladder.bias,bias:topDown.higherBias,role:'BIAS',confidence:topDown.higherBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-12)},{timeframe:ladder.structure,bias:topDown.middleBias,role:'STRUCTURE',confidence:topDown.middleBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-15)},{timeframe:ladder.entry,bias:topDown.entryBias,role:'ENTRY',confidence:topDown.entryBias===topDown.bias?finalConfidence:Math.max(35,finalConfidence-18)}],aligned:[topDown.higherBias,topDown.middleBias,topDown.entryBias].filter(x=>x===topDown.bias&&x!=='WAIT').length,totalTimeframes:3,source:market==='forex'||market==='metals'?'Yahoo Finance chart data':market==='perpetual'?'Binance USD-M futures with Bybit linear fallback':'Binance spot klines',generatedAt:new Date().toISOString()})
}catch(e){const code=e?.code||'',status=code==='AUTH_REQUIRED'||code==='AUTH_INVALID'?401:code==='ACCESS_EXPIRED'?403:500;return json(res,status,{ok:false,error:e?.message||'Market analysis failed',code:code||'MARKET_ERROR'})}}