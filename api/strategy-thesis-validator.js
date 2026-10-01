// Strategy thesis validator.
// This module is intentionally conservative about structure, but does not suppress
// valid opportunities merely to improve displayed RR. It validates the reason for
// the trade first, then lets the existing trade builder handle execution.

const finite = (v) => Number.isFinite(Number(v));
const n = (v, d = 0) => finite(v) ? Number(v) : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function atrOf(candles) {
  const xs = Array.isArray(candles) ? candles : [];
  if (xs.length < 5) return 0;
  const trs = [];
  for (let i = 1; i < xs.length; i++) {
    const h = n(xs[i]?.high), l = n(xs[i]?.low), pc = n(xs[i - 1]?.close);
    if (h <= l || !pc) continue;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const tail = trs.slice(-Math.min(30, trs.length));
  return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : 0;
}

function pivots(candles, left = 3, right = 3) {
  const xs = Array.isArray(candles) ? candles : [];
  const out = { highs: [], lows: [] };
  for (let i = left; i < xs.length - right; i++) {
    const h = n(xs[i]?.high), l = n(xs[i]?.low);
    if (!h || !l) continue;
    let hi = true, lo = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (n(xs[j]?.high) >= h) hi = false;
      if (n(xs[j]?.low) <= l) lo = false;
    }
    if (hi) out.highs.push({ index: i, price: h });
    if (lo) out.lows.push({ index: i, price: l });
  }
  return out;
}

function cluster(points, tolerance) {
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const groups = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (!g || Math.abs(p.price - g.mean) > tolerance) groups.push({ points: [p], mean: p.price });
    else { g.points.push(p); g.mean = g.points.reduce((s, x) => s + x.price, 0) / g.points.length; }
  }
  return groups.map(g => ({
    mean: g.mean,
    low: Math.min(...g.points.map(x => x.price)),
    high: Math.max(...g.points.map(x => x.price)),
    touches: g.points.length,
    lastIndex: Math.max(...g.points.map(x => x.index)),
    firstIndex: Math.min(...g.points.map(x => x.index)),
  }));
}

function structuralEdges(candles, direction, opts = {}) {
  const xs = Array.isArray(candles) ? candles : [];
  if (xs.length < 15) return { protected: null, target: null, evidence: null };
  const atr = n(opts.atr) || atrOf(xs);
  if (!atr) return { protected: null, target: null, evidence: null };
  const ps = pivots(xs, opts.left || 3, opts.right || 3);
  const tolerance = atr * 0.18;
  const lows = cluster(ps.lows, tolerance);
  const highs = cluster(ps.highs, tolerance);
  const last = n(xs.at(-1)?.close);
  const minExcursion = atr * 0.75;
  const ageFloor = 3;

  const score = (g, side) => {
    const excursion = side === 'low'
      ? Math.max(0, ...xs.slice(g.lastIndex + 1).map(c => n(c.high) - g.low))
      : Math.max(0, ...xs.slice(g.lastIndex + 1).map(c => g.high - n(c.low)));
    const age = xs.length - 1 - g.lastIndex;
    const displacement = excursion / atr;
    const meaningful = displacement >= 1.0 || g.touches >= 2 || (displacement >= 0.75 && age >= ageFloor);
    if (!meaningful) return null;
    return { ...g, displacement, age, score: displacement * 3 + g.touches * 2 + Math.min(age, 40) / 20 };
  };

  const support = lows.map(g => score(g, 'low')).filter(Boolean).filter(g => g.low < last || g.high < last);
  const resistance = highs.map(g => score(g, 'high')).filter(Boolean).filter(g => g.high > last || g.low > last);

  let protectedEdge = null;
  let targetEdge = null;
  if (direction === 'LONG') {
    // For invalidation, prefer the most recent meaningful support that is not
    // merely a micro-wick; for target, use the nearest meaningful resistance.
    const below = support.filter(g => g.high <= last).sort((a, b) => b.lastIndex - a.lastIndex || b.score - a.score);
    const above = resistance.filter(g => g.low >= last).sort((a, b) => a.low - b.low || b.score - a.score);
    protectedEdge = below[0] || null;
    targetEdge = above[0] || null;
  } else {
    const above = resistance.filter(g => g.low >= last).sort((a, b) => b.lastIndex - a.lastIndex || b.score - a.score);
    const below = support.filter(g => g.high <= last).sort((a, b) => a.high - b.high || b.score - a.score);
    protectedEdge = above[0] || null;
    targetEdge = below[0] || null;
  }

  return {
    protected: protectedEdge,
    target: targetEdge,
    evidence: protectedEdge ? {
      protectedEdge: direction === 'LONG' ? protectedEdge.low : protectedEdge.high,
      protectedTouches: protectedEdge.touches,
      protectedDisplacementATR: Number(protectedEdge.displacement.toFixed(2)),
      protectedAge: protectedEdge.age,
      targetEdge: targetEdge ? (direction === 'LONG' ? targetEdge.low : targetEdge.high) : null,
      targetTouches: targetEdge?.touches || 0,
    } : null,
  };
}

function strategyRequirements(strategy) {
  const s = String(strategy || '').toLowerCase();
  if (s.includes('smc')) return { minEvidence: 3, requireDisplacement: true, requireLiquidity: true, requireStructure: true };
  if (s.includes('msnr')) return { minEvidence: 2, requireTest: true, requireStructure: true };
  if (s.includes('crt')) return { minEvidence: 2, requireRange: true, requireReclaim: true };
  if (s.includes('top')) return { minEvidence: 3, requireStructure: true, requireHTF: true };
  if (s.includes('breakout')) return { minEvidence: 2, requireDisplacement: true, requireStructure: true };
  if (s.includes('pullback')) return { minEvidence: 2, requireDisplacement: true, requireStructure: true };
  if (s.includes('liquidity')) return { minEvidence: 2, requireLiquidity: true, requireReclaim: true };
  return { minEvidence: 1 };
}

/**
 * Validate a candidate without manufacturing a trade.
 * Returns { ok, structural, reason, score }.
 */
export function validateStrategyThesis({ strategy, direction, candles, candidate = {}, context = {} }) {
  const req = strategyRequirements(strategy);
  const xs = Array.isArray(candles) ? candles : [];
  if (xs.length < 20) return { ok: false, reason: 'INSUFFICIENT_EXECUTION_HISTORY' };
  const atr = atrOf(xs);
  if (!atr) return { ok: false, reason: 'NO_VALID_ATR' };

  const structural = structuralEdges(xs, direction, { atr });
  if (!structural.protected) return { ok: false, reason: 'NO_VALID_PROTECTED_SWING' };

  const evidence = structural.evidence || {};
  const displacement = n(evidence.protectedDisplacementATR);
  const touches = n(evidence.protectedTouches);
  let score = 0;
  score += displacement >= 1 ? 2 : 1;
  if (touches >= 2) score += 1;
  if (candidate.liquidityConfirmed || candidate.liquiditySweep || candidate.sweep) score += 1;
  if (candidate.displacementConfirmed || candidate.displacement || candidate.bos || candidate.choch) score += 1;
  if (candidate.reclaim || candidate.reaction || candidate.confirmed) score += 1;
  if (context.htfAligned || context.biasAligned) score += 1;

  if (req.requireDisplacement && !(candidate.displacementConfirmed || candidate.displacement || candidate.bos || displacement >= 1.0)) {
    return { ok: false, reason: 'NO_MEANINGFUL_DISPLACEMENT', structural, evidence };
  }
  if (req.requireLiquidity && !(candidate.liquidityConfirmed || candidate.liquiditySweep || candidate.sweep)) {
    return { ok: false, reason: 'NO_LIQUIDITY_EVENT', structural, evidence };
  }
  if (req.requireTest && !(candidate.tested || candidate.retested || touches >= 2)) {
    return { ok: false, reason: 'LEVEL_NOT_SUFFICIENTLY_TESTED', structural, evidence };
  }
  if (req.requireReclaim && !(candidate.reclaim || candidate.reaction || candidate.confirmed)) {
    return { ok: false, reason: 'NO_RECLAIM_OR_REACTION', structural, evidence };
  }
  if (req.requireHTF && !(context.htfAligned || context.biasAligned)) {
    return { ok: false, reason: 'NO_HTF_ALIGNMENT', structural, evidence };
  }
  if (score < req.minEvidence) return { ok: false, reason: 'INSUFFICIENT_THESIS_EVIDENCE', structural, evidence, score };

  return { ok: true, structural, evidence, score: clamp(score, 0, 8), atr };
}

export function applyStructuralRisk({ direction, entry, candidate = {}, validation, minRR = 2 }) {
  if (!validation?.ok || !validation.structural?.protected) return { ok: false, reason: 'INVALID_THESIS' };
  const e = n(entry);
  const atr = n(validation.atr);
  const edge = direction === 'LONG' ? n(validation.structural.protected.low) : n(validation.structural.protected.high);
  if (!e || !edge || !atr) return { ok: false, reason: 'INVALID_STRUCTURE' };

  // Keep the invalidation outside the real edge. Never tighten it to manufacture RR.
  const buffer = atr * 0.12;
  const stop = direction === 'LONG' ? edge - buffer : edge + buffer;
  const risk = Math.abs(e - stop);
  if (!risk || risk < atr * 0.45) return { ok: false, reason: 'STRUCTURAL_RISK_TOO_TIGHT' };

  const target = direction === 'LONG'
    ? n(validation.structural.target?.low)
    : n(validation.structural.target?.high);
  if (!target) return { ok: false, reason: 'NO_NATURAL_TARGET' };
  const reward = Math.abs(target - e);
  const rr = reward / risk;
  if (rr < minRR) return { ok: false, reason: 'NATURAL_TARGET_BELOW_MIN_RR', rr };

  return {
    ok: true,
    entry: e,
    stop,
    target,
    rr,
    structural: validation.evidence,
  };
}

export default { validateStrategyThesis, applyStructuralRisk };
