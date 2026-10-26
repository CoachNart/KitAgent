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
