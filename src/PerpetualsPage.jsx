import { useCallback, useEffect, useMemo, useState } from 'react';
import './mexcFutures.css';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const fmt = (v, digits = 8) => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
const pct = v => `${(n(v) * 100).toFixed(4)}%`;
const normalize = s => String(s || '').toUpperCase().replace(/[-/]/g, '').replace(/_USDT$/, 'USDT').replace(/USDT$/, '_USDT');
const displaySymbol = s => String(s || '').replace('_USDT', '/USDT');
const arr = v => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []);
const positionPnl = (entry, target, volume, contractSize, positionType) => (n(target) - n(entry)) * n(volume) * n(contractSize || 1) * (n(positionType) === 1 ? 1 : -1);

async function api(action, state, extra = {}) {
  const response = await fetch('/api/cex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, symbol: state.symbol, interval: state.interval, key: state.key, secret: state.secret, ...extra }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Futures request failed (${response.status})`);
  return data;
}

function candles(raw) {
  const d = raw?.data || raw;
  if (!d) return [];
  if (Array.isArray(d)) return d.map(x => Array.isArray(x) ? { time: n(x[0]), open: n(x[1]), high: n(x[2]), low: n(x[3]), close: n(x[4]) } : { time: n(x.t || x.time), open: n(x.o || x.open), high: n(x.h || x.high), low: n(x.l || x.low), close: n(x.c || x.close) }).filter(x => x.open);
  const t = d.time || [], o = d.open || [], h = d.high || [], l = d.low || [], c = d.close || [];
  return t.map((time, i) => ({ time: n(time), open: n(o[i]), high: n(h[i]), low: n(l[i]), close: n(c[i]) })).filter(x => x.open);
}
function sideLabel(side) { return ({ 1: 'Open Long', 2: 'Close Short', 3: 'Open Short', 4: 'Close Long' })[n(side)] || 'Order'; }

export default function PerpetualsPage() {
  const [symbol, setSymbol] = useState(() => localStorage.getItem('kitsetups_symbol') || 'BTCUSDT');
  const [interval, setIntervalValue] = useState('5m');
  const [pairs, setPairs] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [book, setBook] = useState(null);
  const [candleData, setCandleData] = useState([]);
  const [account, setAccount] = useState({ assets: [], positions: [], orders: [], history: [], positionHistory: [], funding: [], risk: null, fee: null, positionMode: null });
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [connected, setConnected] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [pairQuery, setPairQuery] = useState('');
  const [pairOpen, setPairOpen] = useState(false);
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [marginMode, setMarginMode] = useState('cross');
  const [leverage, setLeverage] = useState(5);
  const [volume, setVolume] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tab, setTab] = useState('positions');
  const [pnlSharePosition, setPnlSharePosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const state = useMemo(() => ({ symbol, interval, key, secret }), [symbol, interval, key, secret]);
  const contract = useMemo(() => pairs.find(p => normalize(p.symbol) === normalize(symbol)), [pairs, symbol]);
  const last = n(ticker?.lastPrice || ticker?.last || ticker?.fairPrice);
  const maxLeverage = Math.max(1, Math.floor(n(contract?.maxLeverage || contract?.maxLeverageNum || contract?.leverageMax || 100)));
  const leveragePercent = Math.min(100, Math.max(0, (leverage / maxLeverage) * 100));
  const usdt = account.assets.find(x => String(x.currency || '').toUpperCase() === 'USDT') || {};
  const positions = account.positions.filter(p => normalize(p.symbol) === normalize(symbol));
  const openOrders = account.orders.filter(o => normalize(o.symbol) === normalize(symbol));
  const orderEntry = orderType === 'limit' ? n(limitPrice) : last;
  const orderContractSize = n(contract?.contractSize || 1);
  const projectedTpPnl = volume && takeProfit && orderEntry ? positionPnl(orderEntry, takeProfit, volume, orderContractSize, side === 'buy' ? 1 : 2) : 0;
  const projectedSlPnl = volume && stopLoss && orderEntry ? positionPnl(orderEntry, stopLoss, volume, orderContractSize, side === 'buy' ? 1 : 2) : 0;

  const loadMarket = useCallback(async (initial = false) => {
    try {
      const [t, b, c] = await Promise.all([api('ticker', state), api('book', state), api('candles', state)]);
      setTicker(t?.data || null); setBook(b?.data || null); setCandleData(candles(c));
      if (initial) setPairs(arr(await api('pairs', state)));
      setError('');
    } catch (e) { setError(e.message || 'Market data unavailable.'); }
    finally { setLoading(false); }
  }, [state]);

  const loadAccount = useCallback(async () => {
    if (!connected || !key || !secret) return;
    const results = await Promise.allSettled([
      api('balance', state), api('positions', state), api('orders', state), api('history', state), api('positionHistory', state), api('fundingDetails', state), api('riskLimits', state), api('fee', state), api('positionMode', state)
    ]);
    const get = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;
    setAccount({ assets: arr(get(0, {})), positions: arr(get(1, {})), orders: arr(get(2, {})), history: arr(get(3, {})), positionHistory: arr(get(4, {})), funding: arr(get(5, {})), risk: get(6, null)?.data || null, fee: get(7, null)?.data || null, positionMode: get(8, null)?.data || null });
    const firstError = results.find(x => x.status === 'rejected');
    if (firstError) setError(firstError.reason?.message || 'One account feed failed.');
  }, [connected, key, secret, state]);

  useEffect(() => { loadMarket(true); }, []);
  useEffect(() => { if (!pairs.length) return; localStorage.setItem('kitsetups_symbol', symbol); loadMarket(false); }, [symbol, interval]);
  useEffect(() => { if (!connected) return undefined; loadAccount(); const timer = setInterval(loadAccount, 2500); return () => clearInterval(timer); }, [connected, loadAccount]);
  useEffect(() => { const timer = setInterval(() => loadMarket(false), 2500); return () => clearInterval(timer); }, [loadMarket]);

  const connect = async e => { e?.preventDefault(); if (!key || !secret) { setError('Enter your exchange Access Key and Secret Key.'); return; } setBusy(true); setError(''); try { await api('connect', state); setConnected(true); setCredentialsOpen(false); } catch (e) { setConnected(false); setError(e.message || 'Account connection failed.'); } finally { setBusy(false); } };
  const disconnect = () => { setConnected(false); setAccount({ assets: [], positions: [], orders: [], history: [], positionHistory: [], funding: [], risk: null, fee: null, positionMode: null }); };
  const choosePair = value => { setSymbol(value.replace('_USDT', 'USDT')); setPairQuery(''); setPairOpen(false); };

  const placeOrder = async e => {
    e.preventDefault();
    if (!connected) { setCredentialsOpen(true); return; }
    const vol = n(volume); if (!vol || vol <= 0) { setError('Enter the contract quantity in the Size field.'); return; }
    if (leverage < 1 || leverage > maxLeverage) { setError(`Leverage must be between 1x and ${maxLeverage}x for ${displaySymbol(symbol)}.`); return; }
    const price = orderType === 'market' ? last : n(limitPrice); if (!price) { setError('Enter a valid order price.'); return; }
    setBusy(true); setError('');
    try { await api('order', state, { side, intent: reduceOnly ? 'close' : 'open', type: orderType === 'market' ? 5 : 1, marginMode, leverage, volume: vol, price, reduceOnly, takeProfit: n(takeProfit) || undefined, stopLoss: n(stopLoss) || undefined }); setVolume(''); await loadAccount(); }
    catch (e) { setError(e.message || 'Order was rejected.'); } finally { setBusy(false); }
  };
  const cancel = async orderId => { setBusy(true); setError(''); try { await api('cancel', state, { orderIds: [orderId] }); await loadAccount(); } catch (e) { setError(e.message || 'Cancel failed.'); } finally { setBusy(false); } };
  const cancelAll = async () => { setBusy(true); setError(''); try { await api('cancelAll', state); await loadAccount(); } catch (e) { setError(e.message || 'Cancel-all failed.'); } finally { setBusy(false); } };
  const closePosition = async p => { const pSide = n(p.positionType) === 1 ? 'sell' : 'buy'; setBusy(true); setError(''); try { await api('order', state, { side: pSide, intent: 'close', type: 5, marginMode: n(p.openType) === 1 ? 'isolated' : 'cross', leverage: n(p.leverage) || leverage, volume: n(p.holdVol), price: last, positionId: p.positionId }); await loadAccount(); } catch (e) { setError(e.message || 'Close position failed.'); } finally { setBusy(false); } };

  const sharePnl = async p => {
    const entry = n(p.holdAvgPrice || p.openAvgPrice);
    const pnl = n(p.unRealizedPnl ?? p.unrealizedPnl ?? p.unrealisedPnl);
    const text = `KitSetups Futures\n${displaySymbol(p.symbol)} · ${n(p.positionType) === 1 ? 'Long' : 'Short'}\nPnL: ${fmt(pnl, 4)} USDT\nEntry: ${fmt(entry)} · Mark: ${fmt(last)}\nLeverage: ${fmt(p.leverage, 0)}x`;
    try {
      if (navigator.share) await navigator.share({ title: 'KitSetups Futures PnL', text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    } catch (e) { if (e?.name !== 'AbortError') setError('Share was not available on this device.'); }
  };

  const downloadPnl = p => {
    const pnl = n(p.unRealizedPnl ?? p.unrealizedPnl ?? p.unrealisedPnl);
    const entry = n(p.holdAvgPrice || p.openAvgPrice);
    const liq = n(p.liquidatePrice ?? p.liquidationPrice ?? p.liqPrice);
    const sideText = n(p.positionType) === 1 ? 'LONG' : 'SHORT';
    const safe = value => String(value).replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" rx="36" fill="#070a0f"/><rect x="48" y="48" width="1104" height="534" rx="28" fill="#0c1118" stroke="#263141"/><text x="92" y="112" fill="#25d6d0" font-family="Arial" font-size="26" font-weight="700">KITSETUPS FUTURES</text><text x="92" y="185" fill="#eef3f9" font-family="Arial" font-size="46" font-weight="700">${safe(displaySymbol(p.symbol))} · ${sideText}</text><text x="92" y="310" fill="${pnl >= 0 ? '#25d6d0' : '#ff5266'}" font-family="Arial" font-size="92" font-weight="800">${safe(fmt(pnl, 4))} USDT</text><text x="92" y="365" fill="#718097" font-family="Arial" font-size="22">Unrealized PnL</text><text x="92" y="445" fill="#aab6c7" font-family="Arial" font-size="22">Entry ${safe(fmt(entry))}   ·   Mark ${safe(fmt(last))}   ·   Leverage ${safe(fmt(p.leverage, 0))}x</text><text x="92" y="495" fill="#657287" font-family="Arial" font-size="20">Liquidation ${safe(fmt(liq))}</text><text x="92" y="540" fill="#657287" font-family="Arial" font-size="18">kitsetups.xyz</text></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `kitsetups-${String(p.symbol || 'position').replace(/[^a-z0-9_-]/gi, '')}-pnl.svg`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const estimatedMargin = n(volume) && last ? (n(volume) * last * orderContractSize) / Math.max(1, n(leverage)) : 0;
  const filteredPairs = pairs.filter(p => normalize(p.symbol).includes(normalize(pairQuery || symbol).replace('_USDT', ''))).slice(0, 80);

  return <div className="mexc-terminal">
    <header className="mexc-topbar">
      <div className="mexc-brand"><span className="mexc-logo">K</span><div><strong>KitSetups Futures</strong><small>USDT-M Perpetual</small></div></div>
      <div className="mexc-pair-picker"><button className="mexc-pair-button" onClick={() => setPairOpen(v => !v)}>{displaySymbol(symbol)} <span>▾</span></button>{pairOpen && <div className="mexc-pair-menu"><input autoFocus value={pairQuery} onChange={e => setPairQuery(e.target.value)} placeholder="Search futures pairs" />{filteredPairs.map(p => <button key={p.symbol} onClick={() => choosePair(p.symbol)}><b>{displaySymbol(p.symbol)}</b><span>max {n(p.maxLeverage || p.maxLeverageNum || p.leverageMax || 100)}x</span></button>)}{!filteredPairs.length && <div className="mexc-empty">No futures pair found</div>}</div>}</div>
      <div className="mexc-ticker"><b>{fmt(last)}</b><span className={n(ticker?.riseFallRate) >= 0 ? 'up' : 'down'}>{ticker?.riseFallRate != null ? `${(n(ticker.riseFallRate) * 100).toFixed(2)}%` : '—'}</span></div>
      <div className="mexc-connection"><span className={ticker ? 'dot live' : 'dot'} /> {connected ? 'Account connected' : 'Market live'} <button onClick={() => connected ? disconnect() : setCredentialsOpen(true)}>{connected ? 'Disconnect' : 'Connect Exchange'}</button></div>
    </header>
    <section className="mexc-stats"><Stat label="24H High" value={fmt(ticker?.high24Price)} /><Stat label="24H Low" value={fmt(ticker?.lower24Price)} /><Stat label="24H Volume" value={fmt(ticker?.volume)} /><Stat label="24H Turnover" value={fmt(ticker?.amount)} /><Stat label="Mark / Fair" value={fmt(ticker?.fairPrice)} /><Stat label="Index" value={fmt(ticker?.indexPrice)} /><Stat label="Funding" value={pct(ticker?.fundingRate)} /><Stat label="Next Funding" value={ticker?.nextSettleTime ? new Date(n(ticker.nextSettleTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} /></section>
    <main className="mexc-main">
      <section className="mexc-chart-panel"><div className="mexc-toolbar"><div className="mexc-timeframes">{['1m','5m','15m','30m','1h','4h','1d'].map(tf => <button key={tf} className={interval === tf ? 'active' : ''} onClick={() => setIntervalValue(tf)}>{tf}</button>)}</div><span>{loading ? 'Loading…' : '● Live'}</span></div><CandleChart data={candleData} /></section>
      <section className="mexc-book-panel"><div className="panel-title"><b>Order Book</b><span>USDT</span></div><div className="book-head"><span>Price</span><span>Size</span><span>Value</span></div>{arr(book?.asks).slice(0, 12).reverse().map((row, i) => <BookRow key={`a${i}`} row={row} ask />)}<div className="book-last">{fmt(last)} <small>Fair {fmt(ticker?.fairPrice)}</small></div>{arr(book?.bids).slice(0, 12).map((row, i) => <BookRow key={`b${i}`} row={row} />)}</section>
      <section className="mexc-order-panel"><div className="panel-title"><b>Place Order</b><span>Perpetual</span></div><div className="order-sides"><button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>Open Long</button><button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>Open Short</button></div><div className="field-row"><label>Margin</label><select value={marginMode} onChange={e => setMarginMode(e.target.value)}><option value="cross">Cross</option><option value="isolated">Isolated</option></select></div><div className="field"><label>Leverage <b>{leverage}x · {leveragePercent.toFixed(0)}% of max</b></label><input type="range" min="1" max={maxLeverage} value={leverage} onChange={e => setLeverage(Number(e.target.value))}/><div className="leverage-track"><span style={{ width: `${leveragePercent}%` }} /></div><div className="range-labels"><span>1x</span><span>{leverage}x</span><span>{maxLeverage}x</span></div></div><div className="field-row"><label>Order Type</label><select value={orderType} onChange={e => setOrderType(e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></div>{orderType === 'limit' && <Field label="Price" value={limitPrice} onChange={setLimitPrice} placeholder={fmt(last)} />}<Field label="Size (contracts)" value={volume} onChange={setVolume} placeholder="Enter contract quantity" /><div className="quick-size">{[25,50,75,100].map(v => <button key={v} type="button" onClick={() => setVolume(String(Math.max(1, Math.floor(n(usdt.availableBalance) * v / 100 * n(leverage) / Math.max(last * orderContractSize, 1)))))}>{v}%</button>)}</div><div className="estimate"><span>Est. initial margin</span><b>{estimatedMargin ? `${fmt(estimatedMargin, 4)} USDT` : '—'}</b></div><Field label="Take Profit" value={takeProfit} onChange={setTakeProfit} placeholder="Optional price" />{takeProfit && <div className={`pnl-preview ${projectedTpPnl >= 0 ? 'positive' : 'negative'}`}>TP result: {projectedTpPnl >= 0 ? '+' : ''}{fmt(projectedTpPnl, 4)} USDT</div>}<Field label="Stop Loss" value={stopLoss} onChange={setStopLoss} placeholder="Optional price" />{stopLoss && <div className={`pnl-preview ${projectedSlPnl >= 0 ? 'positive' : 'negative'}`}>SL result: {projectedSlPnl >= 0 ? '+' : ''}{fmt(projectedSlPnl, 4)} USDT</div>}<label className="check"><input type="checkbox" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} /> Reduce-only</label><button className={side === 'buy' ? 'submit buy-submit' : 'submit sell-submit'} onClick={placeOrder} disabled={busy}>{busy ? 'Processing…' : connected ? `${side === 'buy' ? 'Open Long' : 'Open Short'} ${displaySymbol(symbol)}` : 'Connect to Trade'}</button><div className="available">Available <b>{fmt(usdt.availableBalance, 4)} USDT</b></div></section>
    </main>
    <section className="mexc-account-bar"><Metric label="Wallet Balance" value={`${fmt(usdt.cashBalance ?? usdt.equity)} USDT`} /><Metric label="Available" value={`${fmt(usdt.availableBalance)} USDT`} /><Metric label="Position Margin" value={`${fmt(usdt.positionMargin)} USDT`} /><Metric label="Unrealized PnL" value={`${fmt(usdt.unrealized)}`} /><Metric label="Equity" value={`${fmt(usdt.equity)} USDT`} /></section>
    <section className="mexc-bottom"><div className="mexc-tabs">{[['positions','Positions'],['orders','Open Orders'],['history','Order History'],['positionHistory','Position History'],['funding','Funding'],['risk','Risk / Fees']].map(([id,label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}{id === 'positions' && positions.length ? ` (${positions.length})` : ''}{id === 'orders' && openOrders.length ? ` (${openOrders.length})` : ''}</button>)}{tab === 'orders' && openOrders.length > 0 && <button className="cancel-all" onClick={cancelAll} disabled={busy}>Cancel All</button>}</div><div className="mexc-table-wrap">{tab === 'positions' && <Positions rows={positions} onClose={closePosition} onShare={sharePnl} onDownload={downloadPnl} />}{tab === 'orders' && <Orders rows={openOrders} onCancel={cancel} />}{tab === 'history' && <Orders rows={account.history} history />}{tab === 'positionHistory' && <PositionHistory rows={account.positionHistory} />}{tab === 'funding' && <Funding rows={account.funding} />}{tab === 'risk' && <Risk risk={account.risk} fee={account.fee} positionMode={account.positionMode} contract={contract} />}</div></section>
    {error && <div className="mexc-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {pnlSharePosition && <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setPnlSharePosition(null)}><div className="pnl-share-dialog"><div className="pnl-share-card"><small>KITSETUPS FUTURES</small><h3>{displaySymbol(pnlSharePosition.symbol)} · {n(pnlSharePosition.positionType) === 1 ? 'Long' : 'Short'}</h3><strong className={n(pnlSharePosition.unRealizedPnl ?? pnlSharePosition.unrealizedPnl) >= 0 ? 'positive-text' : 'negative-text'}>{fmt(pnlSharePosition.unRealizedPnl ?? pnlSharePosition.unrealizedPnl, 4)} USDT</strong><span>Unrealized PnL</span><p>Entry {fmt(pnlSharePosition.holdAvgPrice)} · Mark {fmt(last)} · {fmt(pnlSharePosition.leverage, 0)}x</p><p>Liquidation {fmt(pnlSharePosition.liquidatePrice ?? pnlSharePosition.liquidationPrice ?? pnlSharePosition.liqPrice)}</p></div><div className="pnl-share-actions"><button onClick={() => sharePnl(pnlSharePosition)}>Share</button><button onClick={() => downloadPnl(pnlSharePosition)}>Download</button><button className="ghost" onClick={() => setPnlSharePosition(null)}>Close</button></div></div></div>}
    {credentialsOpen && <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setCredentialsOpen(false)}><form className="mexc-dialog" onSubmit={connect}><div className="dialog-head"><div><h3>Connect Futures Account</h3><p>Use your exchange API key with Futures permissions. Credentials stay in this browser session and are sent only to the KitSetups API route.</p></div><button type="button" onClick={() => setCredentialsOpen(false)}>×</button></div><Field label="Access Key" value={key} onChange={setKey} placeholder="Access Key" /><div className="field"><label>Secret Key</label><input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Secret Key" autoComplete="off" /></div><button className="submit connect-submit" disabled={busy}>{busy ? 'Connecting…' : 'Connect Futures'}</button></form></div>}
  </div>;
}

function Field({ label, value, onChange, placeholder }) { return <div className="field"><label>{label}</label><input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" /></div>; }
function Stat({ label, value }) { return <div className="mexc-stat"><small>{label}</small><b>{value}</b></div>; }
function Metric({ label, value }) { return <div className="mexc-metric"><small>{label}</small><b>{value}</b></div>; }
function BookRow({ row, ask }) { const price = n(row?.[0] ?? row?.price), size = n(row?.[1] ?? row?.size); return <div className="book-row"><span className={ask ? 'ask' : 'bid'}>{fmt(price)}</span><span>{fmt(size)}</span><span>{fmt(size * price, 2)}</span></div>; }
function CandleChart({ data }) { const w = 1000, h = 460, pad = 30, max = Math.max(...data.map(x => x.high), 0), min = Math.min(...data.map(x => x.low), max || 1), range = max - min || 1, visible = data.slice(-120); return <div className="candle-wrap"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="candle-chart"><rect width="100%" height="100%" fill="#080c12"/>{[1,2,3,4].map(i => <line key={i} x1="0" x2={w} y1={(h / 5) * i} y2={(h / 5) * i} stroke="#18212d" />)}{visible.map((c, i) => { const x = pad + i * ((w - pad * 2) / Math.max(1, visible.length - 1)); const y = v => pad + ((max - v) / range) * (h - pad * 2); const up = c.close >= c.open; return <g key={c.time || i}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={up ? '#22c7a5' : '#f05b6b'} /><rect x={x - 2} y={Math.min(y(c.open), y(c.close))} width="4" height={Math.max(2, Math.abs(y(c.open) - y(c.close)))} fill={up ? '#22c7a5' : '#f05b6b'} /></g>; })}</svg>{!visible.length && <div className="chart-empty">Loading candles…</div>}</div>; }
function Empty({ text }) { return <div className="table-empty">{text}</div>; }
function Positions({ rows, onClose, onShare, onDownload }) { if (!rows.length) return <Empty text="No open positions for this contract." />; return <table><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Liquidation</th><th>Margin</th><th>Leverage</th><th>Margin Ratio</th><th>Unrealized PnL</th><th>Actions</th></tr></thead><tbody>{rows.map(p => { const pnl = n(p.unRealizedPnl ?? p.unrealizedPnl ?? p.unrealisedPnl); const liq = n(p.liquidatePrice ?? p.liquidationPrice ?? p.liqPrice); return <tr key={p.positionId}><td>{displaySymbol(p.symbol)}</td><td className={n(p.positionType) === 1 ? 'bid' : 'ask'}>{n(p.positionType) === 1 ? 'Long' : 'Short'}</td><td>{fmt(p.holdVol)}</td><td>{fmt(p.holdAvgPrice)}</td><td>{fmt(lastForPosition(p))}</td><td className="liq-price">{fmt(liq)}</td><td>{fmt(p.im)}</td><td className="leverage-cell">{fmt(p.leverage || p.leverageRatio, 0)}x</td><td>{pct(p.marginRatio)}</td><td className={pnl >= 0 ? 'bid' : 'ask'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</td><td><div className="position-actions"><button className="row-action" onClick={() => onShare(p)}>Share</button><button className="row-action" onClick={() => onDownload(p)}>Download</button><button className="row-action danger" onClick={() => onClose(p)}>Close</button></div></td></tr>; })}</tbody></table>; }
function lastForPosition(p) { return n(p.markPrice || p.markPricePrice || p.fairPrice || p.lastPrice) || '—'; }
function Orders({ rows, onCancel, history }) { if (!rows.length) return <Empty text={history ? 'No order history returned.' : 'No open orders.'} />; return <table><thead><tr><th>Order ID</th><th>Contract</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Filled</th><th>Margin</th><th>Status</th>{!history && <th>Action</th>}</tr></thead><tbody>{rows.map(o => <tr key={o.orderId}><td>{String(o.orderId).slice(-12)}</td><td>{displaySymbol(o.symbol)}</td><td>{sideLabel(o.side)}</td><td>{n(o.orderType) === 1 ? 'Limit' : n(o.orderType) === 5 ? 'Market' : `Type ${o.orderType}`}</td><td>{fmt(o.price)}</td><td>{fmt(o.vol)}</td><td>{fmt(o.dealVol)}</td><td>{fmt(o.orderMargin || o.usedMargin)}</td><td>{history ? ({1:'Pending',2:'Unfilled',3:'Filled',4:'Canceled',5:'Invalid'}[n(o.state)] || '—') : 'Open'}</td>{!history && <td><button className="row-action danger" onClick={() => onCancel(o.orderId)}>Cancel</button></td>}</tr>)}</tbody></table>; }
function PositionHistory({ rows }) { if (!rows.length) return <Empty text="No position history returned." />; return <table><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Close</th><th>Realized</th><th>Fees</th><th>Created</th></tr></thead><tbody>{rows.map((p, i) => <tr key={p.positionId || i}><td>{displaySymbol(p.symbol)}</td><td>{n(p.positionType) === 1 ? 'Long' : 'Short'}</td><td>{fmt(p.holdVol || p.closeVol)}</td><td>{fmt(p.holdAvgPrice || p.openAvgPrice)}</td><td>{fmt(p.closeAvgPrice)}</td><td>{fmt(p.realised || p.closeProfitLoss)}</td><td>{fmt(p.totalFee || p.fee)}</td><td>{p.createTime ? new Date(n(p.createTime)).toLocaleString() : '—'}</td></tr>)}</tbody></table>; }
function Funding({ rows }) { if (!rows.length) return <Empty text="No funding records returned." />; return <table><thead><tr><th>Contract</th><th>Amount</th><th>Rate</th><th>Position ID</th><th>Time</th></tr></thead><tbody>{rows.map((f, i) => <tr key={f.id || i}><td>{displaySymbol(f.symbol)}</td><td>{fmt(f.amount || f.fundingFee)}</td><td>{pct(f.fundingRate)}</td><td>{f.positionId || '—'}</td><td>{f.createTime ? new Date(n(f.createTime)).toLocaleString() : '—'}</td></tr>)}</tbody></table>; }
function Risk({ risk, fee, positionMode, contract }) { const entries = risk ? Object.entries(risk).flatMap(([symbol, levels]) => Array.isArray(levels) ? levels.map(x => ({ symbol, ...x })) : []) : []; return <div className="risk-grid"><div className="risk-card"><small>Position mode</small><b>{n(positionMode?.positionMode) === 1 ? 'Hedge Mode' : n(positionMode?.positionMode) === 2 ? 'One-way Mode' : '—'}</b></div><div className="risk-card"><small>Contract size</small><b>{fmt(contract?.contractSize)}</b></div><div className="risk-card"><small>Volume unit</small><b>{fmt(contract?.volUnit)}</b></div><div className="risk-card"><small>Price unit</small><b>{fmt(contract?.priceUnit)}</b></div>{entries.slice(0, 12).map((r, i) => <div className="risk-card" key={i}><small>Risk L{r.level} · {n(r.positionType) === 1 ? 'Long' : 'Short'}</small><b>MMR {pct(r.mmr)} · IMR {pct(r.imr)} · Max {fmt(r.maxLeverage, 0)}x</b></div>)}<div className="risk-card"><small>Fee source</small><b>{fee ? 'Account fee data' : 'Futures API'}</b></div></div>; }
