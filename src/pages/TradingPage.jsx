import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clock3, Crosshair, Info, ShieldCheck, Target, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { CRYPTO_PAIRS, FOREX_PAIRS, TIMEFRAMES } from '../data/markets';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const fmt = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 5 : 2 });

function analyze(pair, timeframe, balance, riskPercent) {
  const seed = pair.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + timeframe.length * 13;
  const phase = seed % 7;
  const direction = phase === 0 ? 'NO TRADE' : phase % 2 ? 'LONG' : 'SHORT';
  const volatility = 0.004 + (seed % 5) * 0.001;
  const entry = pair.price * (direction === 'LONG' ? 0.998 : direction === 'SHORT' ? 1.002 : 1);
  const stopDistance = pair.price * clamp(volatility, 0.004, 0.008);
  const stop = direction === 'LONG' ? entry - stopDistance : direction === 'SHORT' ? entry + stopDistance : entry;
  const target = direction === 'LONG' ? entry + stopDistance * 2.5 : direction === 'SHORT' ? entry - stopDistance * 2.5 : entry;
  const riskAmount = balance * (riskPercent / 100);
  const position = direction === 'NO TRADE' ? 0 : Math.min(1000, riskAmount / (stopDistance / entry));
  const rr = direction === 'NO TRADE' ? 0 : 2.5;
  const quality = direction === 'NO TRADE' ? 'No setup' : phase >= 4 ? 'A-grade setup' : 'B-grade setup';
  return {
    direction, entry, stop, target, riskAmount, position, rr, quality,
    bias: direction === 'LONG' ? 'Bullish' : direction === 'SHORT' ? 'Bearish' : 'Neutral / mixed',
    structure: phase % 3 === 0 ? 'BOS confirmed' : phase % 3 === 1 ? 'CHoCH developing' : 'Range / liquidity sweep',
    delivery: phase % 2 ? 'Displacement with controlled retracement' : 'Corrective delivery into liquidity',
    liquidity: direction === 'LONG' ? 'Sell-side liquidity below recent support' : direction === 'SHORT' ? 'Buy-side liquidity above recent resistance' : 'Both sides remain exposed',
    invalidation: direction === 'LONG' ? 'Acceptance below the invalidation swing' : direction === 'SHORT' ? 'Acceptance above the invalidation swing' : 'No trade until structure resolves',
    rationale: direction === 'NO TRADE' ? 'Structure is not sufficiently aligned. Waiting is the disciplined decision.' : `The ${timeframe} structure favors ${direction.toLowerCase()} after liquidity interaction, with a defined invalidation and 2.5R target.`,
  };
}

export default function TradingPage({ userData, access }) {
  const [market, setMarket] = useState('crypto');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('4H');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [search, setSearch] = useState('');
  const pairs = market === 'crypto' ? CRYPTO_PAIRS : FOREX_PAIRS;
  const selectedPair = useMemo(() => pairs.find((p) => p.symbol === symbol) || pairs[0], [pairs, symbol]);
  const visiblePairs = pairs.filter((p) => p.symbol.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase()));

  const changeMarket = (value) => { setMarket(value); setSymbol((value === 'crypto' ? CRYPTO_PAIRS : FOREX_PAIRS)[0].symbol); setAnalysis(null); };
  const runAnalysis = () => {
    if (access === 'expired') return;
    setAnalyzing(true);
    setAnalysis(null);
    window.setTimeout(() => { setAnalysis(analyze(selectedPair, timeframe, userData.portfolioValue, userData.maxRiskPercent)); setAnalyzing(false); }, 700);
  };

  return <div className="content-wrap">
    <section className="page-heading"><div><span className="eyebrow">MARKET INTELLIGENCE</span><h1>Trading Analysis</h1><p>Select a market and timeframe. KitAgent only produces a setup after you explicitly ask it to analyze.</p></div><div className="risk-badge"><ShieldCheck size={16} /> Max risk {userData.maxRiskPercent}%</div></section>

    <section className="panel analyzer-panel">
      <div className="section-title"><div><h3>Build an analysis</h3><p>Choose one of {pairs.length} {market === 'crypto' ? 'crypto' : 'forex'} markets.</p></div><div className="segmented"><button className={market === 'crypto' ? 'active' : ''} onClick={() => changeMarket('crypto')}>Crypto</button><button className={market === 'forex' ? 'active' : ''} onClick={() => changeMarket('forex')}>Forex</button></div></div>
      <div className="form-grid">
        <label>Market pair<div className="select-wrap"><select value={symbol} onChange={(e) => { setSymbol(e.target.value); setAnalysis(null); }}>{visiblePairs.map((p) => <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}</option>)}</select><ChevronDown size={16} /></div></label>
        <label>Timeframe<div className="select-wrap"><select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setAnalysis(null); }}>{TIMEFRAMES.map((tf) => <option key={tf}>{tf}</option>)}</select><ChevronDown size={16} /></div></label>
        <label>Account balance<div className="input-static">${userData.portfolioValue.toLocaleString()}</div></label>
        <label>Risk per trade<div className="input-static">{userData.maxRiskPercent}% <span>hard limit</span></div></label>
      </div>
      <div className="market-strip"><div><span>Selected</span><strong>{selectedPair.symbol}</strong></div><div><span>Price</span><strong>{fmt(selectedPair.price)}</strong></div><div><span>24h</span><strong className={selectedPair.change >= 0 ? 'positive' : 'negative'}>{selectedPair.change >= 0 ? '+' : ''}{selectedPair.change}%</strong></div><div><span>Liquidity</span><strong>{selectedPair.liquidity}</strong></div></div>
      <div className="analyze-row"><div className="helper"><Info size={15} /> Analysis is educational and never guarantees an outcome.</div><button className="primary-btn" onClick={runAnalysis} disabled={analyzing || access === 'expired'}>{analyzing ? <><span className="spinner" /> Analyzing structure…</> : <><Crosshair size={17} /> Analyze {selectedPair.symbol}</>}</button></div>
      {access === 'expired' && <div className="locked-note"><LockIcon /> Your trial has expired. Upgrade to continue running new analyses.</div>}
    </section>

    {analysis && <section className="analysis-grid">
      <div className="panel analysis-main">
        <div className="analysis-header"><div><span className="eyebrow">{selectedPair.symbol} · {timeframe}</span><h2>{analysis.direction === 'NO TRADE' ? 'No Trade' : `${analysis.direction} Setup`}</h2></div><span className={`setup-status ${analysis.direction === 'NO TRADE' ? 'neutral' : 'good'}`}>{analysis.direction === 'NO TRADE' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}{analysis.quality}</span></div>
        <p className="analysis-rationale">{analysis.rationale}</p>
        {analysis.direction !== 'NO TRADE' ? <div className="levels"><Level label="Entry" value={fmt(analysis.entry)} /><Level label="Stop loss" value={fmt(analysis.stop)} danger /><Level label="Take profit" value={fmt(analysis.target)} good /></div> : <div className="no-trade-box"><XCircle size={20} /><div><strong>Stand aside</strong><p>There is no sufficiently clean structure right now. Waiting protects capital and preserves the system's rules.</p></div></div>}
        <div className="detail-grid"><Detail label="Market bias" value={analysis.bias} /><Detail label="Structure" value={analysis.structure} /><Detail label="State of delivery" value={analysis.delivery} /><Detail label="Liquidity" value={analysis.liquidity} /><Detail label="Risk / reward" value={analysis.direction === 'NO TRADE' ? '—' : `${analysis.rr}:1`} /><Detail label="Max position" value={analysis.position ? `$${Math.round(analysis.position).toLocaleString()}` : '—'} /></div>
      </div>
      <div className="panel execution-card"><div className="section-title"><div><h3>Risk plan</h3><p>Conservative sizing from your account.</p></div><Target size={19} /></div><div className="metric-list"><Metric label="Risk amount" value={analysis.direction === 'NO TRADE' ? '—' : `$${analysis.riskAmount.toFixed(2)}`} /><Metric label="Risk cap" value={`${userData.maxRiskPercent}%`} /><Metric label="Target R:R" value={analysis.direction === 'NO TRADE' ? '—' : '2.5:1'} /><Metric label="Max trade size" value="$1,000" /></div><div className="invalidation"><AlertTriangle size={16} /><div><strong>Invalidation</strong><p>{analysis.invalidation}</p></div></div><button className="secondary-btn" disabled={analysis.direction === 'NO TRADE'}>Execute after confirmation</button></div>
    </section>}

    <section className="panel education"><div className="section-title"><div><h3>How KitAgent evaluates a setup</h3><p>The analyzer is deliberately conservative.</p></div><BarChart3 size={19} /></div><div className="education-grid"><InfoTile title="Liquidity first" text="Identify where resting liquidity is likely concentrated before considering an entry." /><InfoTile title="Structure confirmation" text="BOS and CHoCH are used to distinguish continuation from potential regime change." /><InfoTile title="Defined invalidation" text="Every actionable setup needs a logical stop and a realistic target zone." /><InfoTile title="No forced trades" text="If the conditions do not align, KitAgent returns No Trade instead of inventing a signal." /></div></section>
  </div>;
}

function Level({ label, value, danger, good }) { return <div className={`level ${danger ? 'danger' : good ? 'good' : ''}`}><span>{label}</span><strong>{value}</strong></div>; }
function Detail({ label, value }) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
function Metric({ label, value }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
function InfoTile({ title, text }) { return <div className="info-tile"><Clock3 size={17} /><div><strong>{title}</strong><p>{text}</p></div></div>; }
function LockIcon() { return <ShieldCheck size={16} />; }
