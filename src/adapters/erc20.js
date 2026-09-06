import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';

// Generic ERC-20 transfer/approve adapter. Protocol-specific adapters can compose this safely.
const encodeUint256 = (value) => BigInt(value).toString(16).padStart(64, '0');
const encodeAddress = (address) => address.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export const tokenAdapter = createAdapter({
  id: 'erc20',
  name: 'ERC-20 wallet actions',
  capabilities: ['token-transfer', 'token-approve'],
  prepare: async ({ from, token, to, amount, mode = 'transfer' }) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error('Token and recipient addresses are required.');
    const selector = mode === 'approve' ? '095ea7b3' : 'a9059cbb';
    const data = `0x${selector}${encodeAddress(to)}${encodeUint256(amount)}`;
    return createPlan({
      adapter: 'erc20',
      title: mode === 'approve' ? 'Approve token spending' : 'Transfer ERC-20 tokens',
      from,
      transactions: [{ to: token, data }],
      expectedChanges: [mode === 'approve' ? `Approve ${amount} units for ${to}` : `Send ${amount} token units to ${to}`],
      risk: ['Token contract and amount must be reviewed before signing.'],
      metadata: { token, to, amount: String(amount), mode },
    });
  },
});
