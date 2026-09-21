import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, Star, X } from 'lucide-react';

const WATCH_KEY = 'kitsetups-watchlist-v1';

function readWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(value) ? value.filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(key, items) {
  try { localStorage.setItem(key, JSON.stringify(items.slice(0, 12))); } catch {}
}

export function MarketWatchlist({ symbol, market='perpetual', onSelect }) {
  const storageKey = `${WATCH_KEY}-${market}`;
  const [items, setItems] = useState(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value.filter(Boolean).slice(0, 12) : []; } catch { return []; } });
  const saved = items.includes(symbol);

  useEffect(() => saveWatchlist(storageKey, items), [storageKey, items]);
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); setItems(Array.isArray(value) ? value.filter(Boolean).slice(0, 12) : []); } catch { setItems([]); } }, [storageKey]);

  const toggle = () => {
    setItems(current => current.includes(symbol)
      ? current.filter(x => x !== symbol)
      : [symbol, ...current].slice(0, 12));
  };

  return (
    <section className="market-watchlist" aria-label="Market watchlist">
      <div className="watchlist-head">
        <div>
          <span className="extras-kicker"><Star size={11} /> WATCHLIST</span>
          <strong>Markets you care about</strong>
        </div>
        <button type="button" className={saved ? 'watch-current saved' : 'watch-current'} onClick={toggle}>
          {saved ? <Check size={13} /> : <Plus size={13} />}
          {saved ? 'Saved' : 'Save market'}
        </button>
      </div>
      <div className="watchlist-items">
        {items.length ? items.map(item => (
          <button
            type="button"
            key={item}
            className={item === symbol ? 'watch-chip active' : 'watch-chip'}
            onClick={() => onSelect?.(item)}
          >
            <span className="watch-dot" />
            {item}
            {item === symbol && <span className="watch-active-mark">Current</span>}
          </button>
        )) : (
          <div className="watch-empty"><Bookmark size={14} /> Save a market and it will stay here across sessions.</div>
        )}
      </div>
    </section>
  );
}

export function SetupWhy({ setup, market, symbol }) {
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => {
    if (!setup) return [];
    const direction = setup.bias && setup.bias !== 'WAIT' ? setup.bias : setup.directionBias;
    return [
      {
        label: 'Higher-timeframe structure',
        value: setup.higherBias || 'WAIT',
        detail: setup.higherTimeframe ? `${setup.higherTimeframe} directional context` : 'Top-down structure'
      },
      {
        label: 'Middle structure',
        value: setup.middleBias || 'WAIT',
        detail: setup.middleTimeframe ? `${setup.middleTimeframe} confirmation layer` : 'Structure confirmation'
      },
      {
        label: 'Entry alignment',
        value: setup.entryAligned ? 'ALIGNED' : 'WATCHING',
        detail: setup.entryTimeframe ? `${setup.entryTimeframe} execution layer` : 'Execution conditions'
      },
      {
        label: 'Liquidity target',
        value: setup.liquidityType || '—',
        detail: 'Derived from the available market structure'
      },
      {
        label: 'Risk / reward',
        value: setup.riskReward || '—',
        detail: setup.stopDistanceUnits != null ? `${setup.stopDistanceUnits} ${setup.priceUnitLabel === 'pips' ? 'pips' : 'points'} risk distance` : 'Calculated from entry and invalidation'
      },
      {
        label: 'Engine confidence',
        value: setup.confidence != null ? `${setup.confidence}%` : '—',
        detail: direction ? `${direction} setup context` : 'No directional setup'
      }
    ];
  }, [setup]);

  if (!setup) return null;
  const reason = setup.structureConflict
    ? 'The higher-timeframe direction is not yet confirmed by the lower structure. The engine is deliberately withholding execution.'
    : setup.entryAligned
      ? 'The selected timeframe is aligned with the broader structure. Entry, invalidation and target levels are derived from the live market read.'
      : setup.setupReason || 'The engine is monitoring the selected market for a cleaner execution condition.';

  return (
    <section className={open ? 'setup-why open' : 'setup-why'}>
      <button type="button" className="setup-why-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="setup-why-icon"><CircleHelp size={15} /></span>
        <span><b>Why this setup?</b><small>See the live evidence behind this read</small></span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="setup-why-body">
          <div className="setup-why-summary">
            <span>{market || 'MARKET'} · {symbol || '—'}</span>
            <p>{reason}</p>
          </div>
          <div className="setup-evidence-grid">
            {rows.map(row => (
              <div className="setup-evidence" key={row.label}>
                <span>{row.label}</span>
                <b>{row.value}</b>
                <small>{row.detail}</small>
              </div>
            ))}
          </div>
          {setup.structuralInvalidation != null && (
            <div className="setup-invalidation">
              <span>INVALIDATION</span>
              <b>{setup.structuralInvalidation}</b>
              <small>If structure reaches this level, the current thesis is no longer valid.</small>
            </div>
          )}
          <div className="setup-why-note">
            <Check size={13} />
            <span>Evidence shown here is taken from the same setup payload used to build the levels above — no synthetic explanation is added.</span>
          </div>
        </div>
      )}
    </section>
  );
}
