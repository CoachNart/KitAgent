export const cryptoPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
export const forexPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CAD', 'AUD/USD', 'USD/CHF', 'NZD/USD'];
export const pairs = [...cryptoPairs, ...forexPairs];

export const fallbackSignals = [
  { pair: 'BTC/USDT', bias: 'LONG', entry: 109420, sl: 108650, tp: 111180, score: 88, reason: 'External sell-side sweep + bullish CHOCH + displacement' },
  { pair: 'EUR/USD', bias: 'SHORT', entry: 1.1712, sl: 1.1731, tp: 1.1674, score: 84, reason: 'Buy-side liquidity raid + bearish BOS + delivery shift' },
  { pair: 'ETH/USDT', bias: 'LONG', entry: 4358, sl: 4318, tp: 4448, score: 82, reason: 'Internal liquidity reclaim + structure confirmation' },
];

export const decisionRules = [
  'External + internal liquidity mapping',
  'Market structure: BOS / CHOCH',
  'Change in state of delivery',
  'Displacement and reclaim confirmation',
  'Volatility-aware stop placement',
  'Minimum 1:2 risk/reward gate',
  'No-trade state when confluence is weak',
];
