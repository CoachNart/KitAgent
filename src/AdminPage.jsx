import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, Gift, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { auth } from './firebase.js';
import './admin-page.css';

function toMs(v){
  if(!v)return 0;
  if(typeof v.toMillis==='function')return v.toMillis();
  if(typeof v.toDate==='function')return v.toDate().getTime();
  return new Date(v).getTime()||0;
}
function formatDate(v){
  const ms=toMs(v);
  return ms?new Date(ms).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
}
function initials(v){
  return String(v||'U').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U';
}

export default function AdminPage({user}){
  const [query,setQuery]=useState('');
  const [users,setUsers]=useState([]);
  const [selected,setSelected]=useState(null);
  const [days,setDays]=useState(30);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const call=async(options={})=>{
    const currentUser=auth?.currentUser;
    if(!currentUser)throw new Error('Please sign in to continue.');
    const url='/api/admin/grant-premium'+(options.query?('?q='+encodeURIComponent(options.query)):'');
    const request=async(token)=>fetch(url,{
      method:options.method||'GET',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:options.body?JSON.stringify(options.body):undefined
    });

    // Firebase rotates ID tokens automatically. Force a refresh here so the
    // admin page does not surface a stale-token "session expired" message.
    let token=await currentUser.getIdToken(true);
    let response=await request(token);

    // If the backend rejects the token anyway, refresh once and retry before
    // showing an actual authentication error.
    if(response.status===401){
      token=await currentUser.getIdToken(true);
      response=await request(token);
    }

    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Admin request failed.');
    return data;
  };

  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    const timer=setTimeout(async()=>{
      try{
        const data=await call({query:query.trim()});
        if(active)setUsers(data.users||[]);
      }catch(e){if(active)setError(e.message||'Unable to load users.')}
      finally{if(active)setLoading(false)}
    },220);
    return()=>{active=false;clearTimeout(timer)};
  },[query]);

  const visible=useMemo(()=>users.slice(0,20),[users]);

  const grant=async()=>{
    if(!selected||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const data=await call({method:'POST',body:{uid:selected.uid,days}});
      setNotice(`Premium gifted to ${data.displayName||data.email} for ${days} days.`);
      const refreshed=await call({query:selected.email||selected.uid});
      const next=(refreshed.users||[]).find(x=>x.uid===selected.uid)||selected;
      setSelected(next);
      setUsers(refreshed.users||[]);
    }catch(e){setError(e.message||'Premium gift failed.')}
    finally{setBusy(false)}
  };

  return <div className="admin-shell">
    <header className="admin-topbar">
      <button className="admin-back" onClick={()=>window.location.href='/'}><ArrowLeft size={16}/> KitSetups</button>
      <div className="admin-title"><span>ADMIN</span><h1>Team Premium</h1></div>
      <div className="admin-user"><ShieldCheck size={15}/><span>{user?.email||'Authorized admin'}</span></div>
    </header>

    <main className="admin-content">
      <section className="admin-hero">
        <div className="admin-kicker"><Gift size={14}/> INTERNAL ACCESS</div>
        <h2>Gift Premium to your team.</h2>
        <p>Grant Premium directly to an existing KitSetups account without exposing subscription controls to regular users.</p>
      </section>

      {error&&<div className="admin-alert error"><XCircle size={16}/><span>{error}</span></div>}
      {notice&&<div className="admin-alert success"><CheckCircle2 size={16}/><span>{notice}</span></div>}

      <button type="button" className="admin-support-link" onClick={()=>window.location.href='/admin/support'}>Support inbox <span>Open live conversations →</span></button>

      <section className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-head"><div><span>REGISTERED USERS</span><h3>Choose recipient</h3></div><UserRound size={18}/></div>
          <label className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, username or email"/></label>
          <div className="admin-user-list">
            {loading?<div className="admin-empty">Loading registered users…</div>:visible.length===0?<div className="admin-empty">No registered users found.</div>:visible.map(item=><button key={item.uid} className={'admin-user-row '+(selected?.uid===item.uid?'selected':'')} onClick={()=>{setSelected(item);setError('');setNotice('')}}>
              <span className="admin-avatar">{item.photoURL?<img src={item.photoURL} alt=""/>:initials(item.displayName||item.email)}</span>
              <span className="admin-user-copy"><b>{item.displayName||'Unnamed user'}</b><small>{item.email||item.username||item.uid}</small></span>
              <span className={'admin-plan '+(item.plan==='premium'?'premium':'')}>{item.plan==='premium'?'PREMIUM':'FREE'}</span>
            </button>)}
          </div>
        </div>

        <div className="admin-card admin-gift-card">
          <div className="admin-card-head"><div><span>PREMIUM GIFT</span><h3>{selected?'Grant access':'Select a user'}</h3></div><Gift size={18}/></div>
          {!selected?<div className="admin-empty large">Select a registered user to configure their Premium access.</div>:<>
            <div className="admin-recipient"><span className="admin-avatar">{selected.photoURL?<img src={selected.photoURL} alt=""/>:initials(selected.displayName||selected.email)}</span><div><b>{selected.displayName||'Unnamed user'}</b><small>{selected.email}</small></div></div>
            <div className="admin-duration-label">DURATION</div>
            <div className="admin-duration-grid">{[7,30,90].map(value=><button key={value} className={days===value?'active':''} onClick={()=>setDays(value)}><strong>{value}</strong><span>days</span></button>)}</div>
            <div className="admin-current"><Clock3 size={14}/><span>Current Premium expiry</span><b>{formatDate(selected.subscriptionEndsAt)}</b></div>
            <button className="admin-grant" disabled={busy} onClick={grant}><Gift size={16}/>{busy?'Granting Premium…':`Grant ${days} days Premium`}</button>
            <small className="admin-note">If the user already has active Premium, the gifted days are added to the existing expiry.</small>
          </>}
        </div>
      </section>
    </main>
  </div>;
}
