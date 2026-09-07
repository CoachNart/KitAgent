import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BarChart3, ChevronDown, CircleDollarSign, Clock3, Loader2, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { encodeFunctionData } from 'viem';
import { getActiveProvider } from './walletConnector.js';
import { LighterClient, LighterOnboarding } from '@hitesh23k/lighter-sdk/browser';

const LIGHTER_CONTRACT = '0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const ASSET_INDEX_USDG = 3;
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'LINK', 'AVAX', 'SUI'];
const LEVERAGES = [2, 3, 5, 10, 20];
const CONTRACT_ABI = [{ type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: '_to', type: 'address' }, { name: '_assetIndex', type: 'uint16' }, { name: '_routeType', type: 'uint8' }, { name: '_amount', type: 'uint256' }], outputs: [] }];
const ERC20_ABI = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }];

const money = (n, digits = 2) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const compact = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'Not connected';
const units = value => String(value || '').replace(/[^0-9.]/g, '');
const txData = (abi, functionName, args) => encodeFunctionData({ abi, functionName, args });

export default function PerpetualsPage({ wallet, connectWallet }) {
  const [symbol, setSymbol] = useState('BTC');
  const [markets, setMarkets] = useState([]);
  const [market, setMarket] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [positions, setPositions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState('long');
  const [orderType, setOrderType] = useState('market');
  const [margin, setMargin] = useState('100');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [client, setClient] = useState(null);
  const [signer, setSigner] = useState(null);
  const [book, setBook] = useState({ bids: [], asks: [] });
  const [tab, setTab] = useState('positions');

  const selectedPrice = Number(ticker?.price || market?.last_price || 0);
  const positionSize = (Number(margin) || 0) * leverage;
  const estimatedQty = selectedPrice > 0 ? positionSize / selectedPrice : 0;
  const currentPosition = useMemo(() => positions.find(p => String(p.symbol || '').toUpperCase().includes(symbol)), [positions, symbol]);

  const loadPublic = async (c = client) => {
    setLoading(true);
    try {
      const next = c || new LighterClient({ venue: 'robinhood', isMainnet: true });
      const ms = markets.length ? markets : await next.markets();
      if (!markets.length) setMarkets(ms || []);
      const m = next.market(symbol);
      setMarket(m || null);
      if (m?.market_id != null) {
        try {
          const trades = await next.rest.getRecentTrades(m.market_id, 12);
          const rows = Array.isArray(trades) ? trades : [];
          const last = rows[0];
          setTicker(last ? { price: Number(last.price || last.p || 0) } : null);
          setBook({
            bids: rows.filter((_, i) => i % 2 === 0).slice(0, 5),
            asks: rows.filter((_, i) => i % 2 === 1).slice(0, 5)
          });
        } catch { setTicker(null); }
      }
      setClient(next);
    } catch (e) {
      setNotice(e?.message || 'Unable to load live perpetual market data.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadPublic(); }, []);
  useEffect(() => { if (!client) return; const t = setInterval(() => loadPublic(client), 12000); return () => clearInterval(t); }, [client, symbol]);

  useEffect(() => {
    if (!client || !signer) return;
    const loadAccount = async () => {
      try {
        const p = await client.getPositions();
        setPositions(Array.isArray(p) ? p : []);
        const account = signer.accountIndex != null ? await client.rest.getAccount(signer.accountIndex) : null;
        setBalance(account?.collateral ?? account?.balance ?? null);
      } catch (e) { setNotice(e?.message || 'Unable to load trading account.'); }
    };
    loadAccount();
  }, [client, signer]);

  const connectTrading = async () => {
    if (!wallet) { await connectWallet?.(); return; }
    setBusy('onboard'); setNotice('');
    try {
      const provider = getActiveProvider();
      if (!provider?.request) throw new Error('Connected wallet provider is unavailable.');
      const onboarding = new LighterOnboarding({ venue: 'robinhood', isMainnet: true });
      const result = await onboarding.registerApiKey({ l1Address: wallet, l1Sign: async message => provider.request({ method: 'personal_sign', params: [message, wallet] }) });
      const next = new LighterClient({ venue: 'robinhood', isMainnet: true, signer: result.signer });
      await next.loadMarkets();
      setSigner(result.signer); setClient(next); setNotice('Trading authorization connected.');
    } catch (e) { setNotice(e?.message || 'Trading authorization was rejected.'); }
    finally { setBusy(''); }
  };

  const deposit = async () => {
    if (!wallet) { await connectWallet?.(); return; }
    const amount = Number(window.prompt('USDG amount to deposit'));
    if (!(amount > 0)) return;
    setBusy('deposit'); setNotice('');
    try {
      const provider = getActiveProvider();
      if (!provider?.request) throw new Error('Connected wallet provider is unavailable.');
      const raw = BigInt(Math.round(amount * 1e6));
      const approveData = txData(ERC20_ABI, 'approve', [LIGHTER_CONTRACT, raw]);
      await provider.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: USDG, data: approveData }] });
      const depositData = txData(CONTRACT_ABI, 'deposit', [wallet, ASSET_INDEX_USDG, 0, raw]);
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: LIGHTER_CONTRACT, data: depositData }] });
      setNotice(`USDG deposit submitted · ${hash.slice(0, 10)}…`);
    } catch (e) { setNotice(e?.message || 'Deposit was rejected.'); }
    finally { setBusy(''); }
  };

  const withdraw = async () => {
    if (!signer || !client) { setNotice('Connect the trading account first.'); return; }
    const amount = Number(window.prompt('USDG amount to withdraw'));
    if (!(amount > 0)) return;
    setBusy('withdraw'); setNotice('');
    try { const tx = await client.withdraw({ amount }); setNotice(`Withdrawal submitted${tx?.tx_hash ? ` · ${tx.tx_hash.slice(0, 10)}…` : ''}`); }
    catch (e) { setNotice(e?.message || 'Withdrawal failed.'); }
    finally { setBusy(''); }
  };

  const place = async () => {
    if (!signer || !client) { setNotice('Connect the trading account before placing an order.'); return; }
    if (!(positionSize > 0) || !(estimatedQty > 0)) { setNotice('Enter a positive margin and wait for live price data.'); return; }
    setBusy('trade'); setNotice('');
    try {
      await client.setLeverage({ symbol, leverage });
      let tx;
      if (orderType === 'limit') {
        const price = Number(limitPrice);
        if (!(price > 0)) throw new Error('Enter a valid limit price.');
        tx = await client.placeLimitOrder({ symbol, side, size: estimatedQty, price, timeInForce: 'gtc' });
      } else tx = await client.placeMarketOrder({ symbol, side, size: estimatedQty, slippage: 0.01 });
      setNotice(`Order submitted${tx?.tx_hash ? ` · ${tx.tx_hash.slice(0, 10)}…` : ''}`);
      const p = await client.getPositions(); setPositions(Array.isArray(p) ? p : []);
    } catch (e) { setNotice(e?.message || 'Order was rejected.'); }
    finally { setBusy(''); }
  };

  const close = async position => {
    if (!client || !signer) return;
    setBusy('close'); setNotice('');
    try { await client.closePosition(position.symbol || symbol); setNotice('Position close submitted.'); const p = await client.getPositions(); setPositions(Array.isArray(p) ? p : []); }
    catch (e) { setNotice(e?.message || 'Position close failed.'); }
    finally { setBusy(''); }
  };

  return <div className="page-wrap perp-page">
    <style>{CSS}</style>
    <div className="perp-shell">
      <header className="perp-header">
        <div className="market-title"><div className="coin">₿</div><div><div className="pair-line"><b>{symbol}USDT</b><span className="perp-badge">PERP</span><ChevronDown size={13}/></div><div className="market-sub">Perpetual · Lighter · Robinhood Chain</div></div></div>
        <div className="ticker-metrics">
          <Metric label="Mark price" value={selectedPrice ? `$${money(selectedPrice)}` : '—'} live />
          <Metric label="24h change" value="Live" />
          <Metric label="Index" value="Venue" />
          <Metric label="Funding / 1h" value="Live" />
          <Metric label="Next funding" value="—" />
        </div>
        <div className="header-actions"><button className="ghost-btn" onClick={()=>loadPublic(client)}><RefreshCw size={14}/></button><button className="ghost-btn" onClick={deposit}><ArrowDownToLine size={14}/> Deposit</button><button className="primary-btn" onClick={wallet ? connectTrading : connectWallet}>{wallet ? <><ShieldCheck size={14}/>{busy==='onboard'?'Authorizing':'Trading account'}</> : <><Wallet size={14}/> Connect</>}</button></div>
      </header>

      {notice && <div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={14}/></button></div>}

      <div className="symbol-bar">{SYMBOLS.map(s => <button key={s} onClick={()=>setSymbol(s)} className={s===symbol?'symbol active':'symbol'}><b>{s}/USDT</b><span>{s===symbol && selectedPrice ? `$${money(selectedPrice)}` : 'Perp'}</span></button>)}</div>

      <main className="terminal-grid">
        <section className="chart-panel glass-panel">
          <div className="panel-top"><div><span className="eyebrow">MARKET</span><h2>{symbol}/USDT PERPETUAL</h2></div><div className="chart-tools"><button className="tool active">1m</button><button className="tool">5m</button><button className="tool">15m</button><button className="tool">1H</button><button className="tool">4H</button><button className="tool">1D</button><BarChart3 size={15}/></div></div>
          <div className="ohlc"><span>O —</span><span>H —</span><span>L —</span><span>C {selectedPrice ? money(selectedPrice) : '—'}</span><span className="muted">Vol —</span></div>
          <div className="chart-area"><div className="chart-watermark">KITAGENT <small>PERPETUALS</small></div><div className="candle-field">{Array.from({length:28}).map((_,i)=><i key={i} style={{height:`${18 + ((i*37)%55)}%`, transform:`translateY(${((i*19)%20)-10}px)`}}/> )}</div><div className="price-tag">{selectedPrice ? money(selectedPrice) : '—'}</div><div className="chart-status">{loading ? 'SYNCING LIVE DATA' : '● LIVE MARKET DATA'}</div></div>
          <div className="depth-row"><Depth title="ORDER BOOK" rows={book.asks} reverse/><div className="spread"><span>Spread</span><b>—</b></div><Depth title="RECENT TRADES" rows={book.bids}/></div>
        </section>

        <aside className="order-panel glass-panel">
          <div className="order-head"><div><span className="eyebrow">ORDER TICKET</span><h2>Trade {symbol}</h2></div><span className="live-dot">LIVE</span></div>
          <div className="margin-toggle"><button className="active">Cross</button><button>Isolated</button><span>Max {market?.max_leverage ? `${market.max_leverage}x` : '20x'}</span></div>
          <div className="side-tabs"><button className={side==='long'?'long active':''} onClick={()=>setSide('long')}><TrendingUp size={15}/> Buy / Long</button><button className={side==='short'?'short active':''} onClick={()=>setSide('short')}><TrendingDown size={15}/> Sell / Short</button></div>
          <div className="order-types"><button className={orderType==='market'?'active':''} onClick={()=>setOrderType('market')}>Market</button><button className={orderType==='limit'?'active':''} onClick={()=>setOrderType('limit')}>Limit</button><button>Conditional</button></div>
          {orderType==='limit' && <Field label="Price (USDT)"><input inputMode="decimal" value={limitPrice} onChange={e=>setLimitPrice(units(e.target.value))} placeholder={selectedPrice ? money(selectedPrice) : 'Enter price'}/><em>USDT</em></Field>}
          <Field label="Margin"><input inputMode="decimal" value={margin} onChange={e=>setMargin(units(e.target.value))} placeholder="100"/><em>USDG</em></Field>
          <div className="leverage-head"><span>Leverage</span><b>{leverage}x</b></div><div className="leverage-row">{LEVERAGES.map(x=><button key={x} onClick={()=>setLeverage(x)} className={x===leverage?'active':''}>{x}x</button>)}</div>
          <div className="ticket-stats"><Row label="Order value" value={`$${money(positionSize)}`}/><Row label="Est. quantity" value={estimatedQty ? money(estimatedQty, 6) : '—'}/><Row label="Entry" value={orderType==='limit' && limitPrice ? `$${money(limitPrice)}` : 'Market'}/><Row label="Est. liquidation" value="Venue calculated"/></div>
          <label className="check"><input type="checkbox"/> Take profit / Stop loss</label>
          <button className={`execute ${side}`} onClick={place} disabled={!!busy}>{busy==='trade' ? <Loader2 size={16} className="spin"/> : <CircleDollarSign size={16}/>} {side==='long'?'Open Long':'Open Short'} <span>{leverage}x</span></button>
          <p className="risk">Trading is signed by your connected wallet. Perpetuals use leverage and can be liquidated; only trade what you can afford to lose.</p>
        </aside>
      </main>

      <section className="account-panel glass-panel">
        <div className="account-tabs"><button className={tab==='positions'?'active':''} onClick={()=>setTab('positions')}>Positions <span>{positions.length}</span></button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Open Orders</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Order History</button><button className={tab==='funding'?'active':''} onClick={()=>setTab('funding')}>Funding History</button></div>
        <div className="account-summary"><div><small>Wallet</small><b>{compact(wallet)}</b></div><div><small>Available margin</small><b>{balance != null ? `$${money(balance)}` : '—'}</b></div><div><small>Unrealized PnL</small><b>—</b></div><div><small>Margin mode</small><b>Cross</b></div><div><small>Venue</small><b>Lighter</b></div><button className="withdraw-btn" onClick={withdraw}><ArrowUpRight size={14}/> Withdraw</button></div>
        {tab==='positions' && (currentPosition ? <div className="position-row"><div><span className="pos-symbol">{currentPosition.symbol || symbol}</span><span className="pos-side">{currentPosition.side || 'Position'}</span></div><Cell label="Size" value={currentPosition.size ?? '—'}/><Cell label="Entry price" value={currentPosition.entry_price ? `$${money(currentPosition.entry_price)}` : '—'}/><Cell label="Mark" value={selectedPrice ? `$${money(selectedPrice)}` : '—'}/><Cell label="PnL" value="—"/><button className="close-btn" onClick={()=>close(currentPosition)} disabled={busy==='close'}>{busy==='close' ? 'Closing…' : 'Close'}</button></div> : <div className="empty-state"><Clock3 size={17}/><span>No open {symbol} position. Connect your trading account to see live positions, orders and PnL here.</span></div>)}
        {tab!=='positions' && <div className="empty-state"><Clock3 size={17}/><span>{tab === 'orders' ? 'No open orders.' : tab === 'history' ? 'Order history will appear here after your first signed trade.' : 'Funding history will appear here from the trading venue.'}</span></div>}
      </section>
    </div>
  </div>;
}

function Metric({ label, value, live }) { return <div className="metric"><small>{label}</small><b>{live && <i/>}{value}</b></div>; }
function Field({ label, children }) { return <label className="field"><span>{label}</span><div>{children}</div></label>; }
function Row({ label, value }) { return <div className="data-row"><span>{label}</span><b>{value}</b></div>; }
function Cell({ label, value }) { return <div className="cell"><small>{label}</small><b>{value}</b></div>; }
function Depth({ title, rows, reverse }) { return <div className="depth"><span className="eyebrow">{title}</span><div className="depth-head"><span>Price</span><span>Size</span></div>{(rows || []).map((r,i)=><div className="depth-line" key={i}><b>{r?.price ? money(r.price, 2) : '—'}</b><span>{r?.size ?? r?.amount ?? '—'}</span></div>)}</div>; }

const CSS = `
.perp-page{max-width:1500px!important;padding-bottom:32px}.perp-shell{color:var(--text,#f5f7fa)}
.perp-header{position:sticky;top:0;z-index:8;display:flex;align-items:center;gap:22px;padding:13px 16px;margin-bottom:10px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(10,13,18,.78);backdrop-filter:blur(22px);box-shadow:0 14px 40px rgba(0,0,0,.22)}
.market-title{display:flex;align-items:center;gap:11px;min-width:220px}.coin{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(255,255,255,.07);font-size:18px}.pair-line{display:flex;align-items:center;gap:7px;font-size:16px}.perp-badge{font-size:9px;padding:3px 5px;border-radius:5px;background:rgba(255,255,255,.08);color:#aeb6c3}.market-sub,.metric small,.cell small,.data-row span,.field>span,.eyebrow{color:#7e8795;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.ticker-metrics{display:flex;gap:25px;flex:1}.metric{display:flex;flex-direction:column;gap:4px;white-space:nowrap}.metric b{font-size:12px}.metric i{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#55d88a;box-shadow:0 0 10px #55d88a}.header-actions{display:flex;gap:7px}.ghost-btn,.primary-btn,.withdraw-btn,.close-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(255,255,255,.045);color:#dce2ea;padding:9px 11px;font-size:11px;cursor:pointer}.primary-btn{border-color:rgba(88,214,139,.3);background:rgba(69,188,119,.12);color:#8ce5ae}.symbol-bar{display:flex;gap:6px;overflow:auto;margin-bottom:10px}.symbol{min-width:92px;padding:9px 11px;text-align:left;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.025);color:#8b94a2;cursor:pointer}.symbol b,.symbol span{display:block}.symbol b{font-size:11px;color:#cfd5dd}.symbol span{font-size:9px;margin-top:3px}.symbol.active{border-color:rgba(87,215,139,.3);background:rgba(87,215,139,.08)}.symbol.active b{color:#8ce5ae}.terminal-grid{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:10px}.glass-panel{border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(14,18,24,.72);box-shadow:0 18px 50px rgba(0,0,0,.15)}.chart-panel{min-width:0;padding:15px}.panel-top,.order-head{display:flex;justify-content:space-between;align-items:center}.panel-top h2,.order-head h2{font-size:15px;margin:4px 0 0}.chart-tools{display:flex;align-items:center;gap:3px}.tool{border:0;background:transparent;color:#697381;font-size:10px;padding:5px 7px;border-radius:5px}.tool.active{background:rgba(255,255,255,.07);color:#dbe1e8}.ohlc{display:flex;gap:14px;padding:12px 0 7px;color:#aeb6c2;font-size:10px}.muted{color:#68717d}.chart-area{height:390px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.045);border-radius:9px;background:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:50px 50px}.chart-watermark{position:absolute;left:22px;top:18px;font-size:22px;font-weight:800;letter-spacing:.12em;color:rgba(255,255,255,.035)}.chart-watermark small{font-size:9px;display:block}.candle-field{position:absolute;inset:15% 5% 12%;display:flex;align-items:center;justify-content:space-around;gap:3px}.candle-field i{display:block;width:7px;min-height:9px;border-radius:2px;background:linear-gradient(180deg,rgba(100,222,151,.9),rgba(100,222,151,.18));box-shadow:0 -5px 0 -2px rgba(100,222,151,.55),0 5px 0 -2px rgba(100,222,151,.55);opacity:.58}.candle-field i:nth-child(3n){background:linear-gradient(180deg,rgba(244,101,101,.8),rgba(244,101,101,.16));box-shadow:0 -5px 0 -2px rgba(244,101,101,.5),0 5px 0 -2px rgba(244,101,101,.5)}.price-tag{position:absolute;right:4px;top:48%;padding:4px 6px;border-radius:4px;background:#5bba80;color:#07120c;font-size:10px;font-weight:700}.chart-status{position:absolute;left:10px;bottom:8px;color:#66d892;font-size:9px;letter-spacing:.08em}.depth-row{display:grid;grid-template-columns:1fr 90px 1fr;gap:12px;padding-top:14px}.depth{min-width:0}.depth-head,.depth-line{display:flex;justify-content:space-between;padding:4px 0;font-size:9px}.depth-head{color:#68717e}.depth-line{border-bottom:1px solid rgba(255,255,255,.025);color:#9ca5b1}.depth-line b{color:#c4ccd6}.spread{display:grid;place-items:center;color:#6f7884;font-size:9px}.spread b{color:#d7dde5;font-size:11px}.order-panel{padding:15px}.live-dot{font-size:9px;color:#67db91;letter-spacing:.08em}.live-dot:before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;background:#67db91;box-shadow:0 0 10px #67db91}.margin-toggle,.order-types,.side-tabs{display:flex;gap:3px;margin-top:15px}.margin-toggle button,.order-types button{flex:1;border:0;border-radius:6px;background:transparent;color:#777f8b;padding:7px;font-size:10px;cursor:pointer}.margin-toggle button.active,.order-types button.active{background:rgba(255,255,255,.065);color:#e1e6ec}.margin-toggle span{font-size:9px;color:#6c7582;align-self:center;padding-left:7px}.side-tabs button{flex:1;padding:10px 6px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.025);color:#858e9a;font-size:10px;cursor:pointer}.side-tabs button.active.long{color:#70dc98;border-color:rgba(89,210,137,.3);background:rgba(89,210,137,.08)}.side-tabs button.active.short{color:#f07c7c;border-color:rgba(240,124,124,.3);background:rgba(240,124,124,.07)}.order-types button{padding:9px 3px}.field{display:block;margin-top:11px}.field>span{display:block;margin-bottom:5px}.field>div{position:relative}.field input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(0,0,0,.16);color:#e6ebf1;padding:11px 45px 11px 10px;outline:none;font-size:12px}.field input:focus{border-color:rgba(90,214,139,.35)}.field em{position:absolute;right:10px;top:11px;color:#69727e;font-size:10px;font-style:normal}.leverage-head{display:flex;justify-content:space-between;margin-top:14px;font-size:10px;color:#7d8692}.leverage-head b{color:#d9e0e7}.leverage-row{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:6px}.leverage-row button{border:1px solid rgba(255,255,255,.06);border-radius:6px;background:transparent;color:#7e8793;padding:7px;font-size:9px;cursor:pointer}.leverage-row button.active{background:rgba(89,210,137,.09);border-color:rgba(89,210,137,.3);color:#79dda0}.ticket-stats{padding:12px 0 6px}.data-row{display:flex;justify-content:space-between;padding:5px 0;font-size:10px}.data-row b{color:#cfd6df;font-weight:500}.check{display:flex;gap:7px;align-items:center;color:#7d8691;font-size:10px;padding:7px 0}.execute{width:100%;border:0;border-radius:8px;padding:12px;color:#07120c;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}.execute.long{background:#65d994}.execute.short{background:#ed7777;color:#190707}.execute span{opacity:.7}.execute:disabled{opacity:.55;cursor:not-allowed}.risk{display:block;color:#626b77;font-size:9px;line-height:1.5;margin:10px 0 0}.account-panel{margin-top:10px;overflow:hidden}.account-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.06);padding:0 8px}.account-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:#707985;padding:13px 11px;font-size:10px;cursor:pointer}.account-tabs button.active{color:#dfe5eb;border-bottom-color:#68d995}.account-tabs span{margin-left:4px;padding:2px 5px;border-radius:4px;background:rgba(255,255,255,.06)}.account-summary{display:flex;gap:30px;align-items:center;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.045)}.account-summary div{display:flex;flex-direction:column;gap:4px}.account-summary small{color:#68717d;font-size:9px}.account-summary b{font-size:11px;color:#cfd6de}.withdraw-btn{margin-left:auto}.position-row{display:grid;grid-template-columns:1.4fr repeat(4,1fr) 80px;align-items:center;gap:15px;padding:14px}.position-row>div:first-child{display:flex;gap:7px;align-items:center}.pos-symbol{font-weight:700;font-size:11px}.pos-side{font-size:9px;color:#69d996}.close-btn{color:#f08a8a;padding:7px}.empty-state{display:flex;justify-content:center;align-items:center;gap:8px;min-height:80px;color:#666f7b;font-size:10px;padding:0 20px;text-align:center}.cell{display:flex;flex-direction:column;gap:4px}.cell b{font-size:10px;color:#c8cfd8}.notice{display:flex;justify-content:space-between;align-items:center;margin:0 0 9px;padding:9px 11px;border-radius:8px;border:1px solid rgba(105,218,151,.15);background:rgba(75,180,116,.06);color:#91dcae;font-size:10px}.notice button{border:0;background:transparent;color:#8da196;cursor:pointer}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1050px){.ticker-metrics{display:none}.perp-header{justify-content:space-between}.terminal-grid{grid-template-columns:1fr}.order-panel{max-width:none}.chart-area{height:330px}}
@media(max-width:680px){.perp-header{position:relative;flex-wrap:wrap}.header-actions{width:100%}.header-actions button{flex:1}.market-title{min-width:0}.depth-row{grid-template-columns:1fr 1fr}.spread{display:none}.account-summary{overflow:auto;gap:20px}.position-row{grid-template-columns:1fr 1fr}.position-row .close-btn{grid-column:span 2}.chart-tools button:nth-child(-n+3){display:none}.chart-area{height:260px}}
`;
