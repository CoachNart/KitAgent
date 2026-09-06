import React from 'react';
import { navigation } from '../data/navigation';

const titles = {
  terminal: ['Command center', 'Agent terminal'],
  trading: ['Market intelligence', 'Decision engine'],
  history: ['Execution history', 'Transaction ledger'],
  signals: ['Signal desk', 'Market signals'],
  track: ['Track record', 'Performance ledger'],
  profile: ['Account overview', 'Personal workspace'],
};

export default function Layout({ page, onNavigate, children }) {
  const [title, eyebrow] = titles[page];

  return (
    <div className="app">
      <aside className="rail">
        <button className="brand" onClick={() => onNavigate('terminal')} aria-label="KitAgent home">
          <span className="brand-mark">K</span><span className="brand-plus">+</span>
        </button>

        <div className="rail-section-label">PRODUCT</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'nav active' : 'nav'}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <span className="ico">{item.icon}</span>
              <span className="nav-copy"><small>{item.label}</small></span>
            </button>
          ))}
        </nav>

        <div className="rail-bottom">
          <div className="secure-row"><span className="secure-dot" /><span>SECURE SESSION</span></div>
          <div className="rail-version">KITAGENT <b>v1</b></div>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div className="page-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> KITAGENT <b>/</b> {eyebrow.toUpperCase()}</div>
            <h1>{title}</h1>
          </div>
          <div className="header-meta">
            <div className="network-status"><i /> SYSTEM OPERATIONAL</div>
            <button className="header-chip" onClick={() => onNavigate('terminal')} aria-label="Open terminal">
              <span className="chip-dot" /> EVM <em>READY</em>
            </button>
          </div>
        </header>
        <div className="content-frame">{children}</div>
      </main>
    </div>
  );
}
