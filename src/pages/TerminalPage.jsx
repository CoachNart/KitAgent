import React, { useMemo, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, ChevronDown, CircleDollarSign, Copy, Fuel, Image, Landmark, Loader2, LockKeyhole, RefreshCw, Send, ShieldCheck, Sparkles, Wallet, XCircle, Zap } from 'lucide-react';

const ACTIONS = [
  ['swap','Swap tokens','Swap USDC for ETH or another supported asset.'],['send','Send crypto','Send a token to a validated wallet address.'],['bridge','Bridge','Move supported assets between supported networks.'],['stake','Stake','Prepare a staking transaction for supported assets.'],['lend','Lend / supply','Supply assets to a supported lending market.'],['borrow','Borrow','Borrow against supported collateral after checks.'],['repay','Repay','Repay an existing lending position.'],['nft','NFT actions','View, transfer, buy, sell, list or cancel NFT orders.'],['faucet','Testnet faucet','Request supported testnet funds to a validated wallet.'],['balance','Portfolio','Inspect balances, positions and recent activity.'],
];

const EXAMPLES = ['Swap 200 USDC to ETH','Send 0.1 ETH to 0x…','Bridge 0.5 ETH to Base','Stake 10 USDC','Sell NFT #1234','Faucet 0.2 test ETH'];

function parseCommand(text) {
  const lower = text.toLowerCase();
  if (/(swap|exchange|convert)/.test(lower)) return 'swap';
  if (/\b(send|transfer|pay)\b/.test(lower)) return 'send';
  if (/\bbridge\b/.test(lower)) return 'bridge';
  if (/\bstake|staking\b/.test(lower)) return 'stake';
  if (/\b(borrow|loan)\b/.test(lower)) return 'borrow';
  if (/\b(repay)\b/.test(lower)) return 'repay';
  if (/\b(lend|supply|deposit).*\b(lending|protocol|market)?/.test(lower)) return 'lend';
  if (/\b(nft|collectible|collection)\b/.test(lower)) return 'nft';
  if (/\bfaucet|testnet\b/.test(lower)) return 'faucet';
  if (/\b(balance|portfolio|holdings)\b/.test(lower)) return 'balance';
  if (/\b(gas|fee)\b/.test(lower)) return 'gas';
  if (/\b(help|commands)\b/.test(lower)) return 'help';
  return 'unknown';
}

function responseFor(action) {
  const common = 'KitAgent is in wallet-only mode: nothing is signed without an explicit wallet confirmation.';
  const map = {
    swap: `I can prepare a token swap. I will validate the asset pair, estimate gas, check the route, simulate where supported, then ask your wallet to sign. ${common}`,
    send: `I can prepare a transfer. Before signing, KitAgent validates the recipient format, network, asset balance and estimated gas. ${common}`,
    bridge: `I can prepare a cross-chain transfer after checking the source balance, destination network, bridge route, fees and minimums. ${common}`,
    stake: `I can prepare a staking flow for supported assets. The final amount, protocol, fees and lock conditions will be shown before signing. ${common}`,
    lend: `I can prepare a supply/lending transaction. I will show protocol, asset, amount, estimated yield/fees and wallet confirmation requirements first. ${common}`,
    borrow: `Borrowing requires collateral and protocol-specific health checks. KitAgent will calculate the requested position and show liquidation risk before any signature. ${common}`,
    repay: `I can prepare a repayment flow and verify the debt position before asking your wallet to sign. ${common}`,
    nft: `NFT workflows include holdings, transfer, buy, sell, listing and cancellation. For a sale, KitAgent will show the marketplace, price, fees and estimated proceeds before signing. ${common}`,
    faucet: `Faucets are restricted to supported testnets. KitAgent will validate the destination wallet and network and will never treat mainnet assets as faucet funds.`,
    balance: 'Your connected wallet balance and portfolio can be read without exposing private keys. Connect a wallet to replace this demo view with live balances.',
    gas: 'Gas estimation is shown immediately before supported transaction preparation. Current demo estimate: 0.0008 ETH.',
    help: 'Try swap, send, bridge, stake, lend, borrow, repay, NFT, faucet, balance or gas. You can phrase requests naturally; KitAgent will ask for missing details before preparing an action.',
    unknown: 'I could not confidently identify that action. Try describing what you want to do in plain language, or choose an action below.',
  };
  return map[action] || map.unknown;
}

export default function TerminalPage({ access }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role:'assistant', text:'Welcome to KitAgent. I can help prepare swaps, transfers, bridges, staking, lending, borrowing, NFT actions and supported testnet faucet requests. Nothing is signed without your wallet confirmation.', time:'Now' }]);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [copied, setCopied] = useState(false);

  const statusText = useMemo(() => access === 'premium' ? 'Premium access' : access === 'trial' ? 'Trial access' : 'Read-only mode', [access]);
  const submit = (value = input) => {
    const text = value.trim();
    if (!text || busy) return;
    if (access === 'expired') { setMessages((m) => [...m, { role:'user', text, time:'Now' }, { role:'error', text:'Your trial has expired. Upgrade to unlock transaction preparation and new analyses.', time:'Now' }]); setInput(''); return; }
    const action = parseCommand(text);
    setInput(''); setActiveAction(action); setBusy(true);
    setMessages((m) => [...m, { role:'user', text, time:'Now' }, { role:'processing', text:'Checking request, permissions and transaction requirements…', time:'Now' }]);
    window.setTimeout(() => { setMessages((m) => [...m.slice(0,-1), { role: action === 'unknown' ? 'error' : 'assistant', text: responseFor(action), time:'Now' }]); setBusy(false); }, 650);
  };
  const copy = async () => { try { await navigator.clipboard.writeText('KitAgent terminal'); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch {} };

  return <div className="content-wrap terminal-page">
    <section className="page-heading"><div><span className="eyebrow">CONVERSATIONAL WEB3</span><h1>Terminal</h1><p>Describe the crypto action you want. KitAgent validates first, prepares second, and never signs without your wallet.</p></div><div className="risk-badge"><ShieldCheck size={16}/> {statusText}</div></section>
    <div className="terminal-layout">
      <section className="panel chat-panel">
        <div className="chat-header"><div className="agent-avatar"><Bot size={19}/></div><div><strong>KitAgent Assistant</strong><span>Action router · validation · education</span></div><div className="live-status"><span/> Secure session</div></div>
        <div className="message-list">{messages.map((message, i) => <div key={`${message.time}-${i}`} className={`message-row ${message.role}`}><div className="message-avatar">{message.role === 'user' ? <Wallet size={15}/> : message.role === 'error' ? <XCircle size={15}/> : message.role === 'processing' ? <Loader2 size={15} className="spin"/> : <Sparkles size={15}/>}</div><div className="message-bubble"><p>{message.text}</p><span>{message.time}</span></div></div>)}</div>
        <div className="command-box"><div className="example-row">{EXAMPLES.map((example) => <button key={example} onClick={() => submit(example)} disabled={busy}>{example}</button>)}</div><div className="input-row"><input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==='Enter' && submit()} placeholder="e.g. swap 200 USDC to ETH" aria-label="Web3 command" disabled={busy}/><button className="send-btn" onClick={()=>submit()} disabled={busy || !input.trim()}>{busy ? <Loader2 className="spin"/> : <Send/>}</button></div><div className="terminal-foot"><span><LockKeyhole size={13}/> Wallet signatures required</span><button onClick={copy}><Copy size={13}/>{copied ? 'Copied' : 'Copy session label'}</button></div></div>
      </section>
      <aside className="panel action-panel"><div className="section-title"><div><h3>Available actions</h3><p>Choose an intent or type naturally.</p></div><ChevronDown size={18}/></div><div className="action-list">{ACTIONS.map(([id,title,desc])=><button key={id} onClick={()=>submit(id==='nft'?'Sell NFT #1234':id==='faucet'?'Request testnet faucet funds':title)} className={activeAction===id?'selected':''}><ActionIcon id={id}/><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={15}/></button>)}</div><div className="security-note"><ShieldCheck size={18}/><div><strong>Security by design</strong><p>No private keys are stored in the terminal. Real transactions require wallet signing and server-side validation when connected.</p></div></div></aside>
    </div>
  </div>;
}

function ActionIcon({id}) { const icons={swap:RefreshCw,send:Send,bridge:ArrowRight,stake:Zap,lend:Landmark,borrow:CircleDollarSign,repay:RefreshCw,nft:Image,faucet:Fuel,balance:Wallet}; const I=icons[id]||Zap; return <span className="action-icon"><I size={17}/></span>; }
