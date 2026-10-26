export function executionEntry(trade,orderType){
  const planned=Number(trade?.entry);
  const market=Number(trade?.marketEntry);
  if(String(orderType).toUpperCase()==='MARKET')return Number.isFinite(market)&&market>0?market:Number.NaN;
  return planned;
}

export function validTradeGeometry(entry,stop,target,direction){
  if(![entry,stop,target].every(Number.isFinite))return false;
  return direction==='BULLISH'
    ?stop<entry&&target>entry
    :direction==='BEARISH'?target<entry&&stop>entry:false;
}

export function rMultiple(trade,direction,exit,orderType){
  const entry=executionEntry(trade,orderType);
  const risk=Math.abs(entry-Number(trade.stop));
  if(!(risk>0))return 0;
  return (direction==='BULLISH'?exit-entry:entry-exit)/risk;
}

export function executionTrade(trade,orderType,nextCandle){
  if(String(orderType).toUpperCase()!=='MARKET')return trade;
  const nextOpen=Number(nextCandle?.open);
  return {...trade,marketEntry:Number.isFinite(nextOpen)&&nextOpen>0?nextOpen:Number.NaN};
}

export function replayExitOnCandle(direction,stop,target,candle){
  const open=Number(candle?.open),high=Number(candle?.high),low=Number(candle?.low);
  if(![open,high,low,stop,target].every(Number.isFinite))return {result:'unresolved'};
  const stopGap=direction==='BULLISH'?open<=stop:direction==='BEARISH'?open>=stop:false;
  const targetGap=direction==='BULLISH'?open>=target:direction==='BEARISH'?open<=target:false;
  if(stopGap)return {result:'loss',exit:open,reason:'Stop gapped; filled at candle open'};
  if(targetGap)return {result:'win',exit:target,reason:'Target gapped; filled at target'};
  const stopHit=direction==='BULLISH'?low<=stop:direction==='BEARISH'?high>=stop:false;
  const targetHit=direction==='BULLISH'?high>=target:direction==='BEARISH'?low<=target:false;
  if(stopHit&&targetHit)return {result:'ambiguous'};
  if(stopHit)return {result:'loss',exit:stop};
  if(targetHit)return {result:'win',exit:target};
  return null;
}
