// Shared strategy thesis metadata. Kept separate so strategy-specific rules remain
// explicit and auditable instead of being hidden in generic RR/ATR logic.
export const STRATEGY_THESIS_RULES = Object.freeze({
  'SMC': { context: 'HTF', requires: ['liquidity', 'displacement', 'structure', 'poi'] },
  'MSNR': { context: 'HTF', requires: ['tested_level', 'reaction', 'structure'] },
  'CRT': { context: 'HTF', requires: ['range', 'sweep', 'reclaim'] },
  'Top-Down': { context: 'HTF', requires: ['htf_structure', 'execution_alignment'] },
  'Breakout': { context: 'HTF', requires: ['range', 'break', 'displacement', 'retest'] },
  'Pullback': { context: 'HTF', requires: ['impulse', 'retracement', 'protected_swing'] },
  'Price Action': { context: 'HTF', requires: ['structure', 'reaction'] },
  'Liquidity Reversal': { context: 'HTF', requires: ['liquidity_sweep', 'reclaim', 'opposing_liquidity'] },
});

export function thesisRuleFor(strategy) {
  return STRATEGY_THESIS_RULES[strategy] || { context: 'HTF', requires: ['structure'] };
}
