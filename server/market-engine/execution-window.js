// Shared pending-order expiry rule for live publication and historical replay.
export function isCandleWithinWindow(candleTime,startTime,candleDurationMs,windowMs){
  return [candleTime,startTime,candleDurationMs,windowMs].every(Number.isFinite)&&
    candleDurationMs>0&&windowMs>0&&candleTime>=startTime&&
    candleTime+candleDurationMs<=startTime+windowMs;
}

// A pending order gets its full entry window from publication, not from the
// earlier sweep that helped form the setup.
export function pendingEntryDeadline(publishedAt,windowMs){
  const start=Number(publishedAt),duration=Number(windowMs);
  return Number.isFinite(start)&&Number.isFinite(duration)&&duration>0?start+duration:null;
}

 
// A time-based expiry is safe only when the returned candle history spans the
// entire pending window without missing 30m bars.
export function isCompleteCandleWindow(candles,startTime,endTime,candleDurationMs){
  if(!Array.isArray(candles)||!candles.length||
    ![startTime,endTime,candleDurationMs].every(Number.isFinite)||
    candleDurationMs<=0||endTime<=startTime)return false;
  return candles[0].time>=startTime&&
    candles[0].time<=startTime+candleDurationMs&&
    candles.at(-1).time+candleDurationMs>=endTime&&
    candles.every((c,i)=>Number.isFinite(c.time)&&
      (i===0||c.time-candles[i-1].time===candleDurationMs));
}

 
// Return the closed candle that straddles the deadline separately. Its OHLC
// cannot prove whether an entry touch happened before or after expiry.
export function pendingWindowCoverage(candles,startTime,endTime,candleDurationMs){
  if(!Array.isArray(candles)||!candles.length)return{complete:false,boundaryCandle:null};
  const boundaryIndex=candles.findIndex(c=>Number.isFinite(c?.time)&&
    c.time<endTime&&c.time+candleDurationMs>endTime);
  const coverage=boundaryIndex>=0
    ?candles.slice(0,boundaryIndex+1)
    :candles.filter(c=>Number.isFinite(c?.time)&&c.time<endTime);
  return{
    complete:isCompleteCandleWindow(coverage,startTime,endTime,candleDurationMs),
    boundaryCandle:boundaryIndex>=0?candles[boundaryIndex]:null
  };
}
