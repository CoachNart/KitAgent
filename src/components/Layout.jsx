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
  return <div className="app">
    <aside className="rail">
      <button className="brand" onClick={() => onNavigate('terminal')} aria-label="KitAgent">K<span>+</span></button>
      <nav>{navigation.map((item) => <button key={item.id} className={page === item.id ? 'nav active' : 'nav'} onClick={() => onNavigate(item.id)} title={item.label}><span className="ico">{item.icon}</span><small>{item.label}</small></button>)}</nav>
      <div className="rail-foot">SAFE<br/>MODE</div>
    </aside>
    <main className="main">
      <header className="page-head"><div><div className="eyebrow">KITAGENT / {eyebrow.toUpperCase()}</div><h1>{title}</h1></div><div className="status"><i/> SYSTEM ONLINE</div></header>
      {children}
    </main>
  </div>;
}
