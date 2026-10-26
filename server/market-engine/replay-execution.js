export function executionEntry(trade,orderType){
  const planned=Number(trade?.entry);
  const market=Number(trade?.marketEntry);
  return String(orderType).toUpperCase()==='MARKET'&&Number.isFinite(market)&&market>0
    ?market
    :planned;
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
