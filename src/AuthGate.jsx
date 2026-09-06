import { cloneElement, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { auth, db, firebaseConfigured } from './firebase.js';
import { getDeviceBindingId } from './deviceBinding.js';

async function initializeAccount(user) {
  if (!db) throw new Error('KitAgent database is not configured.');
  const ref = doc(db, 'users', user.uid);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : {};
  const deviceBindingId = await getDeviceBindingId();
  const profile = {
    email: user.email || existing.email || '',
    displayName: user.displayName || existing.displayName || '',
    photoURL: user.photoURL || existing.photoURL || '',
    walletAddress: existing.walletAddress || '',
    maxRiskPercent: existing.maxRiskPercent ?? 1.5,
    maxTradeSize: existing.maxTradeSize ?? 0,
    tradingPreferences: existing.tradingPreferences || { targetRiskReward: 2.5 },
    apiKeyMetadata: existing.apiKeyMetadata || {},
    securitySettings: { ...(existing.securitySettings || {}), deviceBindingId },
    status: existing.status || 'active',
    updatedAt: serverTimestamp()
  };
  if (!snapshot.exists()) {
    profile.trialStartedAt = serverTimestamp();
    profile.trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    profile.createdAt = serverTimestamp();
  }
  await setDoc(ref, profile, { merge: true });
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [mode, setMode] = useState('signin'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (!auth || !db) { setReady(true); return undefined; }
    let active = true;
    setPersistence(auth, browserLocalPersistence).catch(error => console.error('KitAgent auth persistence setup failed:', error));
    const unsubscribe = onAuthStateChanged(auth, async next => {
      if (!active) return;
      setUser(next);
      setReady(true);
      if (!next) return;
      try { await initializeAccount(next); if (active) setMessage(''); }
      catch (error) { console.error('KitAgent account profile sync failed:', error); if (active) setMessage('Your session is active, but profile sync is temporarily unavailable.'); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  const submit = async event => {
    event.preventDefault(); if (!auth || !db) return; setBusy(true); setMessage('');
    try { await setPersistence(auth, browserLocalPersistence); if (mode === 'signup') await createUserWithEmailAndPassword(auth, email.trim(), password); else await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (error) { const code = error?.code || ''; const friendly = {'auth/email-already-in-use':'An account already exists with this email. Sign in instead.','auth/invalid-credential':'Email or password is incorrect.','auth/invalid-email':'Enter a valid email address.','auth/weak-password':'Use a stronger password (at least 6 characters).','auth/network-request-failed':'Network error. Check your connection and try again.'}; setMessage(friendly[code] || error?.message || 'Authentication failed.'); }
    finally { setBusy(false); }
  };
  const googleSignIn = async () => {
    if (!auth || !db) return; setBusy(true); setMessage('');
    try { await setPersistence(auth, browserLocalPersistence); const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await signInWithPopup(auth, provider); }
    catch (error) { const code = error?.code || ''; const friendly = {'auth/popup-closed-by-user':'Google sign-in was cancelled.','auth/popup-blocked':'Your browser blocked the Google sign-in window.','auth/account-exists-with-different-credential':'An account already exists with another sign-in method.'}; setMessage(friendly[code] || error?.message || 'Google authentication failed.'); }
    finally { setBusy(false); }
  };
  if (!firebaseConfigured) return <AuthScreen title="KitAgent setup required" message="Firebase is not configured for this deployment. Add the VITE_FIREBASE_* environment variables in Vercel, then redeploy." />;
  if (!ready) return <AuthScreen title="Restoring secure session…" message="Checking your saved KitAgent session." />;
  if (!user) return <AuthScreen mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} message={message} onSubmit={submit} onGoogle={googleSignIn} />;
  return typeof children === 'function' ? children(user) : cloneElement(children, { user });
}

function AuthScreen({ mode='signin', setMode, email='', setEmail, password='', setPassword, busy=false, message='', onSubmit, onGoogle, title='KitAgent' }) {
  const interactive = Boolean(onSubmit);
  return <div className="auth-screen"><div className="auth-glow"/><div className="auth-card"><div className="auth-brand"><img src="/kitagent-logo.svg" alt="KitAgent"/><div><b>KitAgent</b><small>AI command center</small></div></div><div className="auth-kicker"><ShieldCheck size={14}/> SECURE ACCOUNT ACCESS</div><h1>{title}</h1>{interactive&&<p className="auth-intro">{mode==='signin'?'Sign in to continue to your command center.':'Create your account and start your 3-day free trial.'}</p>}{interactive&&<><button type="button" className="google-auth" onClick={onGoogle} disabled={busy}><span className="google-mark">G</span>{busy?'Connecting…':'Continue with Google'}</button><div className="auth-divider"><span>or continue with email</span></div><form onSubmit={onSubmit}><label className="auth-label">EMAIL<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label className="auth-label">PASSWORD<input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{message&&<div className="auth-error">{message}</div>}<button disabled={busy} className="auth-submit" type="submit">{busy?<LoaderCircle size={16}/>:mode==='signin'?<LogIn size={16}/>:<UserPlus size={16}/>} {busy?'Verifying account…':mode==='signin'?'Sign in':'Create account'}</button><button type="button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('')}} className="auth-switch">{mode==='signin'?'New to KitAgent? Create an account':'Already have an account? Sign in'}</button></form></>}{!interactive&&<div className="auth-error">{message}</div>}<div className="auth-foot">Your account is secured by Firebase Authentication. KitAgent never asks for your seed phrase or private key.</div></div></div>;
}
