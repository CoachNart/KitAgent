import assert from 'node:assert/strict';
import { validateStrategyThesis, applyStructuralRisk } from './strategy-thesis-validator.js';

function candle(close, high = close * 1.002, low = close * 0.998) {
  return { open: close, high, low, close };
}

// A deliberately weak micro-wick should not become a protected structural swing.
const weak = Array.from({ length: 40 }, (_, i) => candle(100 + Math.sin(i / 4) * 0.05));
const weakResult = validateStrategyThesis({ strategy: 'MSNR', direction: 'LONG', candles: weak, candidate: { tested: false } });
assert.equal(weakResult.ok, false);

// The risk helper must never tighten a structural stop to manufacture RR.
const structural = {
  ok: true,
  atr: 1,
  structural: { protected: { low: 98, high: 98.2 }, target: { low: 105, high: 105.2 } },
  evidence: { protectedEdge: 98, protectedTouches: 2, protectedDisplacementATR: 1.4 },
};
const risk = applyStructuralRisk({ direction: 'LONG', entry: 100, validation: structural, minRR: 2 });
assert.equal(risk.ok, true);
assert.ok(risk.stop < 98, 'long stop must remain outside the structural swing edge');
assert.ok(risk.target >= 105, 'target must remain at the natural opposing structural edge');

console.log('strategy thesis validator regression checks passed');
