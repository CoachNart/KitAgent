const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const ranges = candles.slice(-period).map((c, i, arr) => {
    const previous = candles[candles.indexOf(c) - 1] || c;
    return Math.max(c.high - c.low, Math.abs(c.high - previous.close), Math.abs(c.low - previous.close));
  });
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

function structure(candles) {
  if (!candles || candles.length < 20) return { trend: 'UNKNOWN', bos: false, choch: false, displacement: false };
  const recent = candles.slice(-10);
  const prior = candles.slice(-20, -10);
  const recentHigh = Math.max(...recent.map((c) => c.high));
  const recentLow = Math.min(...recent.map((c) => c.low));
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));
  const last = recent[recent.length - 1];
  const body = Math.abs(last.close - last.open);
  const avgBody = recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recent.length;
  return {
    trend: last.close > priorHigh ? 'BULLISH' : last.close < priorLow ? 'BEARISH' : 'RANGE',
    bos: last.close > priorHigh || last.close < priorLow,
    choch: (recentHigh > priorHigh && last.close < priorLow) || (recentLow < priorLow && last.close > priorHigh),
    displacement: body > avgBody * 1.5,
  };
}

export function analyzeMarket(candles) {
  const clean = (candles || []).filter((c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (clean.length < 30) return { status: 'NO_TRADE', score: 0, reason: 'Not enough confirmed market data to issue a setup.' };
  const last = clean[clean.length - 1];
  const a = atr(clean);
  const s = structure(clean);
  if (!a) return { status: 'NO_TRADE', score: 0, reason: 'Volatility model is unavailable.' };

  const bullish = s.trend === 'BULLISH' || (s.choch && last.close > last.open);
  const bearish = s.trend === 'BEARISH' || (s.choch && last.close < last.open);
  const score = clamp(40 + (s.bos ? 18 : 0) + (s.choch ? 12 : 0) + (s.displacement ? 12 : 0) + (bullish || bearish ? 10 : 0), 0, 100);
  if (score < 70 || (!bullish && !bearish)) return { status: 'NO_TRADE', score, reason: 'Liquidity and structure are not sufficiently aligned.' };

  const bias = bullish ? 'LONG' : 'SHORT';
  const entry = last.close;
  const stopDistance = Math.max(a * 0.85, Math.abs(last.high - last.low) * 1.1);
  const sl = bias === 'LONG' ? entry - stopDistance : entry + stopDistance;
  const tp = bias === 'LONG' ? entry + stopDistance * 2.2 : entry - stopDistance * 2.2;
  return {
    status: 'SETUP', bias, score,
    entry, sl, tp,
    rr: 2.2,
    reason: `${s.trend} structure with ${s.bos ? 'BOS' : 'structure hold'}, ${s.choch ? 'CHOCH' : 'no CHOCH'}, and ${s.displacement ? 'displacement' : 'controlled delivery'}.`,
  };
}
