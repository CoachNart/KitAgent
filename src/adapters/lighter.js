import { createAdapter } from '../engine/adapterRegistry.js';
import { initLighterSigner, LighterClient, LighterOnboarding } from '@hitesh23k/lighter-sdk/browser';
import wasmUrl from '@hitesh23k/lighter-sdk/lighterSigner.wasm?url';
import wasmExecUrl from '@hitesh23k/lighter-sdk/wasm_exec.js?url';

const CHAIN_ID = 4663;
const STORAGE_KEY = 'kitagent:lighter-credentials:v1';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
let signerReady = false;
const ensureSigner = () => { if (!signerReady) { initLighterSigner({ wasmUrl, wasmExecUrl }); signerReady = true; } };
const loadCredentials = (wallet) => { try { const raw = sessionStorage.getItem(`${STORAGE_KEY}:${wallet.toLowerCase()}`); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const saveCredentials = (wallet, value) => sessionStorage.setItem(`${STORAGE_KEY}:${wallet.toLowerCase()}`, JSON.stringify(value));

export const lighterAdapter = createAdapter({
  id: 'lighter', name: 'Lighter perpetuals on Robinhood Chain',
  capabilities: ['lighter-onboarding', 'lighter-market-order', 'lighter-limit-order', 'lighter-cancel-order', 'lighter-leverage', 'lighter-position-close'], chains: [CHAIN_ID],
  prepare: async ({ from, provider, operation = 'status', symbol, side, size, price, leverage, orderIndex, slippage }) => {
    if (!ADDRESS.test(from || '')) throw new Error('A valid Robinhood Chain wallet is required.');
    if (!provider?.request) throw new Error('A connected wallet provider is required for Lighter onboarding.');
    return { adapter: 'lighter', kind: 'lighter-order', title: `Lighter ${operation}`, from, chainId: CHAIN_ID, operation, symbol: symbol?.toUpperCase(), side, size, price, leverage, orderIndex, slippage, credentials: loadCredentials(from), status: loadCredentials(from) ? 'ready' : 'requires-wallet-key-authorization', risk: ['Lighter uses a protocol-specific trading key separate from the EVM wallet key.', 'The wallet authorizes that trading key once; subsequent orders are signed with the Lighter key.', 'Review symbol, direction, size, leverage and price before approving.'] };
  },
  execute: async (plan, { from, provider }) => {
    ensureSigner();
    let credentials = plan.credentials || loadCredentials(from);
    if (!credentials) {
      const onboarding = new LighterOnboarding({ venue: 'robinhood', isMainnet: true });
      const pending = await onboarding.prepareApiKey({ l1Address: from });
      const signature = await provider.request({ method: 'personal_sign', params: [pending.messageToSign, from] });
      const registered = await onboarding.submitApiKey(pending, signature);
      credentials = registered.signer || registered;
      saveCredentials(from, credentials);
    }
    const client = new LighterClient({ venue: 'robinhood', isMainnet: true, signer: credentials });
    await client.loadMarkets();
    if (plan.operation === 'status') return { status: 'ready', protocol: 'lighter', venue: 'robinhood', chainId: CHAIN_ID };
    if (plan.operation === 'market-order') return { status: 'verified', protocol: 'lighter', result: await client.placeMarketOrder({ symbol: plan.symbol, side: plan.side, size: Number(plan.size), slippage: plan.slippage == null ? undefined : Number(plan.slippage) }) };
    if (plan.operation === 'limit-order') return { status: 'verified', protocol: 'lighter', result: await client.placeLimitOrder({ symbol: plan.symbol, side: plan.side, size: Number(plan.size), price: Number(plan.price) }) };
    if (plan.operation === 'cancel-order') return { status: 'verified', protocol: 'lighter', result: await client.cancelOrder(plan.symbol, Number(plan.orderIndex)) };
    if (plan.operation === 'leverage') return { status: 'verified', protocol: 'lighter', result: await client.setLeverage({ symbol: plan.symbol, leverage: Number(plan.leverage) }) };
    if (plan.operation === 'close-position') return { status: 'verified', protocol: 'lighter', result: await client.closePosition(plan.symbol) };
    throw new Error(`Unsupported Lighter operation: ${plan.operation}`);
  },
});
