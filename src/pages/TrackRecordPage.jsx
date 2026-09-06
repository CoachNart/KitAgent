import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import { getSignals } from '../services/storage';

export default function TrackRecordPage() {
  const [signals, setSignals] = useState([]);
  useEffect(() => setSignals(getSignals()), []);
  const stats = useMemo(() => { const tp = signals.filter((s) => s.result === 'TP').length; const sl = signals.filter((s) => s.result === 'SL').length; const total = tp + sl; return { tp, sl, total, win: total ? `${((tp / total) * 100).toFixed(1)}%` : '—' }; }, [signals]);
  return <section className="page"><div className="stats"><StatCard label="TOTAL SIGNALS" value={stats.total}/><StatCard label="TP HIT" value={stats.tp}/><StatCard label="SL HIT" value={stats.sl}/><StatCard label="WIN RATE" value={stats.win}/></div><div className="track-list">{signals.length ? signals.map((s) => <div className="track-row" key={s.id}><div><b>{s.pair}</b><span>{s.bias} · score {s.score}</span></div><span className={s.result === 'TP' ? 'badge' : 'badge bad'}>{s.result}</span><span>{s.rr ? `1 : ${s.rr}` : '—'}</span><span>{new Date(s.createdAt).toLocaleDateString()}</span></div>) : <div className="empty">No settled signals recorded yet. Signals only enter this ledger when an outcome is explicitly recorded.</div>}</div><p className="disclaimer">The ledger is derived from recorded outcomes. Historical performance does not guarantee future results.</p></section>;
}
