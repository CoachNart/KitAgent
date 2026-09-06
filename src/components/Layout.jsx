import React from 'react';
import { navigation } from '../data/navigation';

const titles = {
  terminal: ['Web3, in plain English.', 'Agent terminal'],
  trading: ['Market intelligence.', 'Decision engine'],
  history: ['Transaction history.', 'Execution ledger'],
  signals: ['Live signal desk.', 'Premium access'],
  track: ['Performance ledger.', 'Track record'],
  profile: ['Your KitAgent.', 'Account map'],
};

export default function Layout({ page, onNavigate, children }) {
  const [title, eyebrow] = titles[page];
  return (
    <div className="app">
      <aside className="rail">
        <button className="brand" onClick={() => onNavigate('terminal')} aria-label="KitAgent">
          <span className="brand-mark">K</span><span className="brand-plus">+</span>
        </button>
        <div className="rail-label">WORKSPACE</div>
        <nav>
          {navigation.map((item) => (
            <button key={item.id} className={page === item.id ? 'nav active' : 'nav'} onClick={() => onNavigate(item.id)} title={item.label}>
              <span className="ico">{item.icon}</span><small>{item.label}</small>
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <div className="secure-dot"><i /></div>
          <div><strong>SECURE</strong><span>SESSION</span></div>
        </div>
      </aside>
      <main className="main">
        <header className="page-head">
          <div className="page-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> KITAGENT <b>/</b> {eyebrow.toUpperCase()}</div>
            <h1>{title}</h1>
          </div>
          <div className="header-meta">
            <div className="network-status"><i /> ALL SYSTEMS OPERATIONAL</div>
            <div className="header-chip">EVM <span>CONNECTED</span></div>
          </div>
        </header>
        <div className="content-frame">{children}</div>
      </main>
    </div>
  );
}
