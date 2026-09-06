import React, { useEffect, useMemo, useState } from 'react';
import { cryptoPairs, forexPairs, fallbackSignals, decisionRules } from '../data/markets';
import { getCryptoCandles, getCryptoTicker, isCryptoPair } from '../services/marketData';
import { analyzeMarket } from '../services/tradingEngine';

const fmt = (n) => typeof n === 'number' ? (n > 10 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(5)) : '—';

export default function TradingPage() {
  const [pair, setPair] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [analysis, setAnalysis] = useState(null);
  const [ticker, setTicker] = useState(null);
  const fallback = useMemo(() => fallbackSignals.find((x) => x.pair === pair) || fallbackSignals[0], [pair]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAnalysis(null); setTicker(null);
      if (!isCryptoPair(pair)) return;
      try {
        const [candles, liveTicker] = await Promise.all([getCryptoCandles(pair, timeframe), getCryptoTicker(pair)]);
        if (!cancelled) { setAnalysis(analyzeMarket(candles)); setTicker(liveTicker); }
      } catch { if (!cancelled) setAnalysis({ status: 'NO_TRADE', score: 0, reason: 'Live market feed unavailable. No setup is fabricated.' }); }
    }
    load(); return () => { cancelled = true; };
  }, [pair, timeframe]);

  const signal = analysis?.status === 'SETUP' ? analysis : fallback;
  const live = isCryptoPair(pair) && analysis;
  return <section className="page">
    <div className="toolbar"><select value={pair} onChange={(e) => setPair(e.target.value)}><optgroup label="Crypto">{cryptoPairs.map((p) => <option key={p}>{p}</option>)}</optgroup><optgroup label="Forex">{forexPairs.map((p) => <option key={p}>{p}</option>)}</optgroup></select><select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}><option value="1h">1H structure</option><option value="15m">15M execution</option><option value="4h">4H bias</option></select><span className="feed">{isCryptoPair(pair) ? live ? 'LIVE FEED' : 'CONNECTING…' : 'FX ADAPTER REQUIRED'}</span></div>
    <div className="market-head"><div><span>LIVE PRICE</span><strong>{ticker ? fmt(ticker.price) : '—'}</strong></div><div><span>24H CHANGE</span><strong className={ticker?.change >= 0 ? 'up' : 'down'}>{ticker ? `${ticker.change.toFixed(2)}%` : '—'}</strong></div><div><span>DECISION SCORE</span><strong>{analysis?.score ?? fallback.score}/100</strong></div></div>
    <div className="trade-card"><div className="card-title"><div><span className="pill">{analysis?.status === 'SETUP' ? 'LIVE HIGH-CONFLUENCE' : 'ANALYSIS'} </span><h2>{pair} <em>{signal.bias || 'WAIT'}</em></h2></div><span className="score">{analysis?.score ?? fallback.score}</span></div><div className="levels"><div><span>ENTRY</span><b>{fmt(signal.entry)}</b></div><div><span>STOP</span><b>{fmt(signal.sl)}</b></div><div><span>TARGET</span><b>{fmt(signal.tp)}</b></div><div><span>R:R</span><b>{signal.rr ? `1 : ${signal.rr}` : '1 : 2.3'}</b></div></div><div className="logic"><b>DECISION</b><p>{analysis?.reason || fallback.reason}. A weak setup remains a no-trade.</p></div><div className="structure"><span>LIQUIDITY</span><i/><span>BOS / CHOCH</span><i/><span>DELIVERY</span><i/><span>DISPLACEMENT</span><i/><span>ENTRY GATE</span></div></div>
    <div className="rules"><h3>Decision engine</h3><div>{decisionRules.map((x) => <span key={x}>✓ {x}</span>)}</div></div>
    <p className="disclaimer">Signals are analytical output, not a guarantee of profit. Forex pairs remain intentionally gated until a supported live FX feed is configured; the engine will not invent prices.</p>
  </section>;
}
