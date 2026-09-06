import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';

export const nativeTransferAdapter = createAdapter({
  id: 'native-eth',
  name: 'Robinhood Chain ETH transfers',
  capabilities: ['native-transfer'],
  prepare: async ({ from, to, amountWei }) => {
    if (!from || !/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('A valid sender and recipient are required.');
    const value = BigInt(amountWei);
    if (value <= 0n) throw new Error('Transfer amount must be greater than zero.');
    return createPlan({
      adapter: 'native-eth',
      title: 'Send ETH',
      from,
      transactions: [{ to, value }],
      expectedChanges: [`Decrease sender balance by ${value} wei`, `Increase ${to} balance by ${value} wei`],
      risk: ['ETH transfer is irreversible once confirmed on-chain.', 'Review the recipient address and amount before signing.'],
      metadata: { asset: 'ETH', amountWei: value.toString() },
    });
  },
});
