import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import './mexcFutures.css';
import './pnl-card.css';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const fmt = (v, digits = 8) => Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
const pct = v => `${(n(v) * 100).toFixed(4)}%`;
const normalize = s => String(s || '').toUpperCase().replace(/[-/]/g, '').replace(/_USDT$/, 'USDT').replace(/USDT$/, '_USDT');
const displaySymbol = s => String(s || '').replace('_USDT', '/USDT');
const arr = v => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : []);
const positionPnl = (entry, target, volume, contractSize, positionType) => (n(target) - n(entry)) * n(volume) * n(contractSize || 1) * (n(positionType) === 1 ? 1 : -1);
const unrealizedPnlValue = (p, mark, contractSize = 1) => { const entry=n(p?.holdAvgPrice||p?.openAvgPrice), volume=n(p?.holdVol), direction=n(p?.positionType)===1?1:-1; if(!entry||!mark||!volume)return 0; return (n(mark)-entry)*volume*n(contractSize||1)*direction; };

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

export default function PerpetualsPage({ user }) {
  const [symbol, setSymbol] = useState(() => localStorage.getItem('kitsetups_symbol') || 'BTCUSDT');
  const [interval, setIntervalValue] = useState('5m');
  const [pairs, setPairs] = useState([]);
  const [ticker, setTicker] = useState(null);
  const [book, setBook] = useState(null);
  const [candleData, setCandleData] = useState([]);
  const [account, setAccount] = useState({ assets: [], positions: [], orders: [], stopOrders: [], history: [], positionHistory: [], funding: [], risk: null, fee: null, positionMode: null });
  const MEXC_STORAGE_KEY = 'kitsetups_mexc_credentials_v2';
  const savedCredentials = (() => { try { return JSON.parse(localStorage.getItem(MEXC_STORAGE_KEY) || '{}'); } catch { return {}; } })();
  const [key, setKey] = useState(savedCredentials.key || '');
  const [secret, setSecret] = useState(savedCredentials.secret || '');
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
  const [allowUnprotected, setAllowUnprotected] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tab, setTab] = useState('positions');
  const [hideOtherPairs, setHideOtherPairs] = useState(true);
  const [morePositionsOpen, setMorePositionsOpen] = useState(false);
  const [pnlSharePosition, setPnlSharePosition] = useState(null);

  const [pnlShareFile, setPnlShareFile] = useState(null);
  const [pnlShareBusy, setPnlShareBusy] = useState(false);
  const [riskPosition, setRiskPosition] = useState(null);
  const [riskTp, setRiskTp] = useState('');
  const [riskSl, setRiskSl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [marketInfoOpen, setMarketInfoOpen] = useState(false);
  const chartRef = useRef(null);

  const state = useMemo(() => ({ symbol, interval, key, secret }), [symbol, interval, key, secret]);
  const contract = useMemo(() => pairs.find(p => normalize(p.symbol) === normalize(symbol)), [pairs, symbol]);
  const last = n(ticker?.lastPrice || ticker?.last || ticker?.fairPrice);
  const maxLeverage = Math.max(1, Math.floor(n(contract?.maxLeverage || contract?.maxLeverageNum || contract?.leverageMax || 100)));
  const leveragePercent = Math.min(100, Math.max(0, (leverage / maxLeverage) * 100));
  const usdt = account.assets.find(x => String(x.currency || '').toUpperCase() === 'USDT') || {};
  const allOpenPositions = account.positions.filter(p => n(p.holdVol) > 0);
  const positions = hideOtherPairs ? allOpenPositions.filter(p => normalize(p.symbol) === normalize(symbol)) : allOpenPositions;
  const openOrders = account.orders.filter(o => normalize(o.symbol) === normalize(symbol));
  const stopOrders = account.stopOrders.filter(o => normalize(o.symbol) === normalize(symbol) && !n(o.isFinished));
  const orderEntry = orderType === 'limit' ? n(limitPrice) : last;
  const orderContractSize = n(contract?.contractSize || 1);
  const projectedTpPnl = volume && takeProfit && orderEntry ? positionPnl(orderEntry, takeProfit, volume, orderContractSize, side === 'buy' ? 1 : 2) : 0;
  const projectedSlPnl = volume && stopLoss && orderEntry ? positionPnl(orderEntry, stopLoss, volume, orderContractSize, side === 'buy' ? 1 : 2) : 0;
  const profileName = user?.displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'KitSetups Trader';
  const profileAvatar = user?.photoURL || user?.user_metadata?.avatar_url || '';

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
      api('balance', state), api('positions', state), api('orders', state), api('stopOrders', state), api('history', state), api('positionHistory', state), api('fundingDetails', state), api('riskLimits', state), api('fee', state), api('positionMode', state)
    ]);
    const get = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;
    setAccount({ assets: arr(get(0, {})), positions: arr(get(1, {})), orders: arr(get(2, {})), stopOrders: arr(get(3, {})), history: arr(get(4, {})), positionHistory: arr(get(5, {})), funding: arr(get(6, {})), risk: get(7, null)?.data || null, fee: get(8, null)?.data || null, positionMode: get(9, null)?.data || null });
    const firstError = results.find(x => x.status === 'rejected');
    if (firstError) setError(firstError.reason?.message || 'One account feed failed.');
  }, [connected, key, secret, state]);

  useEffect(() => {
    if (!savedCredentials.key || !savedCredentials.secret) {
      setCredentialsOpen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError('');
      try {
        await api('connect', { symbol, interval, key: savedCredentials.key, secret: savedCredentials.secret });
        if (!cancelled) setConnected(true);
      } catch (e) {
        if (!cancelled) {
          setConnected(false);
          setError('Your saved MEXC connection needs to be reconnected. Please check the API key or permissions.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { loadMarket(true); }, []);
  useEffect(() => { if (!pairs.length) return; localStorage.setItem('kitsetups_symbol', symbol); loadMarket(false); }, [symbol, interval]);
  useEffect(() => { if (!connected) return undefined; loadAccount(); const timer = setInterval(loadAccount, 2500); return () => clearInterval(timer); }, [connected, loadAccount]);
  useEffect(() => { const timer = setInterval(() => loadMarket(false), 2500); return () => clearInterval(timer); }, [loadMarket]);

  const connect = async e => { e?.preventDefault(); if (!key || !secret) { setError('Enter your exchange Access Key and Secret Key.'); return; } setBusy(true); setError(''); try { await api('connect', state); localStorage.setItem(MEXC_STORAGE_KEY, JSON.stringify({ key, secret })); setConnected(true); setCredentialsOpen(false); } catch (e) { setConnected(false); setError(e.message || 'Account connection failed.'); } finally { setBusy(false); } };
  const disconnect = () => { localStorage.removeItem(MEXC_STORAGE_KEY); setKey(''); setSecret(''); setConnected(false); setAccount({ assets: [], positions: [], orders: [], stopOrders: [], history: [], positionHistory: [], funding: [], risk: null, fee: null, positionMode: null }); };
  const choosePair = value => { setSymbol(value.replace('_USDT', 'USDT')); setPairQuery(''); setPairOpen(false); };

  const placeOrder = async e => {
    e.preventDefault();
    if (!connected) { setCredentialsOpen(true); return; }
    const vol = n(volume); if (!vol || vol <= 0) { setError('Enter the contract quantity in the Size field.'); return; }
    if (leverage < 1 || leverage > maxLeverage) { setError(`Leverage must be between 1x and ${maxLeverage}x for ${displaySymbol(symbol)}.`); return; }
    const price = orderType === 'market' ? 0 : n(limitPrice); if (orderType !== 'market' && !price) { setError('Enter a valid order price.'); return; }
    if (!reduceOnly && !allowUnprotected && !n(stopLoss)) { setError('Protect this position with a Stop Loss before opening it. Enable “Open without Stop Loss” only if you intentionally want an unprotected position.'); return; }
    setBusy(true); setError('');
    try {
      const positionMode = n(account.positionMode?.positionMode ?? account.positionMode) || undefined;
      const result = await api('order', state, {
        side,
        intent: reduceOnly ? 'close' : 'open',
        type: orderType === 'market' ? 5 : 1,
        marginMode,
        leverage,
        volume: vol,
        price,
        reduceOnly,
        positionMode,
        takeProfit: n(takeProfit) || undefined,
        stopLoss: n(stopLoss) || undefined
      });
      const returnedOrderId = result?.data?.orderId || result?.data?.id || result?.orderId || (typeof result?.data === 'string' ? result.data : '');
      setVolume('');
      setTab(orderType === 'limit' ? 'orders' : 'positions');

      // The exchange has already accepted the order at this point. Account refreshes
      // are confirmation/UI work and must never turn a successful order into a false
      // "order rejected" message because a secondary read endpoint is delayed or rate-limited.
      if (orderType === 'limit') {
        let confirmed = [];
        for (let i = 0; i < 3; i++) {
          try {
            const refreshed = await api('orders', state);
            confirmed = arr(refreshed);
            setAccount(prev => ({ ...prev, orders: confirmed }));
            if (returnedOrderId && confirmed.some(o => String(o.orderId || o.id) === String(returnedOrderId))) break;
            if (!returnedOrderId && confirmed.some(o => normalize(o.symbol) === normalize(symbol) && n(o.vol) === vol)) break;
          } catch {}
          if (i < 2) await new Promise(r => setTimeout(r, 700));
        }
        try { await loadAccount(); } catch {}
      } else {
        for (let i = 0; i < 3; i++) {
          try {
            const refreshed = await api('positions', state);
            const rows = arr(refreshed);
            setAccount(prev => ({ ...prev, positions: rows }));
            if (rows.some(p => normalize(p.symbol) === normalize(symbol) && n(p.holdVol) > 0)) break;
          } catch {}
          if (i < 2) await new Promise(r => setTimeout(r, 700));
        }
        try { await loadAccount(); } catch {}
      }
    } catch (e) { setError(e.message || 'Order was rejected.'); } finally { setBusy(false); }
  };

  const openRiskManager = p => {
    const related = stopOrders.filter(o => String(o.positionId) === String(p.positionId));
    const tpOrder = related.find(o => n(o.takeProfitPrice) > 0);
    const slOrder = related.find(o => n(o.stopLossPrice) > 0);
    setRiskPosition(p);
    setRiskTp(tpOrder?.takeProfitPrice ? String(tpOrder.takeProfitPrice) : '');
    setRiskSl(slOrder?.stopLossPrice ? String(slOrder.stopLossPrice) : '');
  };

  const saveRisk = async e => {
    e?.preventDefault();
    if (!riskPosition) return;
    const tp = n(riskTp), sl = n(riskSl), positionType = n(riskPosition.positionType);
    const entry = n(riskPosition.holdAvgPrice || riskPosition.openAvgPrice);
    if (!tp && !sl) { setError('Set at least a Stop Loss or Take Profit.'); return; }
    if (positionType === 1 && ((sl && sl >= entry) || (tp && tp <= entry))) { setError('For a Long position, Stop Loss must be below entry and Take Profit above entry.'); return; }
    if (positionType === 2 && ((sl && sl <= entry) || (tp && tp >= entry))) { setError('For a Short position, Stop Loss must be above entry and Take Profit below entry.'); return; }
    setBusy(true); setError('');
    try {
      const related = stopOrders.filter(o => String(o.positionId) === String(riskPosition.positionId));
      if (related.length) {
        await api('cancelStopAll', state, { positionId: riskPosition.positionId });
        await new Promise(r => setTimeout(r, 250));
      }
      await api('placeStopOrder', state, {
        positionId: riskPosition.positionId,
        volume: n(riskPosition.holdVol),
        stopLossPrice: sl || undefined,
        takeProfitPrice: tp || undefined,
        lossTrend: 1,
        profitTrend: 1,
        priceProtect: 0
      });
      await loadAccount();
      setRiskPosition(null);
    } catch (e) { setError(e.message || 'Could not update position protection.'); }
    finally { setBusy(false); }
  };

  const removeRisk = async () => {
    if (!riskPosition) return;
    setBusy(true); setError('');
    try {
      await api('cancelStopAll', state, { positionId: riskPosition.positionId });
      await loadAccount();
      setRiskPosition(null);
    } catch (e) { setError(e.message || 'Could not remove protection.'); }
    finally { setBusy(false); }
  };

  const cancel = async orderId => { setBusy(true); setError(''); try { await api('cancel', state, { orderIds: [orderId] }); await loadAccount(); } catch (e) { setError(e.message || 'Cancel failed.'); } finally { setBusy(false); } };
  const cancelAll = async () => { setBusy(true); setError(''); try { await api('cancelAll', state); await loadAccount(); } catch (e) { setError(e.message || 'Cancel-all failed.'); } finally { setBusy(false); } };
  const closePosition = async p => {
    if (!p?.positionId || !n(p.holdVol)) { setError('Position details are incomplete; refresh the account and try again.'); return; }
    setBusy(true); setError('');
    try {
      await api('closePosition', state, { positionId: p.positionId, positionType: n(p.positionType), openType: n(p.openType), volume: n(p.holdVol), positionMode: n(account.positionMode?.positionMode ?? account.positionMode) || undefined });
      // A manually closed position must not retain its separate protective stop plans.
      try { await api('cancelStopAll', state, { positionId: p.positionId }); } catch {}
      await loadAccount();
      for (let i = 0; i < 3; i++) { await new Promise(r => setTimeout(r, 700)); await loadAccount(); }
    } catch (e) { setError(e.message || 'Close position failed.'); } finally { setBusy(false); }
  };

  const reversePosition = async p => {
    if (!p?.positionId || !n(p.holdVol)) { setError('Position details are incomplete; refresh the account and try again.'); return; }
    if (!connected) { setError('Connect your Futures account before reversing a position.'); return; }
    setBusy(true); setError('');
    try {
      const positionMode = n(account.positionMode?.positionMode ?? account.positionMode) || undefined;
      await api('closePosition', state, {
        positionId: p.positionId,
        positionType: n(p.positionType),
        openType: n(p.openType),
        volume: n(p.holdVol),
        positionMode
      });
      try { await api('cancelStopAll', state, { positionId: p.positionId }); } catch {}
      await new Promise(r => setTimeout(r, 500));
      const reverseSide = n(p.positionType) === 1 ? 'sell' : 'buy';
      await api('order', state, {
        intent: 'open',
        side: reverseSide,
        volume: n(p.holdVol),
        leverage: n(p.leverage || p.leverageRatio) || leverage,
        type: 5,
        marginMode: n(p.openType) === 1 ? 'isolated' : 'cross',
        positionMode
      });
      await loadAccount();
    } catch (e) {
      setError(e.message || 'Reverse position failed.');
    } finally {
      setBusy(false);
    }
  };

  const closeAllPositions = async () => {
    if (!positions.length) return;
    setBusy(true); setError('');
    try {
      for (const p of positions) {
        if (!p?.positionId || !n(p.holdVol)) continue;
        await api('closePosition', state, {
          positionId: p.positionId,
          positionType: n(p.positionType),
          openType: n(p.openType),
          volume: n(p.holdVol),
          positionMode: n(account.positionMode?.positionMode ?? account.positionMode) || undefined
        });
        try { await api('cancelStopAll', state, { positionId: p.positionId }); } catch {}
      }
      await loadAccount();
    } catch (e) {
      setError(e.message || 'Close all positions failed.');
    } finally {
      setBusy(false);
    }
  };

  const escapeSvg = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const pnlValue = p => {
    const supplied = p?.unRealizedPnl ?? p?.unrealizedPnl ?? p?.unrealisedPnl;
    return supplied !== undefined && Number.isFinite(Number(supplied)) ? Number(supplied) : unrealizedPnlValue(p, displayMarkFor(p), orderContractSize);
  };
  const pnlPercent = p => {
    const pnl = pnlValue(p);
    const entry = n(p.holdAvgPrice || p.openAvgPrice);
    const lev = n(p.leverage || p.leverageRatio) || 1;
    const initialMargin = n(p.im) || (entry && n(p.holdVol) && orderContractSize ? (entry * n(p.holdVol) * orderContractSize) / lev : 0);
    return initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
  };

  const KITSETUPS_LOGO_URL = 'https://i.postimg.cc/B6bHVQnT/Kitsetsup-Logo-PNG.png';

  const isClosedPosition = p => Boolean(p?.closeAvgPrice || p?.closeTime || p?.closeTimestamp || p?.closeVol || p?.realised !== undefined || p?.closeProfitLoss !== undefined);

  const protectionFor = p => {
    const closed = isClosedPosition(p);
    const related = !closed ? stopOrders.filter(o => String(o.positionId) === String(p.positionId)) : [];
    const historyOrders = account.history.filter(o => String(o.positionId || '') === String(p.positionId || ''));
    const first = historyOrders.find(o => o.stopLossPrice || o.takeProfitPrice || o.lossPrice || o.profitPrice) || {};
    const slOrder = related.find(o => n(o.stopLossPrice) > 0);
    const tpOrder = related.find(o => n(o.takeProfitPrice) > 0);
    return {
      sl: p?.stopLossPrice ?? p?.stopLoss ?? p?.slPrice ?? slOrder?.stopLossPrice ?? first?.stopLossPrice ?? first?.lossPrice ?? '',
      tp: p?.takeProfitPrice ?? p?.takeProfit ?? p?.tpPrice ?? tpOrder?.takeProfitPrice ?? first?.takeProfitPrice ?? first?.profitPrice ?? ''
    };
  };

  const displayMarkFor = p => {
    if (isClosedPosition(p)) return n(p.closeAvgPrice || p.closePrice || p.exitPrice) || n(p.markPrice || p.fairPrice);
    return n(p.markPrice || p.markPricePrice || p.fairPrice || p.lastPrice) || last;
  };

  const imageUrlToDataUri = async url => {
    if (!url) return '';
    if (String(url).startsWith('data:')) return url;
    try {
      const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
      if (!response.ok) throw new Error('Avatar request failed.');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const buildPnlSvg = async p => {
    const entry = n(p.holdAvgPrice || p.openAvgPrice);
    const mark = n(p.markPrice || p.markPricePrice || p.fairPrice || p.lastPrice) || last;
    const lev = n(p.leverage || p.leverageRatio) || 1;
    const roi = pnlPercent(p);
    const positive = roi >= 0;
    const pnlColor = positive ? '#4f7dff' : '#ff5266';
    const arrow = positive ? '↗' : '↘';
    const sideText = n(p.positionType) === 1 ? 'Long' : 'Short';
    const protection = protectionFor(p);
    const sl = protection.sl !== '' ? fmt(protection.sl) : '—';
    const tp = protection.tp !== '' ? fmt(protection.tp) : '—';
    const safe = v => escapeSvg(v);
    const pnlText = `${positive ? '+' : ''}${roi.toFixed(2)}%`;
    const vals = [
      ['Entry', fmt(entry)],
      ['Mark', fmt(mark)],
      ['Leverage', `${fmt(lev, 0)}x`],
      ['SL', sl],
      ['TP', tp]
    ];
    const cells = vals.map((item, i) => {
      const x = 80 + i * 184;
      return `<text x="${x}" y="1080" fill="#f1f3f5" font-family="Arial,Helvetica,sans-serif" font-size="22">${safe(item[0])}</text><text x="${x}" y="1152" fill="#eef0f2" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="700">${safe(item[1])}</text>`;
    }).join('');
    const initials = safe(profileName.slice(0, 1).toUpperCase());
    const avatarDataUri = await imageUrlToDataUri(profileAvatar);
    const avatarHref = avatarDataUri || profileAvatar;
    const logoDataUri = await imageUrlToDataUri(KITSETUPS_LOGO_URL);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1277" viewBox="0 0 1080 1277">
      <defs>
        <clipPath id="pnlAvatarClip"><circle cx="865" cy="228" r="58"/></clipPath>
        <radialGradient id="glow" cx="72%" cy="53%" r="52%"><stop offset="0" stop-color="#0b3b37" stop-opacity=".62"/><stop offset=".42" stop-color="#06221f" stop-opacity=".26"/><stop offset="1" stop-color="#050708" stop-opacity="0"/></radialGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b5d60"/><stop offset=".5" stop-color="#12373a"/><stop offset="1" stop-color="#071d20"/></linearGradient>
      </defs>
      <rect width="1080" height="1277" fill="#050708"/>
      <rect x="57" y="16" width="966" height="1245" rx="50" fill="#050708" stroke="url(#edge)" stroke-width="2.5"/>
      <rect x="84" y="43" width="913" height="1214" rx="3" fill="url(#glow)" stroke="#0b3538" stroke-width="2"/>
      <circle cx="807" cy="630" r="408" fill="none" stroke="#0b4548" stroke-opacity=".78" stroke-width="2"/>
      <path d="M397 628 A410 410 0 0 1 997 266" fill="none" stroke="#0b4548" stroke-opacity=".72" stroke-width="2"/>
      <path d="M407 628 A407 407 0 0 0 997 994" fill="none" stroke="#0b4548" stroke-opacity=".72" stroke-width="2"/>
      <rect x="156" y="288" width="94" height="94" rx="22" fill="#071112"/>
      ${logoDataUri ? `<image href="${safe(logoDataUri)}" x="156" y="288" width="94" height="94" preserveAspectRatio="xMidYMid meet" />` : ''}
      <text x="275" y="311" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" letter-spacing="3.5" fill="#27d1c7">KITSETUPS FUTURES</text>
      <text x="275" y="367" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="600" fill="#f4f5f6">${safe(profileName)}</text>
      <circle cx="865" cy="228" r="58" fill="#101718" stroke="#687272" stroke-width="2"/>
      ${avatarHref ? `<image href="${safe(avatarHref)}" x="807" y="170" width="116" height="116" preserveAspectRatio="xMidYMid slice" clip-path="url(#pnlAvatarClip)"/>` : `<text x="865" y="240" text-anchor="middle" fill="#eef3f8" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="700">${initials}</text>`}
      <text x="156" y="518" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="700" letter-spacing="-2.2" fill="#f6f7f8">${safe(displaySymbol(p.symbol))} · ${sideText}</text>
      <text x="179" y="722" font-family="Arial,Helvetica,sans-serif" font-size="86" fill="${pnlColor}">${arrow}</text>
      <text x="306" y="732" font-family="Arial,Helvetica,sans-serif" font-size="174" font-weight="800" letter-spacing="-5" fill="${pnlColor}">${safe(pnlText)}</text>
      <text x="156" y="861" font-family="Arial,Helvetica,sans-serif" font-size="108" font-weight="800" letter-spacing="-4" fill="${pnlColor}">PNL</text>
      <text x="156" y="948" font-family="Arial,Helvetica,sans-serif" font-size="24" letter-spacing="4.2" fill="#84919f">UNREALIZED PNL</text>
      <line x1="156" y1="1027" x2="924" y2="1027" stroke="#242829" stroke-width="2"/>
      <line x1="340" y1="1027" x2="340" y2="1205" stroke="#242829" stroke-width="2"/>
      <line x1="524" y1="1027" x2="524" y2="1205" stroke="#242829" stroke-width="2"/>
      <line x1="708" y1="1027" x2="708" y2="1205" stroke="#242829" stroke-width="2"/>
      <line x1="892" y1="1027" x2="892" y2="1205" stroke="#242829" stroke-width="2"/>
      <line x1="156" y1="1205" x2="924" y2="1205" stroke="#242829" stroke-width="2"/>
      ${cells}
    </svg>`;
  };

  const svgToPngFile = async (svg, filename) => {
    // Rasterize the artwork into a real PNG. The SVG exists only as an
    // intermediate renderer and is never exposed as the downloadable file.
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('PNL image renderer failed.'));
    });
    img.src = encoded;
    await loaded;
    if (img.decode) {
      try { await img.decode(); } catch {}
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1277;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');
    ctx.fillStyle = '#050708';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, 1080, 1277);
    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Browser could not create the PNG.')), 'image/png');
    });
    return new File([pngBlob], filename, { type: 'image/png' });
  };

  const blobToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the PnL image.'));
    reader.readAsDataURL(file);
  });

  const nativePnlPath = file => `pnl/${String(file.name || 'kitsetups-pnl.png').replace(/[^a-z0-9._-]/gi, '')}`;

  const triggerPnlDownload = async file => {
    if (Capacitor.isNativePlatform()) {
      const path = nativePnlPath(file);
      try {
        await Filesystem.requestPermissions();
        await Filesystem.writeFile({
          path,
          data: await blobToBase64(file),
          directory: Directory.Documents,
          recursive: true
        });
        setError('');
        return;
      } catch (e) {
        setError(e?.message || 'Could not save the PnL image on this device.');
        return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const sharePnl = async p => {
    const file = pnlShareFile;
    if (!file) {
      setError('PNL image is still preparing. Please tap Share again in a moment.');
      return;
    }
    const text = `${profileName} · ${displaySymbol(p.symbol)} · ${n(p.positionType) === 1 ? 'Long' : 'Short'} · PnL ${pnlPercent(p).toFixed(2)}%`;
    try {
      if (Capacitor.isNativePlatform()) {
        const path = nativePnlPath(file);
        await Filesystem.writeFile({
          path,
          data: await blobToBase64(file),
          directory: Directory.Cache,
          recursive: true
        });
        const uri = (await Filesystem.getUri({ path, directory: Directory.Cache })).uri;
        await Share.share({
          title: 'KitSetups Futures PnL',
          text,
          files: [uri],
          dialogTitle: 'Share KitSetups PnL'
        });
        return;
      }
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: 'KitSetups Futures PnL', text, files: [file] });
          return;
        } catch (e) {
          if (e?.name === 'AbortError') return;
        }
      }
      triggerPnlDownload(file);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Could not share the PnL image.');
    }
  };

  const downloadPnl = async p => {
    const file = pnlShareFile;
    if (file) {
      await triggerPnlDownload(file);
      return;
    }
    try {
      const svg = await buildPnlSvg(p);
      const safeName = `kitsetups-${String(p.symbol || 'position').replace(/[^a-z0-9_-]/gi, '')}-pnl`;
      const png = await svgToPngFile(svg, `${safeName}.png`);
      await triggerPnlDownload(png);
    } catch (e) {
      setError(e?.message || 'Could not create the PnL PNG.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPnlShareFile(null);
    if (!pnlSharePosition) {
      setPnlShareBusy(false);
      return undefined;
    }
    setPnlShareBusy(true);
    const safeName = `kitsetups-${String(pnlSharePosition.symbol || 'position').replace(/[^a-z0-9_-]/gi, '')}-pnl`;
    void buildPnlSvg(pnlSharePosition).then(svg => svgToPngFile(svg, `${safeName}.png`))
      .then(file => {
        if (!cancelled) setPnlShareFile(file);
      })
      .catch(error => {
        if (!cancelled) {
          setPnlShareFile(null);
          setError(error?.message || 'Could not prepare the PnL PNG.');
        }
      })
      .finally(() => {
        if (!cancelled) setPnlShareBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pnlSharePosition]);

  const estimatedMargin = n(volume) && last ? (n(volume) * last * orderContractSize) / Math.max(1, n(leverage)) : 0;
  const riskMmr = (() => {
    const type = side === 'buy' ? 1 : 2;
    const rows = account.risk?.[symbol] || account.risk?.[normalize(symbol)] || [];
    const row = Array.isArray(rows) ? rows.find(x => n(x.positionType) === type && n(x.maxVol) >= n(volume) * orderContractSize) || rows.find(x => n(x.positionType) === type) : null;
    return n(row?.mmr) || n(contract?.maintenanceMarginRate) || 0;
  })();
  const estimatedLiquidation = (() => {
    const entry = orderEntry;
    if (!entry || !leverage || !riskMmr) return 0;
    // Isolated-margin estimate only. MEXC supplies the authoritative liquidation
    // price after a position is actually opened; cross-margin liquidation depends
    // on account-level margin and therefore must not be fabricated here.
    return marginMode === 'isolated'
      ? (side === 'buy' ? entry * (1 - (1 / leverage) + riskMmr) : entry * (1 + (1 / leverage) - riskMmr))
      : 0;
  })();
  
  const filteredPairs = pairs.filter(p => normalize(p.symbol).includes(normalize(pairQuery || symbol).replace('_USDT', ''))).slice(0, 80);

  return <div className="mexc-terminal">
    <div className="mexc-section-nav" role="navigation" aria-label="Market">
      <button className="active">Futures</button>
    </div>
    <header className="mexc-topbar">
      <div className="mexc-brand"><img className="mexc-logo-image" src="https://i.postimg.cc/B6bHVQnT/Kitsetsup-Logo-PNG.png" alt="KitSetups" /><div><strong>KitSetups</strong><small>Futures · USDT-M</small></div></div>
      <div className="mexc-pair-picker"><button className="mexc-pair-button" onClick={() => setPairOpen(v => !v)}><b>{displaySymbol(symbol)}</b><span>⌄</span></button>{pairOpen && <div className="mexc-pair-menu"><input autoFocus value={pairQuery} onChange={e => setPairQuery(e.target.value)} placeholder="Search futures pairs" />{filteredPairs.map(p => <button key={p.symbol} onClick={() => choosePair(p.symbol)}><b>{displaySymbol(p.symbol)}</b><span>max {n(p.maxLeverage || p.maxLeverageNum || p.leverageMax || 100)}x</span></button>)}{!filteredPairs.length && <div className="mexc-empty">No futures pair found</div>}</div>}</div>
      <div className="mexc-ticker"><b>{fmt(last)}</b><span className={n(ticker?.riseFallRate) >= 0 ? 'up' : 'down'}>{ticker?.riseFallRate != null ? `${(n(ticker.riseFallRate) * 100).toFixed(2)}%` : '—'}</span></div>
      <div className="mexc-market-tools"><button type="button" title="Chart" onClick={() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>◫</button><button type="button" title="Market details" onClick={() => setMarketInfoOpen(true)}>•••</button></div>
      <div className="mexc-connection"><span className={ticker ? 'dot live' : 'dot'} /> {connected ? `Account connected · ${profileName}` : 'Market live'} <button onClick={() => connected ? disconnect() : setCredentialsOpen(true)}>{connected ? 'Disconnect' : 'Connect Exchange'}</button></div>
    </header>
    <section className="mexc-stats"><Stat label="24H High" value={fmt(ticker?.high24Price)} /><Stat label="24H Low" value={fmt(ticker?.lower24Price)} /><Stat label="24H Volume" value={fmt(ticker?.volume)} /><Stat label="24H Turnover" value={fmt(ticker?.amount)} /><Stat label="Mark / Fair" value={fmt(ticker?.fairPrice)} /><Stat label="Index" value={fmt(ticker?.indexPrice)} /><Stat label="Funding" value={pct(ticker?.fundingRate)} /><Stat label="Next Funding" value={ticker?.nextSettleTime ? new Date(n(ticker.nextSettleTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} /></section>
    <main className="mexc-main">
      <section className="mexc-chart-panel" ref={chartRef}><div className="mexc-toolbar"><div className="mexc-timeframes">{['1m','5m','15m','30m','1h','4h','1d'].map(tf => <button key={tf} className={interval === tf ? 'active' : ''} onClick={() => setIntervalValue(tf)}>{tf}</button>)}</div><span>{loading ? 'Loading…' : '● Live'}</span></div><CandleChart data={candleData} /></section>
      <section className="mexc-book-panel"><div className="panel-title"><b>Order Book</b><span>USDT</span></div><div className="book-head"><span>Price</span><span>Size</span><span>Value</span></div>{arr(book?.asks).slice(0, 12).reverse().map((row, i) => <BookRow key={`a${i}`} row={row} ask />)}<div className="book-last">{fmt(last)} <small>Fair {fmt(ticker?.fairPrice)}</small></div>{arr(book?.bids).slice(0, 12).map((row, i) => <BookRow key={`b${i}`} row={row} />)}</section>
      <section className="mexc-order-panel"><div className="panel-title"><b>Place Order</b><span>{displaySymbol(symbol)} · Perpetual</span></div><div className="order-mode"><button className={!reduceOnly ? 'active' : ''} onClick={() => setReduceOnly(false)}>Open</button><button className={reduceOnly ? 'active close-mode' : ''} onClick={() => setReduceOnly(true)}>Close</button></div><div className="order-sides"><button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>{reduceOnly ? 'Close Long' : 'Open Long'}</button><button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>{reduceOnly ? 'Close Short' : 'Open Short'}</button></div><div className="trade-setting-grid"><div className="field-row"><label>Margin</label><select value={marginMode} onChange={e => setMarginMode(e.target.value)}><option value="cross">Cross</option><option value="isolated">Isolated</option></select></div><div className="field-row"><label>Available</label><div className="field-readonly">{fmt(usdt.availableBalance, 4)} USDT</div></div></div><div className="field"><label>Leverage <b>{leverage}x · {leveragePercent.toFixed(0)}% of max</b></label><input type="range" min="1" max={maxLeverage} value={leverage} onChange={e => setLeverage(Number(e.target.value))}/><div className="leverage-track"><span style={{ width: `${leveragePercent}%` }} /></div><div className="range-labels"><span>1x</span><span>{leverage}x</span><span>{maxLeverage}x</span></div></div><div className="field-row"><label>Order Type</label><select value={orderType} onChange={e => setOrderType(e.target.value)}><option value="market">Market</option><option value="limit">Limit</option></select></div>{orderType === 'limit' && <Field label="Price" value={limitPrice} onChange={setLimitPrice} placeholder={fmt(last)} />}<Field label="Size (contracts)" value={volume} onChange={setVolume} placeholder="Enter contract quantity" /><div className="quick-size">{[25,50,75,100].map(v => <button key={v} type="button" onClick={() => setVolume(String(Math.max(1, Math.floor(n(usdt.availableBalance) * v / 100 * n(leverage) / Math.max(last * orderContractSize, 1)))))}>{v}%</button>)}</div><div className="estimate"><span>Est. initial margin</span><b>{estimatedMargin ? `${fmt(estimatedMargin, 4)} USDT` : '—'}</b></div><div className="risk-entry-block"><div className="risk-entry-head"><div><b>Position Protection</b><small>Set your exit before you enter.</small></div><span>RISK</span></div><Field label="Take Profit" value={takeProfit} onChange={setTakeProfit} placeholder="Target price" />{takeProfit && <div className={`pnl-preview ${projectedTpPnl >= 0 ? 'positive' : 'negative'}`}>TP result: {projectedTpPnl >= 0 ? '+' : ''}{fmt(projectedTpPnl, 4)} USDT</div>}<Field label="Stop Loss" value={stopLoss} onChange={setStopLoss} placeholder="Required for protected entries" />{stopLoss && <div className={`pnl-preview ${projectedSlPnl >= 0 ? 'positive' : 'negative'}`}>SL result: {projectedSlPnl >= 0 ? '+' : ''}{fmt(projectedSlPnl, 4)} USDT</div>}{estimatedLiquidation ? <div className="liq-preview"><span>Est. liquidation</span><b>{fmt(estimatedLiquidation)}</b><small>Isolated estimate · exchange-calculated price appears after fill</small></div> : <div className="liq-preview"><span>Liquidation price</span><b>{marginMode === 'cross' ? 'Dynamic' : '—'}</b><small>{marginMode === 'cross' ? 'Cross-margin liquidation depends on account-level margin.' : 'Enter size and price to estimate liquidation.'}</small></div>}<label className="check risk-check"><input type="checkbox" checked={allowUnprotected} onChange={e => setAllowUnprotected(e.target.checked)} /> Open without Stop Loss</label></div><label className="check"><input type="checkbox" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} /> Reduce-only</label><button type="button" className={side === 'buy' ? 'submit buy-submit' : 'submit sell-submit'} onClick={placeOrder} disabled={busy}>{busy ? 'Processing…' : connected ? `${reduceOnly ? (side === 'buy' ? 'Close Long' : 'Close Short') : (side === 'buy' ? 'Open Long' : 'Open Short')} ${displaySymbol(symbol)}` : 'Connect to Trade'}</button><div className="available"><span>Available <b>{fmt(usdt.availableBalance, 4)} USDT</b></span><span>Est. margin <b>{estimatedMargin ? `${fmt(estimatedMargin, 4)} USDT` : '—'}</b></span></div></section>
    </main>
    <section className="mexc-account-bar"><Metric label="Wallet Balance" value={`${fmt(usdt.cashBalance ?? usdt.equity)} USDT`} /><Metric label="Available" value={`${fmt(usdt.availableBalance)} USDT`} /><Metric label="Position Margin" value={`${fmt(usdt.positionMargin)} USDT`} /><Metric label="Unrealized PnL" value={`${fmt(usdt.unrealized)}`} /><Metric label="Equity" value={`${fmt(usdt.equity)} USDT`} /></section>
    <section className="mexc-bottom">
      <div className="ks-position-bar">
        <div className="ks-position-switch">
          <button className={tab === 'positions' ? 'active' : ''} type="button" onClick={() => setTab('positions')}>Positions <span>{positions.length}</span></button>
          <button className={tab === 'orders' ? 'active' : ''} type="button" onClick={() => setTab('orders')}>Orders <span>{openOrders.length}</span></button>
        </div>
        {tab === 'positions' && <button type="button" className="ks-close-all" onClick={closeAllPositions} disabled={busy || !positions.length}>Close all</button>}
      </div>

      {tab === 'positions' && <div className="ks-positions-view">
        <div className="ks-position-list">
          <Positions rows={positions} stopOrders={stopOrders} contractSize={orderContractSize} mark={n(ticker?.fairPrice || ticker?.lastPrice) || last} onClose={closePosition} onShare={p => setPnlSharePosition(p)} onManageRisk={openRiskManager} onReverse={reversePosition} onChart={() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} onRefresh={loadAccount} />
        </div>
      </div>}

      {tab === 'orders' && <div className="mexc-table-wrap"><Orders rows={openOrders} onCancel={cancel} /></div>}
      {tab === 'history' && <div className="mexc-table-wrap"><Orders rows={account.history} history /></div>}
      {tab === 'positionHistory' && <div className="mexc-table-wrap"><PositionHistory rows={account.positionHistory} onShare={p => setPnlSharePosition(p)} onDownload={p => downloadPnl(p)} /></div>}
      {tab === 'funding' && <div className="mexc-table-wrap"><Funding rows={account.funding} /></div>}
      {tab === 'risk' && <div className="mexc-table-wrap"><Risk risk={account.risk} fee={account.fee} positionMode={account.positionMode} contract={contract} /></div>}
    </section>
    {error && <div className="mexc-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {marketInfoOpen && <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setMarketInfoOpen(false)}>
      <div className="mexc-dialog" role="dialog" aria-label="Market details">
        <div className="dialog-head"><div><h3>{displaySymbol(symbol)} · Market details</h3><p>Live values from the MEXC Futures market feed.</p></div><button type="button" onClick={() => setMarketInfoOpen(false)}>×</button></div>
        <div className="risk-dialog-stats"><Metric label="Last price" value={fmt(last)} /><Metric label="Fair / Mark" value={fmt(ticker?.fairPrice)} /><Metric label="Index" value={fmt(ticker?.indexPrice)} /><Metric label="24H High" value={fmt(ticker?.high24Price)} /><Metric label="24H Low" value={fmt(ticker?.lower24Price)} /><Metric label="Funding" value={pct(ticker?.fundingRate)} /></div>
        <button type="button" className="submit connect-submit" onClick={() => setMarketInfoOpen(false)}>Done</button>
      </div>
    </div>}
    {pnlSharePosition && (() => {
      const roi = pnlPercent(pnlSharePosition);
      const positive = roi >= 0;
      const protection = protectionFor(pnlSharePosition);
      const entry = n(pnlSharePosition.holdAvgPrice || pnlSharePosition.openAvgPrice);
      const mark = displayMarkFor(pnlSharePosition);
      const lev = n(pnlSharePosition.leverage || pnlSharePosition.leverageRatio) || 1;
      return <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setPnlSharePosition(null)}>
        <div className="pnl-share-dialog" role="dialog" aria-label="KitSetups Futures PNL card">
          <div className={`pnl-share-card ${positive ? 'profit' : 'loss'}`}>
            <div className="pnl-card-inner" aria-hidden="true" />
            <div className="pnl-card-brand"><img className="pnl-card-logo" src={KITSETUPS_LOGO_URL} alt="" /><div><small>KITSETUPS FUTURES</small><b>{profileName}</b></div></div>
            {profileAvatar ? <img className="pnl-card-avatar" src={profileAvatar} alt="" /> : <div className="pnl-card-avatar fallback">{profileName.slice(0,1).toUpperCase()}</div>}
            <h3>{displaySymbol(pnlSharePosition.symbol)} · {n(pnlSharePosition.positionType) === 1 ? 'Long' : 'Short'}</h3>
            <span className="pnl-arrow" aria-hidden="true">{positive ? '↗' : '↘'}</span>
            <strong>{positive ? '+' : ''}{roi.toFixed(2)}%</strong>
            <span>UNREALIZED PNL</span>
            <div className="pnl-meta">
              <p><small>ENTRY</small><b>{fmt(entry)}</b></p>
              <p><small>MARK</small><b>{fmt(mark)}</b></p>
              <p><small>LEVERAGE</small><b>{fmt(lev,0)}x</b></p>
              <p><small>SL</small><b>{protection.sl !== '' ? fmt(protection.sl) : '—'}</b></p>
              <p><small>TP</small><b>{protection.tp !== '' ? fmt(protection.tp) : '—'}</b></p>
            </div>
          </div>
          <div className="pnl-share-actions">
            <button type="button" onClick={() => void sharePnl(pnlSharePosition)}>{pnlShareBusy ? 'Preparing…' : 'Share'}</button>
            <button type="button" onClick={() => void downloadPnl(pnlSharePosition)}>Download</button>
            <button type="button" className="ghost" onClick={() => setPnlSharePosition(null)}>Close</button>
          </div>
        </div>
      </div>;
    })()}
    {riskPosition && <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setRiskPosition(null)}><form className="mexc-dialog risk-dialog" onSubmit={saveRisk}><div className="dialog-head"><div><h3>Manage Position Risk</h3><p>{displaySymbol(riskPosition.symbol)} · {n(riskPosition.positionType) === 1 ? 'Long' : 'Short'} · Entry {fmt(riskPosition.holdAvgPrice)}</p></div><button type="button" onClick={() => setRiskPosition(null)}>×</button></div><div className="risk-live-warning"><b>Protective exits are live.</b><span>These orders close the existing position when their trigger is reached. Adjust them any time while the position remains open.</span></div><Field label="Stop Loss" value={riskSl} onChange={setRiskSl} placeholder={n(riskPosition.positionType) === 1 ? 'Below entry' : 'Above entry'} /><Field label="Take Profit" value={riskTp} onChange={setRiskTp} placeholder={n(riskPosition.positionType) === 1 ? 'Above entry' : 'Below entry'} /><div className="risk-dialog-stats"><Metric label="Current Mark" value={fmt(last)} /><Metric label="Liquidation" value={fmt(riskPosition.liquidatePrice)} /><Metric label="Size" value={fmt(riskPosition.holdVol)} /><Metric label="Leverage" value={`${fmt(riskPosition.leverage, 0)}x`} /></div><div className="risk-dialog-actions"><button type="button" className="danger-outline" onClick={removeRisk} disabled={busy}>Remove protection</button><button className="submit connect-submit" disabled={busy}>{busy ? 'Updating…' : 'Save protection'}</button></div></form></div>}
    {credentialsOpen && <div className="mexc-modal" onMouseDown={e => e.target === e.currentTarget && setCredentialsOpen(false)}><form className="mexc-dialog" onSubmit={connect}><div className="dialog-head"><div><h3>Connect Futures Account</h3><p>Use your exchange API key with Futures permissions. Credentials stay in this browser session and are sent only to the KitSetups API route.</p></div><button type="button" onClick={() => setCredentialsOpen(false)}>×</button></div><Field label="Access Key" value={key} onChange={setKey} placeholder="Access Key" /><div className="field"><label>Secret Key</label><input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Secret Key" autoComplete="off" /></div><button className="submit connect-submit" disabled={busy}>{busy ? 'Connecting…' : 'Connect Futures'}</button></form></div>}
  </div>;
}

function Field({ label, value, onChange, placeholder }) { return <div className="field"><label>{label}</label><input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" /></div>; }
function Stat({ label, value }) { return <div className="mexc-stat"><small>{label}</small><b>{value}</b></div>; }
function Metric({ label, value }) { return <div className="mexc-metric"><small>{label}</small><b>{value}</b></div>; }
function BookRow({ row, ask }) { const price = n(row?.[0] ?? row?.price), size = n(row?.[1] ?? row?.size); return <div className="book-row"><span className={ask ? 'ask' : 'bid'}>{fmt(price)}</span><span>{fmt(size)}</span><span>{fmt(size * price, 2)}</span></div>; }
function CandleChart({ data }) { const w = 1000, h = 460, pad = 30, max = Math.max(...data.map(x => x.high), 0), min = Math.min(...data.map(x => x.low), max || 1), range = max - min || 1, visible = data.slice(-120); return <div className="candle-wrap"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="candle-chart"><rect width="100%" height="100%" fill="#080c12"/>{[1,2,3,4].map(i => <line key={i} x1="0" x2={w} y1={(h / 5) * i} y2={(h / 5) * i} stroke="#18212d" />)}{visible.map((c, i) => { const x = pad + i * ((w - pad * 2) / Math.max(1, visible.length - 1)); const y = v => pad + ((max - v) / range) * (h - pad * 2); const up = c.close >= c.open; return <g key={c.time || i}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={up ? '#18e0d0' : '#ff3f5f'} /><rect x={x - 2} y={Math.min(y(c.open), y(c.close))} width="4" height={Math.max(2, Math.abs(y(c.open) - y(c.close)))} fill={up ? '#18e0d0' : '#ff3f5f'} /></g>; })}</svg>{!visible.length && <div className="chart-empty">Loading candles…</div>}</div>; }
function Empty({ text }) { return <div className="table-empty">{text}</div>; }
function Positions({ rows, stopOrders, contractSize, mark, onClose, onShare, onManageRisk, onReverse, onChart, onRefresh }) {
  if (!rows.length) return <Empty text="No open positions for this contract." />;
  return <div className="ks-position-cards">{rows.map(p => {
    const related = stopOrders.filter(o => String(o.positionId) === String(p.positionId));
    const tp = related.find(o => n(o.takeProfitPrice) > 0)?.takeProfitPrice;
    const sl = related.find(o => n(o.stopLossPrice) > 0)?.stopLossPrice;
    const entry = n(p.holdAvgPrice || p.openAvgPrice);
    const fair = n(p.fairPrice || p.markPrice || p.markPricePrice) || mark;
    const lev = n(p.leverage || p.leverageRatio) || 1;
    const suppliedPnl = p?.unRealizedPnl ?? p?.unrealizedPnl ?? p?.unrealisedPnl;
    const pnl = suppliedPnl !== undefined && Number.isFinite(Number(suppliedPnl))
      ? Number(suppliedPnl)
      : unrealizedPnlValue(p, fair, contractSize);
    const initialMargin = n(p.im) || (entry && n(p.holdVol) ? (entry * n(p.holdVol) * n(contractSize || 1)) / lev : 0);
    const roi = initialMargin ? (pnl / initialMargin) * 100 : 0;
    const marginRatio = p.marginRatio != null ? pct(p.marginRatio) : '—';
    const liq = n(p.liquidatePrice ?? p.liquidationPrice ?? p.liqPrice);
    const positive = pnl >= 0;
    const isolated = String(p.marginMode || '').toLowerCase() === 'isolated' || n(p.openType) === 1;
    return <article className="ks-position-card" key={p.positionId}>
      <div className="ks-position-head">
        <div className="ks-position-contract">
          <span className={n(p.positionType) === 1 ? 'ks-side long' : 'ks-side short'}>{n(p.positionType) === 1 ? 'L' : 'S'}</span>
          <div><strong>{displaySymbol(p.symbol)}</strong><small>{isolated ? 'Isolated' : 'Cross'} · {fmt(lev, 0)}×</small></div>
        </div>
        <div className="ks-position-tools">
          <button type="button" aria-label="Open chart" title="Chart" onClick={onChart}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18V9M11 18V5M17 18v-7M3 18h18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
          <button type="button" className="ks-pnl-roller" aria-label="Open PnL card" title="PnL card · Share / Download" onClick={() => onShare(p)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="11" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M15 7h3.5M18.5 7v8M18.5 15H14M14 15v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button type="button" aria-label="Refresh position" title="Refresh" onClick={() => void onRefresh?.()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8V4m0 4h-4M19 4a8 8 0 1 0 1 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      <div className="ks-position-pnl">
        <div><span>UNREALIZED PNL</span><small>{positive ? 'In profit' : 'In loss'}</small></div>
        <strong className={positive ? 'profit' : 'loss'}>{positive ? '+' : ''}{roi.toFixed(2)}%</strong>
      </div>

      <div className="ks-position-values">
        <div><small>Entry</small><b>{fmt(entry)}</b></div>
        <div><small>Mark</small><b>{fmt(fair)}</b></div>
        <div><small>Size</small><b>{fmt(p.holdVol * (contractSize || 1) * fair, 4)}</b></div>
        <div><small>Margin</small><b>{fmt(p.im, 4)}</b></div>
        <div><small>Liquidation</small><b>{fmt(liq)}</b></div>
        <div><small>Margin ratio</small><b>{marginRatio}</b></div>
      </div>

      <div className="ks-position-protection">
        <span>Protection</span>
        <div><b className={sl ? 'set' : ''}>SL {sl ? fmt(sl) : '—'}</b><b className={tp ? 'set' : ''}>TP {tp ? fmt(tp) : '—'}</b></div>
      </div>

      <div className="ks-position-actions">
        <button type="button" onClick={() => onManageRisk(p)}>TP / SL</button>
        <button type="button" onClick={() => onReverse(p)} disabled={!onReverse}>Reverse</button>
        <button type="button" onClick={() => onClose(p)}>Close</button>
        <button type="button" className="flash" onClick={() => onClose(p)}>Flash close</button>
      </div>
    </article>;
  })}</div>;
}
function lastForPosition(p) { return n(p.markPrice || p.markPricePrice || p.fairPrice || p.lastPrice) || '—'; }
function Orders({ rows, onCancel, history }) { if (!rows.length) return <Empty text={history ? 'No order history returned.' : 'No open orders.'} />; return <table><thead><tr><th>Order ID</th><th>Contract</th><th>Side</th><th>Type</th><th>Price</th><th>Size</th><th>Filled</th><th>Margin</th><th>Status</th>{!history && <th>Action</th>}</tr></thead><tbody>{rows.map(o => <tr key={o.orderId}><td>{String(o.orderId).slice(-12)}</td><td>{displaySymbol(o.symbol)}</td><td>{sideLabel(o.side)}</td><td>{n(o.orderType) === 1 ? 'Limit' : n(o.orderType) === 5 ? 'Market' : `Type ${o.orderType}`}</td><td>{fmt(o.price)}</td><td>{fmt(o.vol)}</td><td>{fmt(o.dealVol)}</td><td>{fmt(o.orderMargin || o.usedMargin)}</td><td>{history ? ({1:'Pending',2:'Unfilled',3:'Filled',4:'Canceled',5:'Invalid'}[n(o.state)] || '—') : 'Open'}</td>{!history && <td><button className="row-action danger" onClick={() => onCancel(o.orderId)}>Cancel</button></td>}</tr>)}</tbody></table>; }
function PositionHistory({ rows, onShare, onDownload }) { if (!rows.length) return <Empty text="No position history returned." />; return <table><thead><tr><th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Close</th><th>Realized</th><th>Fees</th><th>Created</th><th>PNL Card</th></tr></thead><tbody>{rows.map((p, i) => <tr key={p.positionId || i}><td>{displaySymbol(p.symbol)}</td><td>{n(p.positionType) === 1 ? 'Long' : 'Short'}</td><td>{fmt(p.holdVol || p.closeVol)}</td><td>{fmt(p.holdAvgPrice || p.openAvgPrice)}</td><td>{fmt(p.closeAvgPrice)}</td><td>{fmt(p.realised || p.closeProfitLoss)}</td><td>{fmt(p.totalFee || p.fee)}</td><td>{p.createTime ? new Date(n(p.createTime)).toLocaleString() : '—'}</td><td><div className="position-actions"><button className="row-action" onClick={() => onShare(p)}>Share</button><button className="row-action" onClick={() => onDownload(p)}>Download</button></div></td></tr>)}</tbody></table>; }
function Funding({ rows }) { if (!rows.length) return <Empty text="No funding records returned." />; return <table><thead><tr><th>Contract</th><th>Amount</th><th>Rate</th><th>Position ID</th><th>Time</th></tr></thead><tbody>{rows.map((f, i) => <tr key={f.id || i}><td>{displaySymbol(f.symbol)}</td><td>{fmt(f.amount || f.fundingFee)}</td><td>{pct(f.fundingRate)}</td><td>{f.positionId || '—'}</td><td>{f.createTime ? new Date(n(f.createTime)).toLocaleString() : '—'}</td></tr>)}</tbody></table>; }
function Risk({ risk, fee, positionMode, contract }) { const entries = risk ? Object.entries(risk).flatMap(([symbol, levels]) => Array.isArray(levels) ? levels.map(x => ({ symbol, ...x })) : []) : []; return <div className="risk-grid"><div className="risk-card"><small>Position mode</small><b>{n(positionMode?.positionMode) === 1 ? 'Hedge Mode' : n(positionMode?.positionMode) === 2 ? 'One-way Mode' : '—'}</b></div><div className="risk-card"><small>Contract size</small><b>{fmt(contract?.contractSize)}</b></div><div className="risk-card"><small>Volume unit</small><b>{fmt(contract?.volUnit)}</b></div><div className="risk-card"><small>Price unit</small><b>{fmt(contract?.priceUnit)}</b></div>{entries.slice(0, 12).map((r, i) => <div className="risk-card" key={i}><small>Risk L{r.level} · {n(r.positionType) === 1 ? 'Long' : 'Short'}</small><b>MMR {pct(r.mmr)} · IMR {pct(r.imr)} · Max {fmt(r.maxLeverage, 0)}x</b></div>)}<div className="risk-card"><small>Fee source</small><b>{fee ? 'Account fee data' : 'Futures API'}</b></div></div>; }
