import { cloneElement, useEffect, useState } from 'react';
import { browserLocalPersistence, onAuthStateChanged, setPersistence, signInWithCustomToken, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ShieldCheck, LoaderCircle, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { auth, db, firebaseConfigured } from './firebase.js';
import { getDeviceBindingId } from './deviceBinding.js';

const REFERRAL_STORAGE_KEY='kitagent_referral_code';
function captureReferral(){try{const ref=new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);if(ref)localStorage.setItem(REFERRAL_STORAGE_KEY,ref);return ref||localStorage.getItem(REFERRAL_STORAGE_KEY)||''}catch{return ''}}
function getReferral(){try{return localStorage.getItem(REFERRAL_STORAGE_KEY)||captureReferral()}catch{return captureReferral()}}
function affiliateIntent(){try{return new URLSearchParams(window.location.search).get('affiliate')==='1'}catch{return false}}
function requestedAuthMode(){try{return new URLSearchParams(window.location.search).get('auth')==='signup'?'signup':'signin'}catch{return 'signin'}}
function makeUsername(email,uid){const base=(email||'user').split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,18)||'user';const suffix=(uid||'').replace(/[^a-z0-9]/gi,'').slice(-5).toLowerCase()||Math.random().toString(36).slice(2,7);return `${base}-${suffix}`}
async function registerDevice(user){const deviceId=await getDeviceBindingId();const token=await user.getIdToken();const response=await fetch('/api/register-device',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({deviceId})});let payload={};try{payload=await response.json()}catch{}if(!response.ok)throw Object.assign(new Error(payload.error||'This device cannot be registered.'),{code:payload.code||'DEVICE_REGISTRATION_FAILED'});return deviceId}
async function registerAffiliate(user){if(!affiliateIntent())return;try{const token=await user.getIdToken();const response=await fetch('/api/affiliate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'register'})});if(!response.ok)throw new Error('Affiliate registration failed.');const payload=await response.json();try{sessionStorage.setItem('kitsetups_affiliate_registered',payload.referralCode||'1')}catch{} }catch(error){console.warn('KitSetups affiliate registration deferred:',error)}}
async function initializeAccount(user){
 if(!db)throw new Error('KitSetups database is not configured.');
 const username=makeUsername(user.email,user.uid);
 const photoURL=user.photoURL||`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(`kitsetups-${username}`)}&backgroundType=gradientLinear&radius=24&size=96`;
 try{if(user.displayName!==username||user.photoURL!==photoURL)await updateProfile(user,{displayName:user.displayName||username,photoURL})}catch(error){console.warn('KitSetups profile update deferred:',error)}
 await registerDevice(user);
 await registerAffiliate(user);
}

export default function AuthGate({children}){const [user,setUser]=useState(null),[ready,setReady]=useState(false),[mode,setMode]=useState(requestedAuthMode),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{captureReferral();if(!auth||!db){setReady(true);return undefined}let active=true;setPersistence(auth,browserLocalPersistence).catch(e=>console.error('KitSetups auth persistence setup failed:',e));const unsubscribe=onAuthStateChanged(auth,next=>{if(!active)return;if(!next){setUser(null);setReady(true);return}setUser(next);setReady(true);initializeAccount(next).catch(error=>{console.error('KitSetups account initialization deferred:',error);if(!active)return;const code=error?.code||'';const friendly={'DEVICE_ALREADY_REGISTERED':'This device is already registered to another KitSetups account.','ACCOUNT_ALREADY_BOUND':'This account is already bound to another device.','DEVICE_ID_INVALID':'This device could not be verified.','DEVICE_REGISTRATION_FAILED':'Device verification is temporarily unavailable. Your session is preserved.','FIREBASE_ADMIN_CREDENTIALS_MISSING':'Account security service is temporarily unavailable. Your session is preserved.','FIREBASE_ADMIN_CREDENTIALS_INVALID':'Account security service is temporarily unavailable. Your session is preserved.'};setMessage(friendly[code]||error?.message||'Account initialization was temporarily unavailable. Your session is preserved.')})});return()=>{active=false;unsubscribe()}},[]);
 const submit=async event=>{event.preventDefault();if(!auth||!db)return;setBusy(true);setMessage('');const cleanEmail=email.trim().toLowerCase();try{await setPersistence(auth,browserLocalPersistence);if(mode==='signup'){const deviceId=await getDeviceBindingId();const response=await fetch('/api/register-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:cleanEmail,password,deviceId,referralCode:getReferral()})});let payload={};try{payload=await response.json()}catch{}if(!response.ok)throw Object.assign(new Error(payload.error||'Account creation failed.'),{code:payload.code||'auth/registration-failed'});await signInWithCustomToken(auth,payload.customToken)}else{await signInWithEmailAndPassword(auth,cleanEmail,password)}}catch(error){const code=error?.code||'';const friendly={'ACCOUNT_ALREADY_EXISTS':'An account already exists for this email identity. Sign in instead.','NETWORK_ACCOUNT_EXISTS':'An account has already been created from this network. Sign in instead.','DEVICE_ALREADY_REGISTERED':'This device is already registered to another KitSetups account. Sign in to that account instead.','DEVICE_ID_INVALID':'This device could not be verified. Please refresh and try again.','ACCOUNT_ALREADY_BOUND':'This account is already bound to another device.','DEVICE_REGISTRATION_FAILED':'Device verification could not be completed. Please try again.','auth/email-already-in-use':'An account already exists with this email. Sign in instead.','auth/invalid-credential':'Email or password is incorrect.','auth/invalid-email':'Enter a valid email address.','auth/weak-password':'Use a stronger password (at least 6 characters).','auth/network-request-failed':'Network error. Check your connection and try again.','auth/too-many-requests':'Too many attempts. Please wait a moment and try again.','auth/registration-failed':'Account creation could not be completed. Please try again.'};setMessage(friendly[code]||error?.message||'Authentication failed.')}finally{setBusy(false)}};
 if(!firebaseConfigured)return <AuthScreen title="KitSetups setup required" message="Firebase is not configured for this deployment. Add the VITE_FIREBASE_* environment variables in Vercel, then redeploy."/>;if(!ready)return typeof children==='function'?children(null):cloneElement(children,{user:null});if(!user)return <AuthScreen mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} message={message} onSubmit={submit}/>;return typeof children==='function'?children(user):cloneElement(children,{user})}

function AuthScreen({mode='signin',setMode,email='',setEmail,password='',setPassword,busy=false,message='',onSubmit,title='KitSetups'}){
 const interactive=Boolean(onSubmit);
 const [showPassword,setShowPassword]=useState(false);
 const isSignin=mode==='signin';
 return <div className="auth-screen">
   <div className="auth-noise" aria-hidden="true"/>
   <div className="auth-orbit auth-orbit-one" aria-hidden="true"/>
   <div className="auth-orbit auth-orbit-two" aria-hidden="true"/>
   <main className="auth-layout">
     <div className="auth-brand">
       <img src="https://i.postimg.cc/B6bHVQnT/Kitsetsup-Logo-PNG.png" alt="KitSetups"/>
       <span><strong>KitSetups</strong><small>Your Crypto Command Center</small></span>
     </div>
     <div className="auth-heading">
       <h1>{isSignin?'Good To See You!':'Get started'}</h1>
       <p>{isSignin?'Sign in to continue.':'Create your KitSetups account.'}</p>
     </div>
     <div className="auth-divider"/>
     {interactive&&<form onSubmit={onSubmit} className="auth-form">
       <label className="auth-field"><span>Email</span><div className="auth-input-wrap"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/><i>@</i></div></label>
       <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><input required minLength={6} type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={isSignin?'Your password':'At least 6 characters'} autoComplete={isSignin?'current-password':'new-password'}/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'} title={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
       {message&&<div className="auth-error">{message}</div>}
       <button disabled={busy} className={`auth-submit${isSignin ? ' auth-submit-signin' : ''}`} type="submit"><span>{busy?'Please wait…':isSignin?'Sign in':'Create account'}</span>{busy?<LoaderCircle size={15}/>:<LogIn size={15}/>}</button>
       <div className="auth-switch-row"><span>{isSignin?'New here?':'Already have an account?'}</span><button type="button" onClick={()=>{setMode(isSignin?'signup':'signin');setMessage('');setShowPassword(false)}}>{isSignin?'Create account':'Sign in'}</button></div>
     </form>}
     {!interactive&&<div className="auth-error">{message}</div>}
     <div className="auth-trust"><ShieldCheck size={13}/><span>Secure authentication</span></div>
   </main>
 </div>
}
