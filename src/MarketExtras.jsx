import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronUp, CircleHelp, Plus, Star, X } from 'lucide-react';

const WATCH_KEY = 'kitsetups-watchlist-v2';

function readWatchlist() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    return Array.isArray(value) ? value.filter(x => x && x.symbol).slice(0, 12) : [];
  } catch { return []; }
}

function saveWatchlist(items) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(items.slice(0, 12))); } catch {}
}

export function MarketWatchlist({ symbol, market='perpetual', onSelect }) {
  const [items, setItems] = useState(readWatchlist);
  const saved = items.some(x => x.symbol === symbol && x.market === market);

  useEffect(() => { saveWatchlist(items); }, [items]);

  const toggle = () => {
    setItems(current => {
      const exists = current.some(x => x.symbol === symbol && x.market === market);
      return exists
        ? current.filter(x => !(x.symbol === symbol && x.market === market))
        : [{ symbol, market }, ...current].slice(0, 12);
    });
  };

  return (
    <section className="market-watchlist" aria-label="Market watchlist">
      <div className="watchlist-head">
        <div className="watchlist-title">
          <span className="extras-kicker"><Star size={11} /> WATCHLIST</span>
          <strong>Your markets</strong>
          <small>Saved on this device · available whenever you return</small>
        </div>
        <button type="button" className={saved ? 'watch-current saved' : 'watch-current'} onClick={toggle}>
          {saved ? <Check size={13} /> : <Plus size={13} />}
          {saved ? 'Saved' : 'Add market'}
        </button>
      </div>

      <div className="watchlist-items">
        {items.length ? items.map(item => (
          <button
            type="button"
            key={item.market + ':' + item.symbol}
            className={item.symbol === symbol && item.market === market ? 'watch-chip active' : 'watch-chip'}
            onClick={() => onSelect?.(item.symbol, item.market)}
            title={`Open ${item.symbol}`}
          >
            <span className="watch-dot" />
            <span>{item.symbol}</span>
            <em>{item.market === 'forex' ? 'FX' : item.market === 'metals' ? 'CFD' : 'PERP'}</em>
            {item.symbol === symbol && item.market === market && <span className="watch-active-mark">LIVE</span>}
          </button>
        )) : (
          <div className="watch-empty">
            <Bookmark size={14} />
            <span><b>No saved markets yet.</b> Add one and it stays here when you leave and come back.</span>
          </div>
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
      { label:'Higher-timeframe structure', value:setup.higherBias||'WAIT', detail:setup.higherTimeframe ? `${setup.higherTimeframe} directional context` : 'Top-down structure' },
      { label:'Middle structure', value:setup.middleBias||'WAIT', detail:setup.middleTimeframe ? `${setup.middleTimeframe} confirmation layer` : 'Structure confirmation' },
      { label:'Entry alignment', value:setup.entryAligned?'ALIGNED':'WATCHING', detail:setup.entryTimeframe ? `${setup.entryTimeframe} execution layer` : 'Execution conditions' },
      { label:'Liquidity target', value:setup.liquidityType||'—', detail:'Derived from the available market structure' },
      { label:'Risk / reward', value:setup.riskReward||'—', detail:setup.stopDistanceUnits!=null ? `${setup.stopDistanceUnits} ${setup.priceUnitLabel==='pips'?'pips':'points'} risk distance` : 'Calculated from entry and invalidation' },
      { label:'Engine confidence', value:setup.confidence!=null?`${setup.confidence}%`:'—', detail:direction?`${direction} setup context`:'No directional setup' }
    ];
  }, [setup]);

  if (!setup) return null;
  const reason = setup.structureConflict
    ? 'Higher-timeframe direction is not yet confirmed by lower structure, so execution is being withheld.'
    : setup.entryAligned
      ? 'Entry conditions are aligned with the broader structure. Levels come from the live market read.'
      : setup.setupReason || 'The engine is monitoring this market for a cleaner execution condition.';

  return (
    <section className={open ? 'setup-why open' : 'setup-why'}>
      <button type="button" className="setup-why-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="setup-why-icon"><CircleHelp size={15} /></span>
        <span><b>Why this setup?</b><small>Live evidence behind this market read</small></span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="setup-why-body">
          <div className="setup-why-summary">
            <span>{market || 'MARKET'} · {symbol || '—'}</span>
            <p>{reason}</p>
          </div>
          <div className="setup-evidence-grid">
            {rows.map(row => <div className="setup-evidence" key={row.label}><span>{row.label}</span><b>{row.value}</b><small>{row.detail}</small></div>)}
          </div>
          {setup.structuralInvalidation != null && <div className="setup-invalidation"><span>INVALIDATION</span><b>{setup.structuralInvalidation}</b><small>If structure reaches this level, the current thesis is no longer valid.</small></div>}
          <div className="setup-why-note"><Check size={13} /><span>Evidence is taken from the same live setup payload used for the levels above.</span></div>
        </div>
      )}
    </section>
  );
}
