import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const CHAINS = {
  robinhood: { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com', testnet: false },
  robinhoodTestnet: { id: 46630, hex: '0xb5c6', name: 'Robinhood Testnet', rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com', testnet: true },
};

const ACTIONS = [
  ['send', 'Send', 'ETH / ERC-20', '↗'],
  ['swap', 'Swap', 'Token → token', '⇄'],
  ['bridge', 'Bridge', 'Chain → chain', '◈'],
  ['defi', 'DeFi', 'Lend / borrow / stake', '◌'],
  ['nft', 'NFT', 'ERC-721 / 1155', '◇'],
  ['contract', 'Contract', 'Any EVM call', '⌁'],
];

const EXAMPLES = [
  'Send 0.01 ETH to 0x…',
  'Send 25 USDC to 0x…',
  'Swap 25 USDC for ETH',
  'Bridge 100 USDC to Robinhood Chain',
  'Show my portfolio',
  'Estimate gas for this transaction',
  'Get me test ETH',
];

function Icon({ name }) {
  const icons = { bolt: 'ϟ', wallet: '▣', activity: '⌁', command: '⌘', faucet: '♢', settings: '⚙', shield: '◇', copy: '□' };
  return <span className="icon-glyph">{icons[name] || '•'}</span>;
}

function shorten(value, left = 6, right = 4) {
  if (!value) return '';
  if (value.length <= left + right + 1) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function toWei(value, decimals = 18) {
  const [whole = '0', fraction = ''] = String(value || '0').trim().split('.');
  const clean = `${whole.replace(/\D/g, '') || '0'}${fraction.replace(/\D/g, '').padEnd(decimals, '0').slice(0, decimals)}`;
  return BigInt(clean || '0');
}
function toHexAmount(value, decimals = 18) { return `0x${toWei(value, decimals).toString(16)}`; }
function fromHex(hex, decimals = 18) {
  try {
    const n = BigInt(hex || '0'); const base = 10n ** BigInt(decimals); const whole = n / base;
    const fraction = (n % base).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch { return '0'; }
}

async function rpc(chain, method, params = []) {
  const response = await fetch(chain.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'RPC request failed');
  return data.result;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
function parseAddress(text) { return text.match(/0x[a-fA-F0-9]{40}/)?.[0] || ''; }
function parseAmount(text) { return text.match(/\b\d+(?:\.\d+)?\b/)?.[0] || ''; }
function padWord(hex) { return hex.replace(/^0x/, '').padStart(64, '0'); }
function encodeAddress(address) { return padWord(address); }
function encodeUint(value, decimals = 18) { return padWord(toWei(value, decimals).toString(16)); }
function erc20Transfer(to, amount, decimals) { return `0xa9059cbb${encodeAddress(to)}${encodeUint(amount, decimals)}`; }
function erc20Approve(spender, amount, decimals) { return `0x095ea7b3${encodeAddress(spender)}${encodeUint(amount, decimals)}`; }
function erc721SafeTransfer(from, to, tokenId) { return `0x42842e0e${encodeAddress(from)}${encodeAddress(to)}${padWord(BigInt(tokenId).toString(16))}`; }
function er1155SafeTransfer(from, to, id, amount) { return `0xf242432a${encodeAddress(from)}${encodeAddress(to)}${padWord(BigInt(id).toString(16))}${padWord(BigInt(amount).toString(16))}${padWord('a0'.repeat(0) || '0')}${'0'.repeat(64)}`; }

async function getTokenDecimals(chain, token) {
  const result = await rpc(chain, 'eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  return Number(BigInt(result || '0x12'));
}
async function estimateTx(chain, tx) {
  const gas = await rpc(chain, 'eth_estimateGas', [tx]);
  const gasPrice = await rpc(chain, 'eth_gasPrice');
  const feeWei = BigInt(gas) * BigInt(gasPrice);
  return { gas: BigInt(gas).toString(), gasPrice, fee: fromHex(`0x${feeWei.toString(16)}`), tx };
}

function classifyIntent(text) {
  const t = text.toLowerCase();
  if (/portfolio|balance|holdings|what do i own/.test(t)) return 'portfolio';
  if (/faucet|test eth|testnet gas|get me gas/.test(t)) return 'faucet';
  if (/gas fee|gas cost|fee estimate|how much gas|estimate gas/.test(t)) return 'gas';
  if (/bridge|cross.?chain|move .* to .*chain/.test(t)) return 'bridge';
  if (/swap|exchange|trade .* for/.test(t)) return 'swap';
  if (/stake|lend|borrow|supply|repay|claim|deposit|withdraw/.test(t)) return 'defi';
  if (/nft|erc.?721|erc.?1155|collectible/.test(t)) return 'nft';
  if (/approve|contract|call|mint|wrap|unwrap|deploy/.test(t)) return 'contract';
  if (/send|transfer|pay|give/.test(t)) return 'send';
  return 'command';
}

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
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState('18');
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenRecipient, setTokenRecipient] = useState('');
  const [spender, setSpender] = useState('');
  const [contractTo, setContractTo] = useState('');
  const [contractData, setContractData] = useState('0x');
  const [customValue, setCustomValue] = useState('');
  const [nftStandard, setNftStandard] = useState('721');
  const [nftContract, setNftContract] = useState('');
  const [nftRecipient, setNftRecipient] = useState('');
  const [nftTokenId, setNftTokenId] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

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
    try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.hex }] }); }
    catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: chain.hex, chainName: chain.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer] }] });
    }
  }
  async function refreshWallet() {
    if (!account) return;
    try {
      const balance = await rpc(chain, 'eth_getBalance', [account, 'latest']); setNativeBalance(fromHex(balance));
      const txs = await fetch(`${chain.explorer}/api/v2/addresses/${account}/transactions?filter=validated`).then(r => r.ok ? r.json() : { items: [] });
      setActivity((txs.items || []).slice(0, 10));
      const tokenData = await fetch(`${chain.explorer}/api/v2/addresses/${account}/token-balances`).then(r => r.ok ? r.json() : []);
      setTokens((tokenData || []).filter(t => Number(t.value || 0) > 0).slice(0, 16));
    } catch { setNotice('Wallet data is temporarily unavailable from the public indexer.'); }
  }

  async function estimateGasFor(tx, label = 'Transaction') {
    if (!account) { setNotice('Connect your wallet first.'); return null; }
    try {
      setLoading(true); setStatus('SIMULATING');
      const result = await estimateTx(chain, tx); setGas({ units: result.gas, fee: result.fee, gasPrice: fromHex(result.gasPrice) });
      setStatus('SIMULATION PASSED'); setNotice(`${label}: ${result.gas} gas units · estimated ${result.fee} ETH.`); return result;
    } catch (error) { setStatus('SIMULATION FAILED'); setNotice(error.message || 'Simulation failed.'); return null; }
    finally { setLoading(false); }
  }

  async function sendTransaction(tx, label = 'Transaction') {
    if (!window.ethereum || !account) return connect();
    const estimate = await estimateGasFor(tx, label); if (!estimate) return;
    try {
      setStatus('AWAITING APPROVAL');
      const hash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ ...tx, gas: `0x${BigInt(estimate.gas).toString(16)}` }] });
      setStatus('BROADCAST'); setNotice(`${label} sent: ${shorten(hash, 10, 8)}`);
      setActivity(prev => [{ hash, to: tx.to, status: 'pending', method: label }, ...prev].slice(0, 10));
      return hash;
    } catch (error) { setStatus('READY'); setNotice(error.message || 'Transaction rejected.'); }
  }

  async function sendNative() {
    if (!ADDRESS_RE.test(sendTo) || !sendAmount) { setNotice('Enter a valid recipient and ETH amount.'); return; }
    await sendTransaction({ from: account, to: sendTo, value: toHexAmount(sendAmount) }, 'ETH transfer');
    setSendAmount('');
  }
  async function loadDecimals() {
    if (!ADDRESS_RE.test(tokenAddress)) { setNotice('Enter a valid ERC-20 token contract.'); return; }
    try { setLoading(true); const d = await getTokenDecimals(chain, tokenAddress); setTokenDecimals(String(d)); setNotice(`Token decimals detected: ${d}.`); }
    catch (error) { setNotice(error.message || 'Could not read token decimals.'); } finally { setLoading(false); }
  }
  async function sendToken() {
    if (!ADDRESS_RE.test(tokenAddress) || !ADDRESS_RE.test(tokenRecipient) || !tokenAmount) { setNotice('Enter token contract, recipient and amount.'); return; }
    const tx = { from: account, to: tokenAddress, data: erc20Transfer(tokenRecipient, tokenAmount, Number(tokenDecimals)), value: '0x0' };
    await sendTransaction(tx, 'ERC-20 transfer'); setTokenAmount('');
  }
  async function approveToken() {
    if (!ADDRESS_RE.test(tokenAddress) || !ADDRESS_RE.test(spender) || !tokenAmount) { setNotice('Enter token, spender and amount.'); return; }
    await sendTransaction({ from: account, to: tokenAddress, data: erc20Approve(spender, tokenAmount, Number(tokenDecimals)), value: '0x0' }, 'ERC-20 approval');
  }
  async function simulateContract() {
    if (!account || !ADDRESS_RE.test(contractTo) || !/^0x[0-9a-fA-F]*$/.test(contractData)) { setNotice('Provide a valid contract address and calldata.'); return; }
    await estimateGasFor({ from: account, to: contractTo, data: contractData, value: customValue ? toHexAmount(customValue) : '0x0' }, 'Contract call');
  }
  async function executeContract() {
    if (!ADDRESS_RE.test(contractTo) || !/^0x[0-9a-fA-F]*$/.test(contractData)) { setNotice('Provide a valid contract address and calldata.'); return; }
    await sendTransaction({ from: account, to: contractTo, data: contractData, value: customValue ? toHexAmount(customValue) : '0x0' }, 'Contract call');
  }
  async function executeNft() {
    if (!ADDRESS_RE.test(nftContract) || !ADDRESS_RE.test(nftRecipient) || !nftTokenId) { setNotice('Enter NFT contract, recipient and token ID.'); return; }
    let data;
    if (nftStandard === '721') data = erc721SafeTransfer(account, nftRecipient, nftTokenId);
    else data = er1155SafeTransfer(account, nftRecipient, nftTokenId, 1);
    await sendTransaction({ from: account, to: nftContract, data, value: '0x0' }, `ERC-${nftStandard} transfer`);
  }

  async function fetchQuote() {
    if (!command.trim()) { setNotice('Describe the swap or bridge you want first.'); return; }
    setQuoteLoading(true); setQuote(null);
    try {
      const res = await fetch(`https://li.quest/v1/quote?fromChain=${chain.id}&toChain=${chain.id}&fromToken=0x0000000000000000000000000000000000000000&toToken=0x0000000000000000000000000000000000000000&fromAmount=${toWei(parseAmount(command) || '0.01').toString()}&fromAddress=${account || '0x0000000000000000000000000000000000000000'}`);
      if (!res.ok) throw new Error('No live route is available for this chain pair yet.');
      const data = await res.json(); setQuote(data); setNotice(`Route found via ${data.toolDetails?.name || data.tool || 'aggregator'}.`);
    } catch (error) { setNotice(error.message || 'Live route unavailable.'); }
    finally { setQuoteLoading(false); }
  }

  function applyCommand(text = command) {
    const type = classifyIntent(text);
    if (type === 'portfolio') { setMode('portfolio'); refreshWallet(); return; }
    if (type === 'faucet') { setMode('faucet'); setNotice('Robinhood testnet gas is distributed through the official faucet.'); return; }
    if (type === 'gas') { setAction('send'); setMode('command'); estimateGasForIntent(text); return; }
    setAction(type === 'command' ? 'send' : type); setMode('command');
    const address = parseAddress(text); const amount = parseAmount(text);
    if (address) { setSendTo(address); setTokenRecipient(address); }
    if (amount && type === 'send') setSendAmount(amount);
  }
  async function estimateGasForIntent(text = command) {
    const to = parseAddress(text) || sendTo; const amount = parseAmount(text) || sendAmount;
    if (!account || !ADDRESS_RE.test(to) || !amount) { setNotice('For a live gas estimate, connect a wallet and provide a recipient plus amount.'); return; }
    await estimateGasFor({ from: account, to, value: toHexAmount(amount) }, 'ETH transfer');
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
      <header className="topbar"><div className="top-status"><span className="pulse-dot" /> AGENT ONLINE <b>•</b> NON-CUSTODIAL</div><div className="top-controls"><button className="chain-picker" onClick={() => setChainKey(chainKey === 'robinhood' ? 'robinhoodTestnet' : 'robinhood')}>{chain.testnet ? '◉' : '●'} {chain.name}<small>{chain.testnet ? 'TESTNET' : 'MAINNET'}</small>⌄</button><button className="wallet-button" onClick={connect}>{account ? <><span className="wallet-dot" />{shorten(account)}</> : 'Connect wallet'}</button></div></header>
      <section className="hero-row"><div><div className="eyebrow">ONCHAIN INTENT ENGINE · V2</div><h1>Do more than <em>transact.</em></h1><p>Describe the outcome. KitAgent builds the transaction, checks permissions, estimates gas, simulates the call and lets <strong>you</strong> approve it.</p></div><div className="agent-core"><div className="core-orbit one" /><div className="core-orbit two" /><div className="core-dot" /><span>{status}</span></div></section>
      {mode === 'command' && <>
        <section className="command-grid">
          <div className="command-panel glow-card"><div className="panel-top"><div><label>INTENT COMPOSER</label><small>One sentence. Any supported onchain outcome.</small></div><span className="guard">6 GUARDRAILS ACTIVE</span></div><textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="What do you want KitAgent to do?" /><div className="command-footer"><div className="quick-row">{EXAMPLES.slice(0, 3).map(x => <button key={x} onClick={() => setCommand(x)}>{x}</button>)}</div><button className="execute-intent" onClick={() => applyCommand()} disabled={!command.trim()}>Run <span>↗</span></button></div><div className="intent-reading"><span>DETECTED</span><b>{intentType.toUpperCase()}</b><i /><span>CHAIN</span><b>{chain.name.toUpperCase()}</b><i /><span>CONTROL</span><b>USER-SIGNED</b></div></div>
          <div className="agent-panel glow-card"><div className="panel-top"><div><label>AGENT STATE</label><small>Deterministic safety pipeline</small></div><span className="status-chip">{status}</span></div><div className="pipeline">{['UNDERSTAND','VERIFY','SIMULATE','APPROVE'].map((x,i) => <div key={x} className={status !== 'READY' && i < 3 ? 'stage-live' : ''}><span>{String(i+1).padStart(2,'0')}</span><div><b>{x}</b><small>{['Intent parsed','Balances + permissions','Revert + gas check','Wallet signature'][i]}</small></div><i>{status !== 'READY' && i < 3 ? '✓' : i === 3 && status === 'AWAITING APPROVAL' ? '●' : '—'}</i></div>)}</div><div className="safety"><Icon name="shield" /><div><b>Nothing moves without your signature.</b><small>KitAgent never asks for seed phrases or private keys.</small></div></div></div>
        </section>
        <section className="action-strip">{ACTIONS.map(([key,title,sub,glyph]) => <button key={key} className={action === key ? 'selected' : ''} onClick={() => setAction(key)}><span className="action-glyph">{glyph}</span><div><b>{title}</b><small>{sub}</small></div><span>↗</span></button>)}</section>
        <section className="workbench glow-card"><div className="workbench-head"><div><label>{commandTitle}</label><small>Real wallet execution surface · simulate before signing</small></div><span className="chain-pill">{chain.testnet ? 'TESTNET' : 'LIVE'} · {chain.id}</span></div>
          {action === 'send' && <div className="send-stack"><div className="subtabs"><button className="selected">Native ETH</button><button onClick={() => setAction('contract')}>ERC-20 / approvals</button></div><div className="form-grid"><label>RECIPIENT<input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="0x wallet address" /></label><label>AMOUNT<input value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="0.00 ETH" inputMode="decimal" /></label><div className="form-span"><div className="fee-box"><span>LIVE GAS ESTIMATE</span><b>{gas ? `${gas.fee} ETH` : '—'}</b><small>{gas ? `${gas.units} units · ${gas.gasPrice} gwei` : 'Estimate from current network state'}</small></div><div className="button-row"><button onClick={() => estimateGasForIntent()} disabled={loading}>Estimate gas</button><button className="primary" onClick={sendNative} disabled={loading}>Simulate & Send ↗</button></div></div></div></div>}
          {action === 'swap' && <div className="feature-card"><div className="feature-icon">⇄</div><div><h3>Swap with intent</h3><p>KitAgent can turn a natural-language swap into a quoted route. The execution adapter is deliberately blocked when the selected chain has no verified live route, rather than pretending a quote exists.</p>{quote && <div className="quote-box"><b>{quote.toolDetails?.name || quote.tool || 'Route'}</b><span>{quote.action?.fromAmount || ''} → {quote.action?.toAmount || ''}</span></div>}<div className="route-tags"><span>LIVE QUOTE</span><span>ALLOWANCE</span><span>SIMULATION</span><span>USER APPROVAL</span></div></div><button className="primary" onClick={fetchQuote} disabled={quoteLoading}>{quoteLoading ? 'Finding…' : 'Find route ↗'}</button></div>}
          {action === 'bridge' && <div className="feature-card"><div className="feature-icon">◈</div><div><h3>Bridge across chains</h3><p>Bridge intents are route-first: destination, token, amount, fees and slippage must be known before KitAgent can construct an approval + bridge transaction. Unsupported routes stay blocked.</p><div className="route-tags"><span>DESTINATION</span><span>QUOTE</span><span>RISK CHECK</span><span>USER APPROVAL</span></div></div><button className="primary" onClick={fetchQuote} disabled={quoteLoading}>{quoteLoading ? 'Routing…' : 'Find route ↗'}</button></div>}
          {action === 'defi' && <div className="feature-card"><div className="feature-icon">◌</div><div><h3>DeFi command layer</h3><p>Lending, borrowing, supplying, staking, repaying and claiming are represented as protocol actions. KitAgent requires a verified adapter and decoded calldata before signing.</p><div className="route-tags"><span>PROTOCOL</span><span>ALLOWANCE</span><span>HEALTH CHECK</span><span>SIMULATION</span></div></div><button className="primary" onClick={() => setAction('contract')}>Build verified call ↗</button></div>}
          {action === 'nft' && <div className="form-grid"><label>STANDARD<select value={nftStandard} onChange={e => setNftStandard(e.target.value)}><option value="721">ERC-721</option><option value="1155">ERC-1155</option></select></label><label>NFT CONTRACT<input value={nftContract} onChange={e => setNftContract(e.target.value)} placeholder="0x…" /></label><label>RECIPIENT<input value={nftRecipient} onChange={e => setNftRecipient(e.target.value)} placeholder="0x…" /></label><label>TOKEN ID<input value={nftTokenId} onChange={e => setNftTokenId(e.target.value)} placeholder="123" /></label><div className="form-span button-row"><button className="primary" onClick={executeNft} disabled={loading}>Simulate & Transfer ↗</button></div></div>}
          {action === 'contract' && <div className="contract-suite"><div className="subtabs"><button className="selected">Contract call</button><button onClick={() => setAction('send')}>Native</button></div><div className="form-grid"><label>CONTRACT ADDRESS<input value={contractTo} onChange={e => setContractTo(e.target.value)} placeholder="0x…" /></label><label>ETH VALUE<input value={customValue} onChange={e => setCustomValue(e.target.value)} placeholder="0.00" /></label><label className="form-span">CALLDATA<textarea value={contractData} onChange={e => setContractData(e.target.value)} placeholder="0x…" /></label><div className="form-span"><div className="button-row"><button onClick={simulateContract} disabled={loading}>Simulate call</button><button className="primary" onClick={executeContract} disabled={loading}>Approve & Broadcast ↗</button></div></div></div><div className="token-tools"><div><label>ERC-20 TOKEN</label><input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="Token contract 0x…" /></div><div><label>DECIMALS</label><input value={tokenDecimals} onChange={e => setTokenDecimals(e.target.value)} /></div><button onClick={loadDecimals}>Read decimals</button><div><label>RECIPIENT / SPENDER</label><input value={tokenRecipient} onChange={e => setTokenRecipient(e.target.value)} placeholder="0x…" /></div><div><label>TOKEN AMOUNT</label><input value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} placeholder="25" /></div><div className="button-row"><button onClick={sendToken}>Transfer ERC-20</button><button onClick={approveToken}>Approve spender</button></div></div></div>}
        </section></>}
      {mode === 'portfolio' && <section className="data-page glow-card"><div className="page-head"><div><label>PORTFOLIO</label><h2>Your onchain position</h2><p>{account ? shorten(account, 10, 8) : 'Connect a wallet to load balances.'}</p></div><button onClick={refreshWallet}>Refresh ↻</button></div><div className="portfolio-total"><span>NATIVE BALANCE</span><strong>{nativeBalance} <small>ETH</small></strong><i>{chain.name}</i></div><div className="token-list"><div className="table-head"><span>ASSET</span><span>BALANCE</span><span>CONTRACT</span></div>{tokens.length ? tokens.map((t,i) => <div className="token-row" key={`${t.token?.address || i}-${i}`}><b>{t.token?.symbol || 'TOKEN'}</b><span>{t.value}</span><small>{shorten(t.token?.address || '')}</small></div>) : <div className="empty">No indexed token balances yet.</div>}</div></section>}
      {mode === 'activity' && <section className="data-page glow-card"><div className="page-head"><div><label>ACTIVITY</label><h2>Recent transactions</h2><p>Indexed from the selected network explorer.</p></div><button onClick={refreshWallet}>Refresh ↻</button></div><div className="activity-list">{activity.length ? activity.map((tx,i) => <a key={tx.hash || i} href={`${chain.explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer"><span className="tx-index">{String(i+1).padStart(2,'0')}</span><div><b>{tx.method || tx.name || 'Transaction'}</b><small>{shorten(tx.hash, 12, 10)} · {shorten(tx.to?.hash || tx.to || '')}</small></div><strong>{tx.status || 'confirmed'} ↗</strong></a>) : <div className="empty">Connect a wallet to load indexed activity.</div>}</div></section>}
      {mode === 'faucet' && <section className="data-page glow-card faucet-page"><div className="page-head"><div><label>GAS STATION</label><h2>Never get stranded on testnet.</h2><p>KitAgent detects testnet gas intent and routes you to the official Robinhood Chain faucet.</p></div><span className="big-orb">ϟ</span></div><div className="faucet-grid"><div><span>NETWORK</span><b>Robinhood Chain Testnet</b><small>Chain ID 46630 · ETH gas</small></div><div><span>YOUR ADDRESS</span><b>{account ? shorten(account, 12, 10) : 'Connect wallet first'}</b><small>Use your wallet address at the faucet.</small></div><div><span>LIVE BALANCE</span><b>{chain.testnet ? nativeBalance : 'Switch to testnet'}</b><small>Test ETH has no monetary value.</small></div></div><div className="faucet-actions"><button className="primary" onClick={() => { setChainKey('robinhoodTestnet'); setNotice('Robinhood Testnet selected. Claim test ETH from the official faucet.'); }}>Use Robinhood Testnet</button><a className="button-link" href="https://faucet.testnet.chain.robinhood.com" target="_blank" rel="noreferrer">Open official faucet ↗</a></div><div className="faucet-note"><Icon name="shield" /><span><b>Gas sponsorship ready by architecture.</b> Sponsored transactions require a funded ERC-4337 bundler/paymaster. KitAgent remains non-custodial and never holds signing keys.</span></div></section>}
      <div className="bottom-console"><div><span className="console-dot" /> {chain.testnet ? 'TEST ENVIRONMENT' : 'LIVE NETWORK'} · RPC</div><div>ETH GAS · <b>{gas ? `${gas.fee} ETH` : 'ON DEMAND'}</b></div><div>EXPLORER · <b>INDEXED</b></div><div>USER CONTROL · <b>100%</b></div></div>
    </main>
    {notice && <button className="notice" onClick={() => setNotice('')}><span>AGENT</span>{notice}<b>×</b></button>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
