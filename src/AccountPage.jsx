import { useState } from 'react';
import { Check, Copy, KeyRound, LogOut, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';

const PAYMENT_ADDRESS = '0x1c35bf9d920e1b5d7e7e37ce1d15a1b9500f8474';

export default function AccountPage({ user, wallet, connectWallet }) {
  const [copied, setCopied] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const name = user?.displayName || 'KitAgent member';
  const email = user?.email || 'Firebase account';
  const photo = user?.photoURL || '';

  const copyAddress = async () => {
    try {
      await navigator.clipboard?.writeText(PAYMENT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setVerificationMessage('Copy is unavailable in this browser.');
    }
  };

  const verifyPayment = () => {
    setVerificationMessage('Payment verification will be connected to the subscription backend soon.');
  };

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      setVerificationMessage(error?.message || 'Unable to sign out right now.');
    }
  };

  return (
    <div className="account-page">
      <section className="account-identity">
        <div className="account-avatar">
          {photo ? <img src={photo} alt="" /> : <span>{initials(name)}</span>}
        </div>
        <div className="account-name-block">
          <div className="account-name-row">
            <h1>{name}</h1>
            <span className="account-active">ACTIVE</span>
          </div>
          <p>{email}</p>
        </div>
      </section>

      <section className="subscription-card free-plan">
        <div className="subscription-topline">
          <div>
            <span className="subscription-label">PLAN</span>
            <div className="plan-name-row"><h2>Free</h2><span>free</span></div>
          </div>
          <div className="remaining-block">
            <span className="subscription-label">REMAINING</span>
            <strong>LOCKED</strong>
          </div>
        </div>
        <div className="free-meta"><span>Monthly usage</span><b>TRIAL ENDED</b></div>
        <div className="usage-track"><i /></div>
      </section>

      <section className="subscription-card premium-plan">
        <div className="premium-header">
          <div className="premium-mark"><span>◆</span></div>
          <div className="premium-copy">
            <h2>Premium</h2>
            <p>Unlimited setups · live intelligence</p>
          </div>
          <div className="premium-price"><strong>$30</strong><span>/ MONTH</span></div>
        </div>

        <div className="premium-stats">
          <div><strong>∞</strong><span>SETUPS</span></div>
          <div><strong>LIVE</strong><span>DATA</span></div>
          <div><strong>30D</strong><span>ACCESS</span></div>
        </div>

        <div className="payment-panel">
          <div className="payment-heading">
            <span>PAY WITH USDT</span>
            <b>BNB CHAIN</b>
          </div>
          <div className="payment-address" onClick={copyAddress} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && copyAddress()}>
            <span>{PAYMENT_ADDRESS}</span>
            <button type="button" onClick={e => { e.stopPropagation(); copyAddress(); }} aria-label="Copy payment address"><Copy size={15} /></button>
          </div>
          <div className="payment-input-wrap">
            <span>Transaction hash</span>
            <input aria-label="Transaction hash" placeholder="Paste your USDT transaction hash" />
          </div>
          <button className="verify-payment-btn" type="button" onClick={verifyPayment}>
            <ShieldCheck size={17} /> Verify payment
          </button>
          {copied && <div className="payment-feedback"><Check size={14} /> Payment address copied</div>}
          {verificationMessage && <div className="payment-feedback"><Zap size={14} /> {verificationMessage}</div>}
        </div>
      </section>

      <section className="account-tools">
        <div className="tool-card api-card">
          <div className="tool-icon"><KeyRound size={19} /></div>
          <div><span className="tool-kicker">DEVELOPER ACCESS</span><h3>API</h3><p>Programmatic KitAgent access is coming soon.</p></div>
          <span className="coming-soon">COMING SOON</span>
        </div>
        <div className="tool-card wallet-card">
          <div className="tool-icon"><Wallet size={19} /></div>
          <div><span className="tool-kicker">CONNECTED WALLET</span><h3>{wallet ? shortAddress(wallet) : 'No wallet connected'}</h3><p>Non-custodial wallet connection.</p></div>
          <button type="button" className="wallet-action" onClick={connectWallet}>{wallet ? 'Connected' : 'Connect'}</button>
        </div>
      </section>

      <button className="account-logout" type="button" onClick={logout}><LogOut size={17} /> Log out</button>
    </div>
  );
}

function initials(value) {
  return String(value || 'K').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'K';
}

function shortAddress(value) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected';
}
