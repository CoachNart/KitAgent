const BINANCE = 'https://api.binance.com/api/v3';
const symbolMap = { 'BTC/USDT': 'BTCUSDT', 'ETH/USDT': 'ETHUSDT', 'SOL/USDT': 'SOLUSDT', 'BNB/USDT': 'BNBUSDT', 'XRP/USDT': 'XRPUSDT' };

export async function getCryptoCandles(pair, interval = '1h', limit = 200) {
  const symbol = symbolMap[pair];
  if (!symbol) throw new Error('No live crypto adapter is configured for this pair.');
  const response = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!response.ok) throw new Error(`Market feed returned ${response.status}.`);
  const rows = await response.json();
  return rows.map((r) => ({ time: r[0], open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }));
}

export async function getCryptoTicker(pair) {
  const symbol = symbolMap[pair];
  if (!symbol) return null;
  const response = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`);
  if (!response.ok) throw new Error(`Ticker feed returned ${response.status}.`);
  const data = await response.json();
  return { price: Number(data.lastPrice), change: Number(data.priceChangePercent), high: Number(data.highPrice), low: Number(data.lowPrice) };
}

export function isCryptoPair(pair) { return Boolean(symbolMap[pair]); }
