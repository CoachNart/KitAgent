import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const CHAINS = {
  robinhood: { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com', testnet: false },
  robinhoodTestnet: { id: 46630, hex: '0xb5c6', name: 'Robinhood Testnet', rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com', testnet: true },
};

const ACTIONS = [
  ['send', 'Send', 'ETH or ERC-20', '↗'],
  ['swap', 'Swap', 'Best available route', '⇄'],
  ['bridge', 'Bridge', 'Move across chains', '◈'],
  ['defi', 'DeFi', 'Lend, borrow, stake', '◌'],
  ['nft', 'NFT', 'Send or interact', '◇'],
  ['contract', 'Contract', 'Call any EVM contract', '⌁'],
];

const EXAMPLES = [
  'Send 0.01 ETH to 0x…',
  'Swap 25 USDC for ETH',
  'Bridge 100 USDC to Robinhood Chain',
  'Show me my portfolio',
  'How much gas will this transaction cost?',
  'Get me test ETH for Robinhood Chain',
];

function Icon({ name }) {
  const icons = { bolt: 'ϟ', wallet: '▣', activity: '⌁', command: '⌘', faucet: '♢', settings: '⚙', shield: '◇' };
  return <span className="icon-glyph">{icons[name] || '•'}</span>;
}

function shorten(value, left = 6, right = 4) {
  if (!value) return '';
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function toHexWei(value) {
  const [whole, fraction = ''] = String(value).trim().split('.');
  const clean = `${whole || '0'}${fraction.padEnd(18, '0').slice(0, 18)}`.replace(/^0+(?=\d)/, '');
  return BigInt(clean || '0').toString(16);
}

function fromHex(hex, decimals = 18) {
  try {
    const n = BigInt(hex || '0');
    const base = 10n ** BigInt(decimals);
    const whole = n / base;
    const fraction = (n % base).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch { return '0'; }
}

async function rpc(chain, method, params = []) {
  const response = await fetch(chain.rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'RPC request failed');
  return data.result;
}

async function estimateNative(chain, from, to, valueEth) {
  const tx = { from, to, value: `0x${toHexWei(valueEth)}` };
  const gas = await rpc(chain, 'eth_estimateGas', [tx]);
  const gasPrice = await rpc(chain, 'eth_gasPrice');
  return { gas, gasPrice, tx };
}

function classifyIntent(text) {
  const t = text.toLowerCase();
  if (/portfolio|balance|holdings|what do i own/.test(t)) return 'portfolio';
  if (/faucet|test eth|testnet gas|gas for (a )?testnet|get me gas/.test(t)) return 'faucet';
  if (/gas fee|gas cost|fee estimate|how much gas/.test(t)) return 'gas';
  if (/bridge|move .* to .*chain|cross.?chain/.test(t)) return 'bridge';
  if (/swap|exchange|trade .* for/.test(t)) return 'swap';
  if (/stake|lend|borrow|supply|repay|claim/.test(t)) return 'defi';
  if (/nft|erc.?721|erc.?1155/.test(t)) return 'nft';
  if (/approve|contract|call|mint|wrap|unwrap|deploy/.test(t)) return 'contract';
  if (/send|transfer|pay|give/.test(t)) return 'send';
  return 'command';
}

function parseAddress(text) { return text.match(/0x[a-fA-F0-9]{40}/)?.[0] || ''; }
function parseAmount(text) { return text.match(/\b\d+(?:\.\d+)?\b/)?.[0] || ''; }

function App() {
  const [chainKey, setChainKey] = useState('robinhood');
  const chain = CHAINS[chainKey];
  const [account, setAccount] = useState('');
  const [nativeBalance, setNativeBalance] = useState('—');
  const [command, setCommand] = useState('');
  const [mode, setMode] = useState('command');
  const [action, setAction] = useState('send');
  const [status, setStatus] = useState('READY');
  const [activity, setActivity] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [gas, setGas] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [contractTo, setContractTo] = useState('');
  const [contractData, setContractData] = useState('0x');
  const [customValue, setCustomValue] = useState('');

  const intentType = useMemo(() => classifyIntent(command), [command]);

  useEffect(() => {
    if (window.ethereum) window.ethereum.request({ method: 'eth_accounts' }).then(a => { if (a?.[0]) setAccount(a[0]); }).catch(() => {});
  }, []);
  useEffect(() => { if (account) refreshWallet(); }, [account, chainKey]);

  async function connect() {
    if (!window.ethereum) { setNotice('Install an EVM wallet such as Robinhood Wallet or MetaMask to connect.'); return; }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts?.[0]) { setAccount(accounts[0]); await switchNetwork(); }
    } catch (error) { setNotice(error.message || 'Wallet connection cancelled.'); }
  }

  async function switchNetwork() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.hex }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: chain.hex, chainName: chain.name,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer],
      }] });
    }
  }

  async function refreshWallet() {
    try {
      const balance = await rpc(chain, 'eth_getBalance', [account, 'latest']);
      setNativeBalance(fromHex(balance));
      const txs = await fetch(`${chain.explorer}/api/v2/addresses/${account}/transactions?filter=validated`).then(r => r.json());
      setActivity((txs.items || []).slice(0, 8));
      const tokenData = await fetch(`${chain.explorer}/api/v2/addresses/${account}/token-balances`).then(r => r.json());
      setTokens((tokenData || []).filter(t => Number(t.value || 0) > 0).slice(0, 12));
    } catch { /* public endpoints can be rate limited */ }
  }

  async function estimateGasForIntent() {
    const to = parseAddress(command) || sendTo;
    const amount = parseAmount(command) || sendAmount;
    if (!account || !to || !/^0x[a-fA-F0-9]{40}$/.test(to) || !amount) { setNotice('For a live gas estimate, connect a wallet and provide a valid recipient plus amount.'); return; }
    try {
      setLoading(true);
      const result = await estimateNative(chain, account, to, amount);
      const feeWei = BigInt(result.gas) * BigInt(result.gasPrice);
      setGas({ units: BigInt(result.gas).toString(), fee: fromHex(`0x${feeWei.toString(16)}`), gasPrice: fromHex(result.gasPrice) });
      setNotice(`Live estimate: ${result.gas} gas units at ${fromHex(result.gasPrice)} gwei.`);
    } catch (error) { setNotice(error.message || 'Could not estimate gas.'); }
    finally { setLoading(false); }
  }

  async function sendNative() {
    if (!window.ethereum || !account) return connect();
    if (!/^0x[a-fA-F0-9]{40}$/.test(sendTo) || !sendAmount) { setNotice('Enter a valid recipient and ETH amount.'); return; }
    try {
      setLoading(true); setStatus('SIMULATING');
      const estimate = await estimateNative(chain, account, sendTo, sendAmount);
      await rpc(chain, 'eth_call', [{ from: account, to: sendTo, value: estimate.tx.value }, 'latest']);
      const feeWei = BigInt(estimate.gas) * BigInt(estimate.gasPrice);
      setGas({ units: BigInt(estimate.gas).toString(), fee: fromHex(`0x${feeWei.toString(16)}`), gasPrice: fromHex(estimate.gasPrice) });
      setStatus('AWAITING APPROVAL');
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: sendTo, value: estimate.tx.value, gas: estimate.gas }] });
      setStatus('BROADCAST'); setNotice(`Transaction sent: ${shorten(hash, 10, 8)}`);
      setActivity(prev => [{ hash, to: sendTo, value: sendAmount, status: 'pending' }, ...prev].slice(0, 8)); setSendAmount('');
    } catch (error) { setStatus('READY'); setNotice(error.message || 'Transaction rejected.'); }
    finally { setLoading(false); }
  }

  async function simulateContract() {
    if (!account || !/^0x[a-fA-F0-9]{40}$/.test(contractTo) || !/^0x[0-9a-fA-F]*$/.test(contractData)) { setNotice('Provide a valid contract address and calldata.'); return; }
    try {
      setLoading(true); setStatus('SIMULATING');
      const result = await rpc(chain, 'eth_call', [{ from: account, to: contractTo, data: contractData, value: customValue ? `0x${toHexWei(customValue)}` : '0x0' }, 'latest']);
      setStatus('SIMULATION PASSED'); setNotice(`Call returned ${result === '0x' ? 'no data' : shorten(result, 18, 8)}. Nothing was signed.`);
    } catch (error) { setStatus('SIMULATION FAILED'); setNotice(error.message || 'Simulation reverted.'); }
    finally { setLoading(false); }
  }

  async function executeContract() {
    if (!window.ethereum || !account) return connect();
    try {
      await simulateContract(); setStatus('AWAITING APPROVAL');
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: contractTo, data: contractData, value: customValue ? `0x${toHexWei(customValue)}` : '0x0' }] });
      setStatus('BROADCAST'); setNotice(`Contract transaction sent: ${shorten(hash, 10, 8)}`);
    } catch (error) { setStatus('READY'); setNotice(error.message || 'Transaction rejected.'); }
  }

  function applyCommand(text = command) {
    const type = classifyIntent(text);
    if (type === 'portfolio') { setMode('portfolio'); return; }
    if (type === 'faucet') { setMode('faucet'); setNotice('Robinhood testnet gas is distributed through the official faucet.'); return; }
    if (type === 'gas') { setMode('command'); setAction('send'); estimateGasForIntent(); return; }
    setAction(type === 'command' ? 'send' : type); setMode('command');
    const address = parseAddress(text); const amount = parseAmount(text);
    if (address) setSendTo(address); if (amount && type === 'send') setSendAmount(amount);
  }

  const commandTitle = { send: 'Move assets', swap: 'Find the best swap', bridge: 'Cross-chain intent', defi: 'DeFi action', nft: 'NFT action', contract: 'Contract call' }[action] || 'Onchain command';

  return <div className="app-shell">
    <aside className="rail">
      <div className="brand-mini"><div className="brand-mark"><i /><i /><i /></div><span>KIT<span>AGENT</span></span></div>
      <nav>
        <button className={mode === 'command' ? 'active' : ''} onClick={() => setMode('command')}><Icon name="command" /><span>Command</span></button>
        <button className={mode === 'portfolio' ? 'active' : ''} onClick={() => { setMode('portfolio'); refreshWallet(); }}><Icon name="wallet" /><span>Portfolio</span></button>
        <button className={mode === 'activity' ? 'active' : ''} onClick={() => { setMode('activity'); refreshWallet(); }}><Icon name="activity" /><span>Activity</span></button>
        <button className={mode === 'faucet' ? 'active' : ''} onClick={() => setMode('faucet')}><Icon name="faucet" /><span>Gas Station</span></button>
      </nav>
      <div className="rail-bottom"><button onClick={() => setNotice('KitAgent is non-custodial: your wallet signs every transaction.')}><Icon name="shield" /></button><button onClick={() => setNotice('Never paste a seed phrase or private key. Simulate first, sign last.')}><Icon name="settings" /></button></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><div className="top-status"><span className="pulse-dot" /> AGENT ONLINE <b>•</b> NON-CUSTODIAL</div><div className="top-controls"><button className="chain-picker" onClick={async () => { const next = chainKey === 'robinhood' ? 'robinhoodTestnet' : 'robinhood'; setChainKey(next); }}>{chain.testnet ? '◉' : '●'} {chain.name}<small>{chain.testnet ? 'TESTNET' : 'MAINNET'}</small>⌄</button><button className="wallet-button" onClick={connect}>{account ? <><span className="wallet-dot" />{shorten(account)}</> : 'Connect wallet'}</button></div></header>

      <section className="hero-row"><div><div className="eyebrow">ONCHAIN INTENT ENGINE · v1</div><h1>Do more than <em>transact.</em></h1><p>Describe the outcome. KitAgent finds the path, checks the risk, simulates the call and lets <strong>you</strong> approve it.</p></div><div className="agent-core"><div className="core-orbit one" /><div className="core-orbit two" /><div className="core-dot" /><span>READY</span></div></section>

      {mode === 'command' && <>
        <section className="command-grid">
          <div className="command-panel glow-card"><div className="panel-top"><div><label>INTENT COMPOSER</label><small>One sentence. Any onchain outcome.</small></div><span className="guard">4 GUARDRAILS ACTIVE</span></div><textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="What do you want KitAgent to do?" /><div className="command-footer"><div className="quick-row">{EXAMPLES.slice(0, 3).map(x => <button key={x} onClick={() => setCommand(x)}>{x}</button>)}</div><button className="execute-intent" onClick={() => applyCommand()} disabled={!command.trim()}>Run <span>↗</span></button></div><div className="intent-reading"><span>DETECTED</span><b>{intentType.toUpperCase()}</b><i /><span>CHAIN</span><b>{chain.name.toUpperCase()}</b><i /><span>CONTROL</span><b>USER-SIGNED</b></div></div>
          <div className="agent-panel glow-card"><div className="panel-top"><div><label>AGENT STATE</label><small>Deterministic safety pipeline</small></div><span className="status-chip">{status}</span></div><div className="pipeline">{['UNDERSTAND','VERIFY','SIMULATE','APPROVE'].map((x,i) => <div key={x} className={status !== 'READY' && i < 3 ? 'stage-live' : ''}><span>{String(i+1).padStart(2,'0')}</span><div><b>{x}</b><small>{['Intent parsed','Balances + permissions','Revert + gas check','Wallet signature'][i]}</small></div><i>{status !== 'READY' && i < 3 ? '✓' : i === 3 && status === 'AWAITING APPROVAL' ? '●' : '—'}</i></div>)}</div><div className="safety"><Icon name="shield" /><div><b>Nothing moves without your signature.</b><small>KitAgent never asks for seed phrases or private keys.</small></div></div></div>
        </section>
        <section className="action-strip">{ACTIONS.map(([key,title,sub,glyph]) => <button key={key} className={action === key ? 'selected' : ''} onClick={() => setAction(key)}><span className="action-glyph">{glyph}</span><div><b>{title}</b><small>{sub}</small></div><span>↗</span></button>)}</section>
        <section className="workbench glow-card"><div className="workbench-head"><div><label>{commandTitle}</label><small>Production-safe wallet execution surface</small></div><span className="chain-pill">{chain.testnet ? 'TESTNET' : 'LIVE'} · {chain.id}</span></div>
          {action === 'send' && <div className="form-grid"><label>RECIPIENT<input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="0x wallet address" /></label><label>AMOUNT<input value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="0.00 ETH" inputMode="decimal" /></label><div className="form-span"><div className="fee-box"><span>LIVE GAS ESTIMATE</span><b>{gas ? `${gas.fee} ETH` : '—'}</b><small>{gas ? `${gas.units} units · ${gas.gasPrice} gwei` : 'Estimate before signing'}</small></div><div className="button-row"><button onClick={estimateGasForIntent} disabled={loading}>Estimate</button><button className="primary" onClick={sendNative} disabled={loading}>Simulate & Send ↗</button></div></div></div>}
          {['swap','bridge','defi','nft'].includes(action) && <div className="feature-card"><div className="feature-icon">{ACTIONS.find(a => a[0] === action)?.[3]}</div><div><h3>{commandTitle}</h3><p>KitAgent can represent this intent, compare routes and enforce a simulation-before-sign policy. The production adapter should be connected to the selected protocol or aggregator before real execution is enabled.</p><div className="route-tags"><span>QUOTE</span><span>RISK CHECK</span><span>SIMULATION</span><span>USER APPROVAL</span></div></div><button className="primary" onClick={() => setNotice('Intent captured. Add a protocol adapter such as Uniswap, LayerZero, Relay, Across, Morpho or another supported venue to execute this class.')}>Build route ↗</button></div>}
          {action === 'contract' && <div className="form-grid contract-form"><label>CONTRACT ADDRESS<input value={contractTo} onChange={e => setContractTo(e.target.value)} placeholder="0x…" /></label><label>ETH VALUE<input value={customValue} onChange={e => setCustomValue(e.target.value)} placeholder="0.00" /></label><label className="form-span">CALLDATA<textarea value={contractData} onChange={e => setContractData(e.target.value)} placeholder="0x…" /></label><div className="form-span button-row"><button onClick={simulateContract} disabled={loading}>Simulate call</button><button className="primary" onClick={executeContract} disabled={loading}>Approve & Broadcast ↗</button></div></div>}
        </section></>}

      {mode === 'portfolio' && <section className="data-page glow-card"><div className="page-head"><div><label>PORTFOLIO</label><h2>Your onchain position</h2><p>{account ? shorten(account, 10, 8) : 'Connect a wallet to load balances.'}</p></div><button onClick={refreshWallet}>Refresh ↻</button></div><div className="portfolio-total"><span>NATIVE BALANCE</span><strong>{nativeBalance} <small>ETH</small></strong><i>{chain.name}</i></div><div className="token-list"><div className="table-head"><span>ASSET</span><span>BALANCE</span><span>CONTRACT</span></div>{tokens.length ? tokens.map((t,i) => <div className="token-row" key={`${t.token?.address || i}-${i}`}><b>{t.token?.symbol || 'TOKEN'}</b><span>{t.value}</span><small>{shorten(t.token?.address || '')}</small></div>) : <div className="empty">No indexed token balances yet.</div>}</div></section>}
      {mode === 'activity' && <section className="data-page glow-card"><div className="page-head"><div><label>ACTIVITY</label><h2>Recent transactions</h2><p>Indexed from Robinhood Chain Blockscout.</p></div><button onClick={refreshWallet}>Refresh ↻</button></div><div className="activity-list">{activity.length ? activity.map((tx,i) => <a key={tx.hash || i} href={`${chain.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer"><span className="tx-index">{String(i+1).padStart(2,'0')}</span><div><b>{tx.method || 'Transaction'}</b><small>{shorten(tx.hash, 12, 10)} · {shorten(tx.to?.hash || tx.to || '')}</small></div><strong>{tx.status || 'confirmed'} ↗</strong></a>) : <div className="empty">Connect a wallet to load indexed activity.</div>}</div></section>}
      {mode === 'faucet' && <section className="data-page glow-card faucet-page"><div className="page-head"><div><label>GAS STATION</label><h2>Never get stranded on testnet.</h2><p>KitAgent detects when an intent needs gas and routes you to the official Robinhood Chain testnet faucet.</p></div><span className="big-orb">ϟ</span></div><div className="faucet-grid"><div><span>NETWORK</span><b>Robinhood Chain Testnet</b><small>Chain ID 46630 · ETH gas</small></div><div><span>YOUR ADDRESS</span><b>{account ? shorten(account, 12, 10) : 'Connect wallet first'}</b><small>Use your wallet address at the faucet.</small></div><div><span>LIVE BALANCE</span><b>{chain.testnet ? nativeBalance : 'Switch to testnet'}</b><small>Test ETH has no monetary value.</small></div></div><div className="faucet-actions"><button className="primary" onClick={async () => { setChainKey('robinhoodTestnet'); setNotice('Switch to Robinhood Testnet, then claim test ETH from the official faucet.'); }}>Use Robinhood Testnet</button><a className="button-link" href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Open official faucet ↗</a></div><div className="faucet-note"><Icon name="shield" /><span><b>Gas sponsorship architecture.</b> Robinhood Chain supports ERC-4337 account abstraction and gas sponsorship. A funded bundler/paymaster service is required to sponsor real user transactions; KitAgent never holds user keys.</span></div></section>}

      <div className="bottom-console"><div><span className="console-dot" /> {chain.testnet ? 'TEST ENVIRONMENT' : 'LIVE NETWORK'} · RPC</div><div>ETH GAS · <b>{gas ? `${gas.fee} ETH` : 'ON DEMAND'}</b></div><div>BLOCKSCOUT · <b>INDEXED</b></div><div>USER CONTROL · <b>100%</b></div></div>
    </main>
    {notice && <button className="notice" onClick={() => setNotice('')}><span>AGENT</span>{notice}<b>×</b></button>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
