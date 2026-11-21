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
