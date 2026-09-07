import {
  encodeTransfer,
  getDecimals,
  getTokenBalance,
  parseUnits,
  formatUnits,
} from '../erc20.js';

import { sendToken, waitForReceipt } from '../transactions.js';

function validAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function prepareTokenTransfer({
  from,
  token,
  recipient,
  amount,
}) {
  if (!validAddress(token)) {
    throw new Error('Invalid token contract address');
  }

  if (!validAddress(recipient)) {
    throw new Error('Invalid recipient address');
  }

  if (!amount) {
    throw new Error('Amount is required');
  }

  const decimals = await getDecimals(token);
  const rawAmount = parseUnits(amount, decimals);
  const balance = await getTokenBalance(token, from);

  if (rawAmount > balance) {
    throw new Error(
      `Insufficient token balance. Available: ${formatUnits(
        balance,
        decimals,
      )}`,
    );
  }

  const data = encodeTransfer(recipient, rawAmount);

  return {
    type: 'erc20-transfer',
    requiresApproval: true,
    transaction: {
      from,
      to: token,
      data,
      value: '0x0',
    },
    summary: `Send ${amount} tokens to ${recipient}`,
    execute: async () => {
      const result = await sendToken({
        from,
        token,
        to: recipient,
        amount: data,
      });

      const receipt = await waitForReceipt(result.hash);

      return {
        ...result,
        receipt,
      };
    },
  };
}
