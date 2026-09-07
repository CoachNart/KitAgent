import { sendNative, waitForReceipt } from '../transactions.js';

function validAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function parseEther(value) {
  const input = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(input)) {
    throw new Error('Invalid native token amount');
  }

  const [whole, fraction = ''] = input.split('.');

  if (fraction.length > 18) {
    throw new Error('Native token supports a maximum of 18 decimals');
  }

  return (
    BigInt(whole) * 10n ** 18n +
    BigInt((fraction + '0'.repeat(18)).slice(0, 18) || 0)
  );
}

export function prepareNativeTransfer({ from, recipient, amount }) {
  if (!validAddress(recipient)) {
    throw new Error('Invalid recipient address');
  }

  if (!amount) {
    throw new Error('Amount is required');
  }

  const amountWei = parseEther(amount);

  return {
    type: 'native-transfer',
    requiresApproval: true,
    transaction: {
      from,
      to: recipient,
      value: `0x${amountWei.toString(16)}`,
    },
    summary: `Send ${amount} native token to ${recipient}`,
    execute: async () => {
      const result = await sendNative({
        from,
        to: recipient,
        amountWei,
      });

      const receipt = await waitForReceipt(result.hash);

      return {
        ...result,
        receipt,
      };
    },
  };
}
