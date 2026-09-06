import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound, Zap } from 'lucide-react';
import { auth, firebaseConfigured } from '../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

export default function AuthPage({ configured, error }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error || '');

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!firebaseConfigured || !auth) { setMessage('Firebase is not configured yet. Add the VITE_FIREBASE_* values to your deployment environment.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const map = { 'auth/invalid-credential': 'Email or password is incorrect.', 'auth/email-already-in-use': 'An account already exists for this email.', 'auth/weak-password': 'Use a stronger password (at least 6 characters).', 'auth/invalid-email': 'Enter a valid email address.', 'auth/too-many-requests': 'Too many attempts. Please wait and try again.' };
      setMessage(map[err.code] || err.message || 'Authentication failed.');
    } finally { setBusy(false); }
  };

  return <div className="auth-screen">
    <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
    <section className="auth-brand"><div className="brand-mark auth-mark"><Zap size={25} /></div><div><strong>KitAgent</strong><span>Professional Web3 Trading Terminal</span></div></section>
    <div className="auth-grid">
      <div className="auth-copy"><span className="eyebrow">SECURE WORKSPACE</span><h1>Trade with structure.<br /><em>Execute with clarity.</em></h1><p>One professional terminal for market analysis, Web3 actions, transaction tracking and your verified trading record.</p><div className="auth-features"><div><ShieldCheck size={17} /><span><strong>Wallet-first security</strong><small>Private keys stay in your wallet.</small></span></div><div><LockKeyhole size={17} /><span><strong>Account protection</strong><small>Authentication is handled by Firebase.</small></span></div></div></div>
      <div className="auth-card"><div className="auth-card-head"><div className="auth-icon"><UserRound size={20} /></div><span className="eyebrow">KITAGENT ACCOUNT</span><h2>{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h2><p>{mode === 'signin' ? 'Sign in to continue to your terminal.' : 'Start your 3-day KitAgent trial.'}</p></div>
        <div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setMessage(''); }}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage(''); }}>Create account</button></div>
        <form onSubmit={submit} className="auth-form"><label>Email<div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></div></label><label>Password<div className="auth-input"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required /><button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>{message && <div className="auth-error" role="alert">{message}</div>}<button className="primary-btn auth-submit" disabled={busy}>{busy ? <span className="button-spinner" /> : mode === 'signin' ? 'Sign in securely' : 'Create account'}</button></form>
        <div className="auth-trust"><ShieldCheck size={14} /> Your authentication session is managed securely by Firebase.</div>
      </div>
    </div>
    <footer className="auth-footer">KitAgent · Web3 trading infrastructure · {configured ? 'Firebase connected' : 'Firebase setup required'}</footer>
  </div>;
}
