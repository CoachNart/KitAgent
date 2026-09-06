import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Copy, ExternalLink, Filter, Search, WalletCards, XCircle } from 'lucide-react';

const DEMO = [
 {id:'tx-01',type:'Swap',asset:'ETH → USDC',amount:'0.84 ETH',usd:2140,gas:'$3.82',network:'Ethereum',status:'Confirmed',hash:'0x8e4c…a91d',pnl:126.40,date:'Today, 12:41'},
 {id:'tx-02',type:'Buy',asset:'BTC',amount:'0.018 BTC',usd:1168,gas:'$1.24',network:'Base',status:'Confirmed',hash:'0x91bd…20fa',pnl:82.10,date:'Yesterday, 18:22'},
 {id:'tx-03',type:'Bridge',asset:'ETH → Base',amount:'0.50 ETH',usd:1275,gas:'$4.10',network:'Ethereum → Base',status:'Confirmed',hash:'0x0a21…71be',pnl:0,date:'Sep 4, 09:13'},
 {id:'tx-04',type:'Send',asset:'USDC',amount:'350 USDC',usd:350,gas:'$0.12',network:'Base',status:'Confirmed',hash:'0x1ca8…6c42',pnl:0,date:'Sep 3, 14:07'},
 {id:'tx-05',type:'Stake',asset:'ETH',amount:'0.40 ETH',usd:1020,gas:'$2.90',network:'Ethereum',status:'Pending',hash:'0x2d91…pending',pnl:0,date:'Sep 2, 20:15'},
 {id:'tx-06',type:'Sell',asset:'SOL',amount:'8.2 SOL',usd:1189,gas:'$0.02',network:'Solana',status:'Confirmed',hash:'0x71aa…bd09',pnl:-44.20,date:'Sep 1, 16:38'},
];

export default function HistoryPage() {
 const [query,setQuery]=useState(''); const [filter,setFilter]=useState('All');
 const rows=useMemo(()=>DEMO.filter(t=>(filter==='All'||t.type===filter)&&`${t.asset} ${t.hash} ${t.network} ${t.type}`.toLowerCase().includes(query.toLowerCase())),[query,filter]);
 const total=DEMO.reduce((s,t)=>s+t.usd,0); const gas=DEMO.reduce((s,t)=>s+parseFloat(t.gas.replace('$','')),0);
 const exportCsv=()=>{const body=['Date,Type,Asset,Amount,USD,Gas,Network,Status,Hash,P&L',...rows.map(t=>[t.date,t.type,t.asset,t.amount,t.usd,t.gas,t.network,t.status,t.hash,t.pnl].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n'); const blob=new Blob([body],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='kitagent-transactions.csv'; a.click(); URL.revokeObjectURL(a.href); };
 return <div className="content-wrap"><section className="page-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h1>Transactions</h1><p>Track completed and pending wallet actions, fees, networks and performance.</p></div><div className="heading-actions"><button className="secondary-btn" onClick={exportCsv}><ExternalLink size={15}/> Export CSV</button></div></section>
 <div className="stats-grid three"><Stat label="Transactions" value={DEMO.length} sub="Tracked actions"/><Stat label="Volume" value={`$${total.toLocaleString()}`} sub="Demo ledger volume"/><Stat label="Gas" value={`$${gas.toFixed(2)}`} sub="Recorded network fees"/></div>
 <section className="panel"><div className="toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search asset, hash, network…"/></div><div className="filter-group"><Filter size={15}/>{['All','Swap','Buy','Sell','Send','Bridge','Stake'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div></div>
 <div className="table-wrap"><table><thead><tr><th>Action</th><th>Asset / amount</th><th>Value</th><th>Network</th><th>Status</th><th>Hash</th><th>P&L</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td><div className="type-cell"><TypeIcon type={t.type}/><span><strong>{t.type}</strong><small>{t.date}</small></span></div></td><td><strong>{t.asset}</strong><small>{t.amount}</small></td><td>${t.usd.toLocaleString()}<small>Gas {t.gas}</small></td><td>{t.network}</td><td><span className={`status ${t.status.toLowerCase()}`}>{t.status==='Confirmed'?<CheckCircle2 size={13}/>:<XCircle size={13}/>} {t.status}</span></td><td><button className="hash-btn" onClick={()=>navigator.clipboard?.writeText(t.hash)}><span>{t.hash}</span><Copy size={13}/></button></td><td className={t.pnl>=0?'positive':'negative'}>{t.pnl===0?'—':`${t.pnl>0?'+':''}$${t.pnl.toFixed(2)}`}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty"><WalletCards size={24}/><strong>No matching transactions</strong><span>Try another search or filter.</span></div>}</div></section></div>;
}
function Stat({label,value,sub}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function TypeIcon({type}){const I=type==='Send'?ArrowUpRight:ArrowDownLeft;return <span className="type-icon"><I size={16}/></span>}
