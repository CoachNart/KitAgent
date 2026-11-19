// Shared pending-order expiry rule for live publication and historical replay.
export function isCandleWithinWindow(candleTime,startTime,candleDurationMs,windowMs){
  return [candleTime,startTime,candleDurationMs,windowMs].every(Number.isFinite)&&
    candleDurationMs>0&&windowMs>0&&candleTime>=startTime&&
    candleTime+candleDurationMs<=startTime+windowMs;
}
