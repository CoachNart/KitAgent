import {useEffect,useMemo,useState} from 'react';
import './signal-history.css';
import './history-mobile-fix.css';
import {Activity,BarChart3,ChevronRight,Clock3,RefreshCw,Search,Target,Trash2,TrendingDown,TrendingUp} from 'lucide-react';
import {auth} from './firebase.js';

function num(v){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString(undefined,{maximumFractionDigits:Number(v)>=1000?2:Number(v)>=1?5:8});}
function when(v){if(!v)return '—';const d=v?.toDate?v.toDate():new Date(v);if(Number.isNaN(d.getTime()))return '—';return d.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function statusOf(s){if(s.status==='target_hit')return {label:'TARGET HIT',tone:'win',closed:true};if(s.status==='stop_hit')return {label:'STOP HIT',tone:'loss',closed:true};if(s.status==='missed_entry')return {label:'MISSED ENTRY',tone:'missed',closed:true};return {label:'LIVE',tone:'live',closed:false};}
function isTrade(s){return ['MARKET','LIMIT'].includes(String(s.orderType||'').toUpperCase());}
function isRecorded(s){return isTrade(s)&&['open','target_hit','stop_hit','missed_entry'].includes(String(s.status||''));}
function isClosed(s){return ['target_hit','stop_hit','missed_entry'].includes(String(s.status||''));}

export default function SignalHistory({activity=[]}){
  const [signals,setSignals]=useState(()=>{try{const v=JSON.parse(localStorage.getItem('kitsetups-signal-history-cache')||'[]');return Array.isArray(v)?v:[]}catch{return[]}});
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[view,setView]=useState('signals'),[query,setQuery]=useState(''),[clearOpen,setClearOpen]=useState(false),[clearText,setClearText]=useState(''),[clearing,setClearing]=useState(false),[deleteTarget,setDeleteTarget]=useState(null),[deleting,setDeleting]=useState(false);
  const load=async(userOverride)=>{const user=userOverride||auth?.currentUser;if(!user)return;setError('');try{const token=await user.getIdToken();const r=await fetch('/api/signals',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Signal history could not be loaded.');const next=Array.isArray(body.signals)?body.signals:[];setSignals(next);try{localStorage.setItem('kitsetups-signal-history-cache',JSON.stringify(next))}catch{}}catch(e){setError(e.message||'Signal history could not be loaded.')}};
  const deleteSignal=async()=>{const user=auth?.currentUser;if(!user||!deleteTarget?.id)return;setDeleting(true);setError('');try{const token=await user.getIdToken();const r=await fetch('/api/signals',{method:'DELETE',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({signalId:deleteTarget.id})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Could not delete this setup.');setSignals(prev=>prev.filter(s=>(s.id||s.signalId)!==deleteTarget.id));setDeleteTarget(null)}catch(e){setError(e.message||'Could not delete this setup.')}finally{setDeleting(false)}};
  const clearHistory=async()=>{const user=auth?.currentUser;if(!user||clearText.trim()!=='CLEAR')return;setClearing(true);setError('');try{const token=await user.getIdToken();const r=await fetch('/api/signals',{method:'DELETE',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'CLEAR'})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Could not clear signal history.');setSignals([]);try{localStorage.removeItem('kitsetups-signal-history-cache')}catch{}setClearText('');setClearOpen(false)}catch(e){setError(e.message||'Could not clear signal history.')}finally{setClearing(false)}};
  useEffect(()=>{let unsubscribe=()=>{};if(auth?.onAuthStateChanged)unsubscribe=auth.onAuthStateChanged(user=>load(user));else load();const onSignal=()=>load();window.addEventListener('kitagent-signal-recorded',onSignal);return()=>{unsubscribe?.();window.removeEventListener('kitagent-signal-recorded',onSignal)}},[]);
  useEffect(()=>{const timer=setInterval(()=>load(),30000);return()=>clearInterval(timer)},[]);
  const tradeSignals=useMemo(()=>signals.filter(isRecorded),[signals]);
  const stats=useMemo(()=>{const verified=tradeSignals.filter(s=>['target_hit','stop_hit'].includes(s.status)&&(s.result==='win'||s.result==='loss')&&s.outcomeEvidence?.engineVersion==='v3'&&Number.isFinite(Number(s.exitPrice))&&s.closedAt);const wins=verified.filter(s=>s.result==='win').length,losses=verified.filter(s=>s.result==='loss').length,pnl=verified.map(s=>Number(s.pnlPercent)).filter(Number.isFinite),closed=tradeSignals.filter(isClosed).length;return {total:tradeSignals.length,active:tradeSignals.length-closed,closed,wins,losses,winRate:verified.length?Math.round(wins/verified.length*100):null,lossRate:verified.length?Math.round(losses/verified.length*100):null,avgPnl:pnl.length?pnl.reduce((a,b)=>a+b,0)/pnl.length:null,verified:verified.length}},[tradeSignals]);
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();return tradeSignals.filter(s=>{if(filter==='open')return !isClosed(s);if(filter==='closed')return isClosed(s);if(filter==='wins')return s.status==='target_hit';if(filter==='losses')return s.status==='stop_hit';return true}).filter(s=>!q||[s.symbol,s.signalId,s.market,s.direction,s.orderType].some(v=>String(v||'').toLowerCase().includes(q))).sort((a,b)=>new Date(b.generatedAt||b.createdAt||0)-new Date(a.generatedAt||a.createdAt||0))},[tradeSignals,filter,query]);
  const filters=[['all','All',stats.total],['open','Live',stats.active],['closed','Closed',stats.closed],['wins','TP Hit',stats.wins],['losses','Stop Hit',stats.losses]];

  return (
    <section className="signal-history">
      <div className="history-hero"><div className="history-hero-copy"><span className="history-kicker"><span className="live-dot"/> TRACK RECORD</span><h2>Signal history</h2><p>Only active/live trades and verified outcomes are preserved here. Pending limit orders stay outside the record until their entry is actually activated.</p></div><div className="history-actions"><button className="history-action danger" onClick={()=>setClearOpen(true)} disabled={!signals.length}>Clear</button><button className="history-action" onClick={()=>load()}><RefreshCw size={14}/><span>Refresh</span></button></div></div>
      <div className="history-summary"><div className="summary-primary"><span>GENERATED</span><strong>{stats.total}</strong><small>Executable signals</small></div><div><span>OPEN</span><strong>{stats.active}</strong><small>Live trades</small></div><div><span>CLOSED</span><strong>{stats.closed}</strong><small>Resolved records</small></div><div><span>WIN RATE</span><strong className="cyan">{stats.winRate==null?'—':stats.winRate+'%'}</strong><small>{stats.verified} verified</small></div><div><span>LOSS RATE</span><strong className="red">{stats.lossRate==null?'—':stats.lossRate+'%'}</strong><small>{stats.verified} verified</small></div><div><span>AVG P&amp;L</span><strong className={stats.avgPnl==null?'':stats.avgPnl>=0?'green':'red'}>{stats.avgPnl==null?'—':(stats.avgPnl>=0?'+':'')+stats.avgPnl.toFixed(2)+'%'}</strong><small>Verified trades only</small></div></div>
      <div className="history-toolbar"><div className="history-view-tabs"><button className={view==='signals'?'active':''} onClick={()=>setView('signals')}><BarChart3 size={13}/> Signals</button><button className={view==='activity'?'active':''} onClick={()=>setView('activity')}><Activity size={13}/> Activity{activity.length?' · '+activity.length:''}</button></div>{view==='signals'&&<label className="history-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol or signal ID"/></label>}</div>
      {view==='signals' ? (
        <div className="history-content"><div className="history-filter-row">{filters.map(([id,label,count])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}<b>{count}</b></button>)}</div>{error&&signals.length===0?<EmptyState error={error} retry={()=>load()}/>:visible.length===0?<EmptyState filtered={tradeSignals.length>0||query.length>0}/>:<div className="signal-list">{visible.map(signal=><SignalCard key={signal.id||signal.signalId} signal={signal} onDelete={()=>setDeleteTarget(signal)}/>)}</div>}</div>
      ) : <ActivityView activity={activity}/>} 
      {deleteTarget && (
        <div className="clear-history-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&!deleting&&setDeleteTarget(null)}>
          <div className="clear-history-modal individual-delete-modal">
            <span className="tiny-label">REMOVE SETUP</span>
            <h3>Delete this setup?</h3>
            <p>This permanently removes this history record only. Other setups and your track-record stats remain intact.</p>
            <div className="delete-setup-preview"><div><span>SYMBOL</span><b>{deleteTarget.symbol||'—'}</b></div><div><span>GENERATED</span><b>{when(deleteTarget.generatedAt)}</b></div></div>
            <div className="clear-history-actions"><button type="button" onClick={()=>setDeleteTarget(null)} disabled={deleting}>Cancel</button><button type="button" className="danger" onClick={deleteSignal} disabled={deleting}>{deleting?'Deleting…':'Delete setup'}</button></div>
          </div>
        </div>
      )}
      {clearOpen && (
        <div className="clear-history-overlay" role="dialog" aria-modal="true" onMouseDown={e=>e.target===e.currentTarget&&setClearOpen(false)}>
          <div className="clear-history-modal"><span className="tiny-label">RESET TRACK RECORD</span><h3>Clear signal history?</h3><p>This permanently removes your generated setups for this account. Your account, subscription, settings and exchange connection remain untouched.</p><label>Type <b>CLEAR</b> to confirm<input autoFocus value={clearText} onChange={e=>setClearText(e.target.value)} placeholder="CLEAR" autoComplete="off" spellCheck="false"/></label><div className="clear-history-actions"><button type="button" onClick={()=>{setClearOpen(false);setClearText('')}} disabled={clearing}>Cancel</button><button type="button" className="danger" onClick={clearHistory} disabled={clearing||clearText.trim()!=='CLEAR'}>{clearing?'Clearing…':'Clear history'}</button></div></div>
        </div>
      )}
    </section>
  );
}

function SignalCard({signal:s,onDelete}) {
  const long = s.direction === 'LONG';
  const state = statusOf(s);
  const verified = state.closed &&
    (s.status === 'target_hit' || s.status === 'stop_hit') &&
    Number.isFinite(Number(s.pnlPercent));
  const order = String(s.orderType || '').toUpperCase();

  return (
    <article className={'signal-card tone-' + state.tone}>
      <div className="signal-card-accent" />
      <div className="signal-card-header">
        <div className="signal-identity">
          <div className={'direction-mark ' + (long ? 'long' : 'short')}>
            {long ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          </div>
          <div>
            <div className="signal-symbol">{s.symbol}</div>
            <div className="signal-id">{s.signalId}</div>
          </div>
        </div>
        <div className="signal-head-right">
          <span className={'status-pill ' + state.tone}>{state.label}</span>
          <span className="signal-time"><Clock3 size={11} />{when(s.generatedAt)}</span>
        </div>
      </div>

      <div className="signal-meta-row">
        <span>{String(s.market || '').toUpperCase()}</span>
        <i />
        <span>{s.timeframe || '—'}</span>
        {s.strategy ? (
          <>
            <i />
            <span>{String(s.strategy).replace(/_/g, ' ')}</span>
          </>
        ) : null}
        <i />
        <span>{order || '—'} ORDER</span>
        {s.confidence != null ? (
          <>
            <i />
            <span>{s.confidence}% CONFIDENCE</span>
          </>
        ) : null}
      </div>

      <div className="signal-level-grid">
        <Level label={order === 'LIMIT' ? 'LIMIT ENTRY' : 'ENTRY'} value={num(order === 'LIMIT' ? s.limitEntry : s.entry)} emphasis />
        <Level label="STOP LOSS" value={num(s.stopLoss)} />
        <Level label="TP1" value={num(s.takeProfit1)} />
        <Level label="TP2" value={num(s.takeProfit2)} />
        <Level label="R:R" value={s.riskReward || '—'} />
      </div>

      <div className="signal-result-row">
        <div className="result-context">
          {state.tone === 'pending' ? (
            <>
              <Target size={13} />
              <span>Waiting for the planned limit price to trade</span>
            </>
          ) : state.tone === 'missed' ? (
            <>
              <Target size={13} />
              <span>Entry was not reached before the setup invalidated</span>
            </>
          ) : state.closed ? (
            <>
              <Target size={13} />
              <span>{s.status === 'target_hit' ? 'TP1 was reached' : 'Stop loss was reached'} · verified outcome</span>
            </>
          ) : (
            <>
              <Clock3 size={13} />
              <span>{state.tone === 'live' ? 'Entry verified · trade is live' : 'Trade is active'}</span>
            </>
          )}
        </div>

        {verified ? (
          <strong className={Number(s.pnlPercent) >= 0 ? 'pnl-positive' : 'pnl-negative'}>
            {Number(s.pnlPercent) >= 0 ? '+' : ''}{Number(s.pnlPercent).toFixed(2)}%
          </strong>
        ) : (
          <span className="result-muted">{state.closed ? 'NO P&L' : '—'}</span>
        )}
      </div>

      <div className="signal-card-footer">
        <span className="footer-source">
          {s.outcomeEvidence?.source === 'binance_1m_ohlc' ? 'MARKET VERIFIED' : 'LIVE MARKET ANALYSIS'}
        </span>
        <div className="signal-footer-actions">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('kitagent-open-market-history', { detail: s }))}>
            View setup <ChevronRight size={14} />
          </button>
          <button type="button" className="signal-delete-button" onClick={onDelete} aria-label={`Delete ${s.symbol||'setup'} from history`} title="Delete setup">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Level({label,value,emphasis}){return <div className={emphasis?'emphasis':''}><span>{label}</span><b>{value}</b></div>}
function EmptyState({error,retry,filtered}){if(error)return <div className="history-empty"><BarChart3 size={20}/><b>History could not be loaded</b><span>{error}</span><button onClick={retry}>Try again</button></div>;return <div className="history-empty"><BarChart3 size={20}/><b>{filtered?'No signals match this view':'No executable signals yet'}</b><span>{filtered?'Try another filter or search term.':'Generate a live/active setup and it will appear here automatically. Pending limit orders stay outside this page until entry is confirmed.'}</span></div>}
function ActivityView({activity}){return activity.length?<div className="activity-list">{activity.map((item,i)=><article className="activity-card" key={(item.hash||item.label||'activity')+'-'+i}><span className="activity-icon"><Activity size={14}/></span><div><b>{item.label||item.type||'Workspace action'}</b><small>{item.type||'Action'} · {item.status||'Recorded'} · {item.time||'Recent'}</small>{item.hash&&<code>{item.hash}</code>}</div></article>)}</div>:<div className="history-empty"><Activity size={20}/><b>No workspace activity yet</b><span>Approved actions and submitted transactions will appear here.</span></div>}
