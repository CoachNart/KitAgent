import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Check, CircleUserRound, Copy, KeyRound, LoaderCircle, LogOut, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase.js';

export default function AccountPage({ user, wallet, connectWallet }) {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [verification, setVerification] = useState(null);
  const [copied, setCopied] = useState(false);
  const [transactionHash, setTransactionHash] = useState('');
  const [verificationState, setVerificationState] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!db || !user?.uid) return undefined;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      snapshot => {
        setProfile(snapshot.exists() ? snapshot.data() : null);
        setProfileError('');
      },
      error => setProfileError(error?.message || 'Profile sync is temporarily unavailable.')
    );
    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!db || !user?.uid) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'paymentVerifications'),
      snapshot => {
        const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        items.sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
        setVerification(items[0] || null);
      },
      error => setVerificationState(error?.message || 'Verification status is temporarily unavailable.')
    );
    return unsubscribe;
  }, [user?.uid]);

  const data = profile || {};
  const subscription = data.subscription || {};
  const usage = data.monthlyUsage || {};
  const api = data.api || {};
  const name = data.displayName || user?.displayName || 'KitAgent member';
  const email = data.email || user?.email || 'Firebase account';
  const photo = data.photoURL || user?.photoURL || '';
  const plan = String(data.plan || 'free').toLowerCase();
  const used = Number(usage.used) || 0;
  const limit = Number(usage.limit) || 0;
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const trialEndsAt = toDate(data.trialEndsAt);
  const trialActive = trialEndsAt ? trialEndsAt.getTime() > Date.now() : false;
  const trialLabel = trialActive ? `${Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))}D LEFT` : 'TRIAL ENDED';
  const walletAddress = wallet || data.walletAddress || '';
  const paymentAddress = subscription.paymentAddress || '';
  const submitted = verification?.status === 'pending' || verificationState === 'submitted';

  const copyAddress = async () => {
    if (!paymentAddress) return;
    try {
      await navigator.clipboard?.writeText(paymentAddress);
      setCopied(true);
      setVerificationState('');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setVerificationState('Copy is unavailable in this browser.');
    }
  };

  const submitVerification = async () => {
    const hash = transactionHash.trim();
    if (!db || !user?.uid) return;
    if (hash.length < 8) {
      setVerificationState('Enter a valid transaction hash first.');
      return;
    }
    setVerifying(true);
    setVerificationState('');
    try {
      await addDoc(collection(db, 'users', user.uid, 'paymentVerifications'), {
        uid: user.uid,
        transactionHash: hash,
        asset: String(subscription.paymentAsset || ''),
        network: String(subscription.paymentNetwork || ''),
        amount: Number(subscription.price) || 0,
        currency: String(subscription.currency || 'USD'),
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setTransactionHash('');
      setVerificationState('submitted');
    } catch (error) {
      setVerificationState(error?.message || 'Verification request could not be submitted.');
    } finally {
      setVerifying(false);
    }
  };

  const logout = async () => {
    if (!auth) return;
    try { await signOut(auth); }
    catch (error) { setVerificationState(error?.message || 'Unable to sign out right now.'); }
  };

  return (
    <div className="account-page">
      <header className="account-heading">
        <div className="account-title">
          <span className="account-kicker"><CircleUserRound size={12} /> ACCOUNT</span>
          <h1>Profile</h1>
          <p>Account, plan and access</p>
        </div>
        <span className={`account-status ${data.status === 'active' ? 'is-active' : ''}`}><i /> {String(data.status || 'unknown').toUpperCase()}</span>
      </header>

      <section className="account-identity">
        <div className="account-avatar">
          {photo ? <img src={photo} alt="" /> : <span>{initials(name)}</span>}
        </div>
        <div className="account-name-block">
          <div className="account-name-row"><h2>{name}</h2><span className="account-active">ACTIVE</span></div>
          <p>{email}</p>
        </div>
      </section>

      <div className="account-section-label">CURRENT PLAN</div>
      <section className="subscription-card free-plan">
        <div className="subscription-topline">
          <div><span className="subscription-label">PLAN</span><div className="plan-name-row"><h2>{plan || 'free'}</h2><span>{plan === 'free' ? 'CURRENT' : 'AVAILABLE'}</span></div></div>
          <div className="remaining-block"><span className="subscription-label">STATUS</span><strong>{trialActive || data.trialEndsAt ? trialLabel : String(data.status || 'ACTIVE').toUpperCase()}</strong></div>
        </div>
        <div className="free-meta"><span>Monthly usage</span><b>{limit > 0 ? `${used} / ${limit}` : 'NOT SET'}</b></div>
        <div className="usage-track"><i style={{ width: `${usagePercent}%` }} /></div>
      </section>

      <section className={`subscription-card premium-plan ${plan === 'premium' ? 'is-current' : ''}`}>
        <div className="premium-header">
          <div className="premium-mark"><Zap size={16} /></div>
          <div className="premium-copy"><h2>{subscription.name || 'Premium'}</h2><p>{Array.isArray(subscription.features) ? subscription.features.join(' · ') : 'Plan features'}</p></div>
          <div className="premium-price"><strong>{formatMoney(subscription.price, subscription.currency)}</strong><span>/ {String(subscription.billingPeriod || 'month').toUpperCase()}</span></div>
        </div>
        <div className="premium-stats">
          <div><strong>{subscription.features?.[0] ? '∞' : '—'}</strong><span>SETUPS</span></div>
          <div><strong>{subscription.features?.[1] ? 'LIVE' : '—'}</strong><span>INTELLIGENCE</span></div>
          <div><strong>{subscription.accessDays ? `${subscription.accessDays}D` : '—'}</strong><span>ACCESS</span></div>
        </div>

        <div className="payment-panel">
          <div className="payment-heading"><span>PAY WITH {String(subscription.paymentAsset || '—').toUpperCase()}</span><b>{String(subscription.paymentNetwork || '—').toUpperCase()}</b></div>
          <div className={`payment-address ${paymentAddress ? '' : 'is-empty'}`} onClick={copyAddress} role={paymentAddress ? 'button' : undefined} tabIndex={paymentAddress ? 0 : -1} onKeyDown={e => e.key === 'Enter' && copyAddress()}>
            <span>{paymentAddress || 'Payment address not configured'}</span>
            {paymentAddress && <button type="button" onClick={e => { e.stopPropagation(); copyAddress(); }} aria-label="Copy payment address"><Copy size={13} /></button>}
          </div>
          <div className="payment-input-wrap"><span>TRANSACTION HASH</span><input value={transactionHash} onChange={e => { setTransactionHash(e.target.value); setVerificationState(''); }} aria-label="Transaction hash" placeholder="Paste transaction hash" /></div>
          <button className="verify-payment-btn" type="button" onClick={submitVerification} disabled={verifying || submitted || !paymentAddress}>
            {verifying ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}
            {verifying ? 'Submitting…' : submitted ? 'Verification pending' : 'Payment verification'}
          </button>
          {(copied || verificationState || verification) && <div className={`payment-feedback ${verification?.status === 'approved' ? 'is-success' : ''}`}>
            <Check size={12} /> {copied ? 'Payment address copied' : verificationState === 'submitted' ? 'Transaction submitted for review.' : verification?.status === 'approved' ? 'Payment approved.' : verification?.status === 'pending' ? 'Transaction is pending review.' : verification?.status ? `Verification: ${verification.status}.` : verificationState}
          </div>}
        </div>
      </section>

      <div className="account-section-label">ACCOUNT SERVICES</div>
      <section className="account-tools">
        <div className="tool-card api-card"><div className="tool-icon"><KeyRound size={16} /></div><div><span className="tool-kicker">DEVELOPER ACCESS</span><h3>API</h3><p>{api.status === 'active' ? 'API access is enabled.' : 'Programmatic access is being prepared.'}</p></div><span className="coming-soon">{api.status === 'active' ? 'ACTIVE' : 'COMING SOON'}</span></div>
        <div className="tool-card wallet-card"><div className="tool-icon"><Wallet size={16} /></div><div><span className="tool-kicker">CONNECTED WALLET</span><h3>{walletAddress ? shortAddress(walletAddress) : 'No wallet connected'}</h3><p>Non-custodial wallet connection.</p></div><button type="button" className="wallet-action" onClick={connectWallet}>{walletAddress ? 'Connected' : 'Connect'}</button></div>
      </section>

      {profileError && <div className="account-sync-note"><span>Profile sync</span>{profileError}</div>}
      <button className="account-logout" type="button" onClick={logout}><LogOut size={14} /> Log out</button>
    </div>
  );
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMoney(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency || ''} ${amount}`.trim(); }
}

function initials(value) { return String(value || 'K').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'K'; }
function shortAddress(value) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected'; }
