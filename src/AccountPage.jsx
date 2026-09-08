import { ShieldCheck, Wallet, UserRound } from 'lucide-react';

export default function AccountPage({ user, wallet = '', connectWallet }) {
  const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected';
  return <div className="page-wrap account-page">
    <section className="account-card">
      <div className="account-card-head">
        <div><span className="terminal-kicker">KITAGENT ACCOUNT</span><h2><UserRound size={20}/> Profile & security</h2></div>
        <span className="status-live"><i/> SECURE</span>
      </div>
      <div className="account-grid">
        <div className="account-field"><span>EMAIL</span><strong>{user?.email || '—'}</strong></div>
        <div className="account-field"><span>WALLET</span><strong>{short(wallet)}</strong></div>
        <div className="account-field"><span>AUTHENTICATION</span><strong><ShieldCheck size={15}/> Firebase secured</strong></div>
        <div className="account-field"><span>NETWORK</span><strong>Robinhood Chain</strong></div>
      </div>
      {connectWallet && <button className="generate-button" onClick={connectWallet}><Wallet size={15}/>{wallet ? 'Wallet connected' : 'Connect wallet'}</button>}
    </section>
  </div>;
}
