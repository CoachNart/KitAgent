import { createAdapter } from '../engine/adapterRegistry.js';

const CHAIN_ID = 4663;
const STORAGE_KEY = 'kitagent:lighter-credentials:v1';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

let sdkPromise;
const sdk = async () => {
  if (!sdkPromise) sdkPromise = import('@hitesh23k/lighter-sdk');
  return sdkPromise;
};

const loadCredentials = (wallet) => {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}:${wallet.toLowerCase()}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const saveCredentials = (wallet, value) => sessionStorage.setItem(`${STORAGE_KEY}:${wallet.toLowerCase()}`, JSON.stringify(value));

export const lighterAdapter = createAdapter({
  id: 'lighter',
  name: 'Lighter perpetuals on Robinhood Chain',
  capabilities: ['lighter-onboarding', 'lighter-market-order', 'lighter-limit-order', 'lighter-cancel-order', 'lighter-leverage', 'lighter-position-close'],
  chains: [CHAIN_ID],
  prepare: async ({ from, provider, operation = 'status', symbol, side, size, price, leverage, orderIndex, slippage }) => {
    if (!ADDRESS.test(from || '')) throw new Error('A valid Robinhood Chain wallet is required.');
    if (!provider?.request) throw new Error('A connected wallet provider is required for Lighter onboarding.');
    const credentials = loadCredentials(from);
    return {
      adapter: 'lighter',
      kind: 'lighter-order',
      title: `Lighter ${operation}`,
      from,
      chainId: CHAIN_ID,
      operation,
      symbol: symbol?.toUpperCase(),
      side,
      size,
      price,
      leverage,
      orderIndex,
      slippage,
      credentials,
      status: credentials ? 'ready' : 'requires-wallet-key-authorization',
      risk: ['Lighter uses a protocol-specific trading key separate from the EVM wallet key.', 'The wallet authorizes that trading key once; subsequent orders are signed with the Lighter key.', 'Review symbol, direction, size, leverage and price before approving.'],
    };
  },
  execute: async (plan, { from, provider }) => {
    const { LighterClient, LighterOnboarding } = await sdk();
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

    if (plan.operation === 'status') return { status: 'ready', venue: 'robinhood', chainId: CHAIN_ID };
    if (plan.operation === 'market-order') {
      if (!plan.symbol || !plan.side || !plan.size) throw new Error('Lighter market order requires symbol, side and size.');
      const result = await client.placeMarketOrder({ symbol: plan.symbol, side: plan.side, size: Number(plan.size), slippage: plan.slippage == null ? undefined : Number(plan.slippage) });
      return { status: 'verified', protocol: 'lighter', result };
    }
    if (plan.operation === 'limit-order') {
      if (!plan.symbol || !plan.side || !plan.size || !plan.price) throw new Error('Lighter limit order requires symbol, side, size and price.');
      const result = await client.placeLimitOrder({ symbol: plan.symbol, side: plan.side, size: Number(plan.size), price: Number(plan.price) });
      return { status: 'verified', protocol: 'lighter', result };
    }
    if (plan.operation === 'cancel-order') {
      if (plan.orderIndex == null) throw new Error('Lighter order index is required.');
      const result = await client.cancelOrder(plan.symbol, Number(plan.orderIndex));
      return { status: 'verified', protocol: 'lighter', result };
    }
    if (plan.operation === 'leverage') {
      const result = await client.setLeverage({ symbol: plan.symbol, leverage: Number(plan.leverage) });
      return { status: 'verified', protocol: 'lighter', result };
    }
    if (plan.operation === 'close-position') {
      const result = await client.closePosition(plan.symbol);
      return { status: 'verified', protocol: 'lighter', result };
    }
    throw new Error(`Unsupported Lighter operation: ${plan.operation}`);
  },
});
