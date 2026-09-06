import React, { useEffect, useState } from 'react';
import StatCard from '../components/StatCard';
import { getTransactions } from '../services/storage';

export default function HistoryPage() {
  const [rows, setRows] = useState([]);
  useEffect(() => setRows(getTransactions()), []);
  return <section className="page"><div className="stats"><StatCard label="TRANSACTIONS" value={rows.length}/><StatCard label="SUCCESS RATE" value={rows.length ? 'Tracked' : '—'}/><StatCard label="NETWORKS" value="EVM"/></div><div className="table"><div className="tr th"><span>TYPE</span><span>DETAIL</span><span>HASH</span><span>STATUS</span></div>{rows.length ? rows.map((r) => <div className="tr" key={r.id}><span>{r.type}</span><span>{r.detail}</span><span className="mono">{r.hash || 'Pending'}</span><span className={r.status === 'Failed' ? 'down' : 'ok'}>{r.status}</span></div>) : <div className="empty">No wallet actions have been recorded on this device yet. Prepared actions are not counted as completed transactions.</div>}</div></section>;
}
