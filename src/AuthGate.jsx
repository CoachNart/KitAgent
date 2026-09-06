import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ShieldCheck, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { auth, firebaseConfigured, initializeAccount } from './firebase.js';
import { getDeviceBindingId } from './deviceBinding.js';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!auth) { setReady(true); return undefined; }
    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) { setUser(null); setReady(true); return; }
      try {
        const deviceBindingId = await getDeviceBindingId();
        if (!initializeAccount) throw new Error('KitAgent account service is not configured.');
        await initializeAccount({ deviceBindingId });
        setUser(nextUser);
        setMessage('');
      } catch (error) {
        await signOut(auth);
        const code = error?.code || '';
        if (code.includes('permission-denied')) {
          setMessage(error.message || 'This device is already linked to another KitAgent account.');
        } else if (code.includes('unauthenticated')) {
          setMessage('Your session expired. Please sign in again.');
        } else {
          setMessage(error?.message || 'We could not verify this account. Please try again.');
        }
      } finally {
        setReady(true);
      }
    });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!auth || !initializeAccount) return;
    setBusy(true); setMessage('');
    try {
      let credential;
      if (mode === 'signup') {
        credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      const deviceBindingId = await getDeviceBindingId();
      await initializeAccount({ deviceBindingId });
      setUser(credential.user);
    } catch (error) {
      await signOut(auth).catch(() => {});
      const code = error?.code || '';
      const friendly = {
        'auth/email-already-in-use': 'An account already exists with this email. Sign in instead.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/weak-password': 'Use a stronger password (at least 6 characters).',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
      };
      setMessage(friendly[code] || error?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!firebaseConfigured) {
    return <AuthScreen title="KitAgent setup required" message="Firebase is not configured for this deployment. Add the VITE_FIREBASE_* environment variables in Vercel, then redeploy." />;
  }

  if (!ready || (auth && !user)) {
    return <AuthScreen mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} message={message} onSubmit={submit} />;
  }

  return children;
}

function AuthScreen({ mode='signin', setMode, email='', setEmail, password='', setPassword, busy=false, message='', onSubmit, title='KitAgent' }) {
  const interactive = Boolean(onSubmit);
  return <div style={{minHeight:'100vh',background:'#070b0e',color:'#edf5f5',display:'grid',placeItems:'center',padding:20,fontFamily:'Inter,ui-sans-serif,system-ui,sans-serif'}}>
    <div style={{width:'100%',maxWidth:430,border:'1px solid #1b2a30',background:'#0b1115',borderRadius:14,padding:28,boxShadow:'0 25px 80px rgba(0,0,0,.35)'}}>
      <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:28}}>
        <div style={{width:38,height:38,borderRadius:9,background:'#b7fff8',color:'#071012',display:'grid',placeItems:'center',fontWeight:800,fontSize:19}}>K</div>
        <div><b style={{fontSize:15,display:'block'}}>KitAgent</b><span style={{fontSize:9,color:'#627179'}}>Web3 trading terminal</span></div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,color:'#7be9e2',fontSize:9,fontWeight:700,letterSpacing:'.14em'}}><ShieldCheck size={14}/> SECURE ACCOUNT ACCESS</div>
      <h1 style={{fontSize:28,letterSpacing:'-.045em',margin:'12px 0 7px'}}>{title}</h1>
      {interactive && <p style={{fontSize:11,color:'#687980',lineHeight:1.6,margin:'0 0 22px'}}>{mode === 'signin' ? 'Sign in to continue to your trading terminal.' : 'Create your account and start your 3-day free trial.'}</p>}
      {interactive ? <form onSubmit={onSubmit}>
        <label style={labelStyle}>EMAIL<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle}/></label>
        <label style={labelStyle}>PASSWORD<input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" style={inputStyle}/></label>
        {message && <div style={errorStyle}>{message}</div>}
        <button disabled={busy} type="submit" style={buttonStyle}>{busy ? <LoaderCircle size={16} style={{animation:'spin 1s linear infinite'}}/> : mode==='signin' ? <LogIn size={16}/> : <UserPlus size={16}/>} {busy ? 'Verifying account…' : mode==='signin' ? 'Sign in' : 'Create account'}</button>
        <button type="button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');}} style={switchStyle}>{mode==='signin' ? 'New to KitAgent? Create an account' : 'Already have an account? Sign in'}</button>
      </form> : <div style={errorStyle}>{message}</div>}
      <div style={{marginTop:20,paddingTop:15,borderTop:'1px solid #18262c',fontSize:9,color:'#52636a',lineHeight:1.5}}>Your account is checked against a server-side device binding after authentication. Signing out does not release the device.</div>
    </div>
  </div>;
}

const labelStyle={display:'block',fontSize:8,color:'#617178',letterSpacing:'.12em',fontWeight:700,marginBottom:14};
const inputStyle={display:'block',width:'100%',height:42,marginTop:7,border:'1px solid #25343b',borderRadius:7,background:'#080e12',color:'#e7f1f2',outline:'none',padding:'0 11px',fontSize:11};
const buttonStyle={width:'100%',height:42,border:0,borderRadius:7,background:'#b6fff7',color:'#071011',fontWeight:700,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',gap:7,cursor:'pointer'};
const switchStyle={width:'100%',marginTop:12,border:0,background:'transparent',color:'#79dfd8',fontSize:9,cursor:'pointer'};
const errorStyle={border:'1px solid #4a302c',background:'#1a1110',color:'#d8a59d',borderRadius:7,padding:'10px 11px',fontSize:9,lineHeight:1.5,marginBottom:12};
