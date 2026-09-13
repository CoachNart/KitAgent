import { useState } from 'react';
import { CheckCircle2, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-react';
import './account-deletion.css';

export default function AccountDeletionPage(){
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const submit=async event=>{
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try{
      const response=await fetch('/api/request-account-deletion',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email.trim().toLowerCase()})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Your deletion request could not be submitted.');
      setMessage(payload.message||'Your deletion request has been received.');
      setEmail('');
    }catch(error){
      setError(error?.message||'Your deletion request could not be submitted. Please try again.');
    }finally{
      setBusy(false);
    }
  };

  return <main className="deletion-page">
    <div className="deletion-glow"/>
    <section className="deletion-card" aria-labelledby="deletion-title">
      <div className="deletion-brand">
        <img src="/kitagent-logo.svg" alt="KitSetups"/>
        <div><strong>KitSetups</strong><span>Crypto command center</span></div>
      </div>
      <div className="deletion-icon"><Trash2 size={21}/></div>
      <span className="deletion-kicker"><ShieldCheck size={14}/> ACCOUNT & DATA</span>
      <h1 id="deletion-title">Request account deletion</h1>
      <p className="deletion-intro">Use this page to request deletion of your KitSetups account and associated personal data.</p>

      {message ? <div className="deletion-success"><CheckCircle2 size={18}/><div><strong>Request received</strong><span>{message}</span></div></div> : <form onSubmit={submit}>
        <label className="deletion-label" htmlFor="deletion-email">Account email</label>
        <input id="deletion-email" className="deletion-input" required type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email"/>
        <button className="deletion-submit" type="submit" disabled={busy}>{busy?<LoaderCircle size={16} className="deletion-spin"/>:<Trash2 size={16}/>} {busy?'Submitting request…':'Request deletion'}</button>
      </form>}

      {error&&<div className="deletion-error" role="alert">{error}</div>}
      <div className="deletion-details">
        <div><strong>What will be deleted</strong><span>Your KitSetups account and associated personal account data stored by KitSetups will be queued for deletion.</span></div>
        <div><strong>What may be retained</strong><span>Information that must be retained for legal, security, fraud-prevention, or financial-record requirements may be kept for the required period.</span></div>
        <div><strong>Processing</strong><span>Deletion requests are reviewed and processed by the KitSetups team. We may contact you using the account email if verification is required.</span></div>
      </div>
      <p className="deletion-foot">This page is provided for KitSetups users who want to request account and associated data deletion.</p>
    </section>
  </main>;
}
