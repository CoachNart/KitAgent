import React, { useMemo, useState } from 'react';
import { detectIntent, faucetLinks, respondToIntent } from '../services/terminalAgent';
import { connectWallet, isWalletAvailable } from '../services/wallet';
import { CAPABILITIES } from '../data/capabilities';

export default function TerminalPage() {
  const [messages, setMessages] = useState([{ role: 'agent', text: 'KitAgent is ready. Ask for a crypto, DeFi, NFT, trading or on-chain action in plain English. I prepare first, show risk/fees, then wait for your confirmation and wallet approval.' }]);
  const [input, setInput] = useState('');
  const [wallet, setWallet] = useState(null);
  const [showCapabilities, setShowCapabilities] = useState(false);

  const groups = useMemo(() => CAPABILITIES.reduce((acc, item) => { (acc[item.group] ||= []).push(item); return acc; }, {}), []);
  const suggestions = ['Swap ETH to USDC', 'Sell my NFT', 'Buy this NFT', 'Lend USDC', 'Add liquidity', 'Stake ETH', 'Revoke token approval', 'Bridge to Base', 'Find airdrops', 'Estimate gas'];

  const submit = (value = input) => {
    const q = value.trim(); if (!q) return;
    const result = respondToIntent(q);
    let extra = '';
    if (result.intent === 'faucet') {
      const network = /sepolia/i.test(q) ? 'Sepolia' : null;
      if (network) extra = faucetLinks(network).map((x) => `• ${x.name}: ${x.url}`).join('\n');
    }
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'agent', text: extra ? `${result.text}\n\n${extra}` : result.text }]);
    setInput('');
  };

  const walletAction = async () => { try { setWallet(await connectWallet()); } catch (e) { setMessages((m) => [...m, { role: 'agent', text: e.message }]); } };

  const chooseCapability = (cap) => { setInput(cap.label); setShowCapabilities(false); };

  return <section className="terminal-page">
    <div className="terminal-shell">
      <div className="terminal-top"><span>AGENT CONSOLE</span><span>SAFE MODE · PREPARE → CONFIRM → SIGN → BROADCAST</span></div>
      <div className="messages">{messages.map((m, i) => <div className={`msg ${m.role}`} key={i}><b>{m.role === 'agent' ? 'KITAGENT' : 'YOU'}</b><p>{m.text}</p></div>)}</div>
      <div className="terminal-actions">
        <button className="capability-toggle" onClick={() => setShowCapabilities((v) => !v)}>{showCapabilities ? 'HIDE CAPABILITIES' : 'EXPLORE EVERYTHING'}</button>
        {showCapabilities && <div className="capability-panel">{Object.entries(groups).map(([group, items]) => <div className="cap-group" key={group}><small>{group}</small>{items.map((cap) => <button key={cap.id} onClick={() => chooseCapability(cap)}><strong>{cap.label}</strong><span>{cap.description}</span></button>)}</div>)}</div>}
      </div>
      <div className="suggestions">{suggestions.map((x) => <button key={x} onClick={() => setInput(x)}>{x}</button>)}</div>
      <div className="composer"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Tell KitAgent what you want to do…"/><button onClick={() => submit()}>PREPARE <span>↵</span></button></div>
    </div>
    <div className="terminal-grid">
      <div className="mini"><span>WALLET</span><strong>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Not connected'}</strong><button onClick={walletAction}>{wallet ? 'CONNECTED' : isWalletAvailable() ? 'CONNECT EVM' : 'NO WALLET'}</button></div>
      <div className="mini"><span>DEFI</span><p>Swap · Bridge · Lending · Borrowing · LP · Staking · Yield · Approvals</p></div>
      <div className="mini"><span>NFT</span><p>Discover · Buy · Sell · List · Offers · Transfer · Marketplace actions</p></div>
      <div className="mini"><span>ON-CHAIN</span><p>Gas · Airdrops · Governance · DAOs · Contracts · Batch · Portfolio</p></div>
    </div>
  </section>;
}
