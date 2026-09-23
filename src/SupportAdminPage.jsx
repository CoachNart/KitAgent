import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Headphones, LoaderCircle, RefreshCw, Send, ShieldCheck, UserRound } from 'lucide-react';
import { auth } from './firebase.js';
import './support-admin.css';

const API='/api/support';

export default function SupportAdminPage({user}){
  const [chats,setChats]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [messages,setMessages]=useState([]);
  const [draft,setDraft]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const call=async(body={},method='POST')=>{
    const current=user||auth?.currentUser;
    if(!current)throw new Error('Admin session is not ready.');
    const token=await current.getIdToken(true);
    const response=await fetch(API,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Support request failed.');
    return data;
  };

  const load=async(selectFirst=true)=>{
    try{
      const current=user||auth?.currentUser;
      if(!current)throw new Error('Admin session is not ready.');
      const token=await current.getIdToken(true);
      const response=await fetch(API+'?admin=1',{headers:{Authorization:'Bearer '+token}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Unable to load support inbox.');
      const next=data.chats||[];
      setChats(next);
      if(selectFirst){
        const current=next.find(x=>x.id===selectedId)||next[0];
        setSelectedId(current?.id||'');
      }
      setLoading(false);
    }catch(e){setError(e.message||'Unable to load support inbox.');setLoading(false)}
  };

  useEffect(()=>{load(true);const id=setInterval(()=>load(false),5000);return()=>clearInterval(id)},[]);

  const selected=chats.find(x=>x.id===selectedId)||null;

  useEffect(()=>{
    if(!selected)return setMessages([]);
    let active=true;
    (async()=>{
      try{
        const data=await call({action:'messages',chatId:selected.id});
        if(active)setMessages(data.messages||[]);
      }catch(e){if(active)setError(e.message||'Could not load messages.')}
    })();
    return()=>{active=false};
  },[selectedId]);

  const refreshMessages=async()=>{
    if(!selected)return;
    try{
      const data=await call({action:'messages',chatId:selected.id});
      setMessages(data.messages||[]);
    }catch(e){setError(e.message||'Could not refresh messages.')}
  };

  const send=async()=>{
    const text=draft.trim();
    if(!selected||!text||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await call({action:'admin-message',chatId:selected.id,message:text});
      setDraft('');
      setNotice('Reply sent.');
      await refreshMessages();
      await load(false);
    }catch(e){setError(e.message||'Reply could not be sent.')}
    finally{setBusy(false)}
  };

  const resolve=async()=>{
    if(!selected||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await call({action:'resolve',chatId:selected.id});
      setNotice('Conversation resolved.');
      await load(false);
    }catch(e){setError(e.message||'Conversation could not be resolved.')}
    finally{setBusy(false)}
  };

  return <div className="support-admin-shell">
    <header className="support-admin-topbar"><button onClick={()=>window.location.href='/admin'}><ArrowLeft size={16}/> Admin</button><div><span>SUPPORT INBOX</span><h1>Live Support</h1></div><div className="support-admin-user"><ShieldCheck size={14}/>{user?.email||'Authorized admin'}</div></header>
    <main className="support-admin-content">
      {error&&<div className="support-admin-alert error">{error}</div>}
      {notice&&<div className="support-admin-alert success"><CheckCircle2 size={14}/>{notice}</div>}
      <div className="support-admin-grid">
        <section className="support-admin-list">
          <div className="support-admin-list-head"><div><span>CONVERSATIONS</span><h2>{chats.filter(x=>x.unreadForSupport).length} unread</h2></div><button onClick={()=>load(false)} title="Refresh"><RefreshCw size={14}/></button></div>
          {loading?<div className="support-admin-empty">Loading support inbox…</div>:chats.length===0?<div className="support-admin-empty">No support conversations yet.</div>:chats.map(chat=><button key={chat.id} className={'support-admin-row '+(selectedId===chat.id?'selected':'')} onClick={()=>setSelectedId(chat.id)}><span className="support-admin-avatar">{chat.userPhoto?<img src={chat.userPhoto} alt=""/>:<UserRound size={15}/>}</span><span className="support-admin-copy"><b>{chat.userName||'KitSetups member'}</b><small>{chat.subject}</small><em>{chat.lastMessage||'No messages'}</em></span>{chat.unreadForSupport&&<i className="support-unread"/>}</button>)}
        </section>
        <section className="support-admin-thread">
          {!selected?<div className="support-admin-empty large"><Headphones size={24}/><span>Select a conversation.</span></div>:<>
            <div className="support-admin-thread-head"><div><span>{selected.category||'Support'}</span><h2>{selected.subject}</h2><p>{selected.userName} · {selected.userEmail}</p></div><div className="support-admin-thread-actions"><button onClick={refreshMessages} title="Refresh messages"><RefreshCw size={14}/></button>{selected.status!=='resolved'&&<button className="resolve" onClick={resolve}><CheckCircle2 size={14}/> Resolve</button>}</div></div>
            <div className="support-admin-messages">{messages.map(item=><div key={item.id} className={'support-admin-message '+(item.senderType==='support'?'support':'user')}><div className="support-admin-message-label">{item.senderType==='support'?'You · Support':selected.userName}</div><p>{item.text}</p></div>)}</div>
            {selected.status==='resolved'?<div className="support-admin-resolved">Resolved conversation.</div>:<div className="support-admin-compose"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Reply to the user…" rows={2}/><button onClick={send} disabled={busy||!draft.trim()}>{busy?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>}</button></div>}
          </>}
        </section>
      </div>
    </main>
  </div>;
}
