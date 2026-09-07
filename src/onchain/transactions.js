import {
  estimateGas,
  getGasPrice,
  getTransactionReceipt,
} from './rpc.js';

import { getActiveProvider } from '../walletConnector.js';

export async function sendNative({ from, to, amountWei }) {
  if (!from) throw new Error('Wallet is not connected');
  if (!to) throw new Error('Recipient address is required');

  const provider = getActiveProvider();

  if (!provider) {
    throw new Error('No wallet provider available');
  }

  const value = `0x${BigInt(amountWei).toString(16)}`;

  const tx = {
    from,
    to,
    value,
  };

  const gas = await estimateGas(tx).catch(() => null);
  const gasPrice = await getGasPrice().catch(() => null);

  if (gas) tx.gas = gas;
  if (gasPrice) tx.gasPrice = gasPrice;

  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });

  return {
    hash,
    tx,
  };
}

export async function sendToken({
  from,
  token,
  to,
  amount,
}) {
  if (!from) throw new Error('Wallet is not connected');
  if (!token) throw new Error('Token contract is required');
  if (!to) throw new Error('Recipient address is required');

  const provider = getActiveProvider();

  if (!provider) {
    throw new Error('No wallet provider available');
  }

  const tx = {
    from,
    to: token,
    data: amount,
  };

  const gas = await estimateGas(tx).catch(() => null);

  if (gas) tx.gas = gas;

  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });

  return {
    hash,
    tx,
  };
}

export async function waitForReceipt(
  hash,
  {
    timeout = 180000,
    interval = 2500,
  } = {},
) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const receipt = await getTransactionReceipt(hash);

    if (receipt) {
      return {
        ...receipt,
        success: receipt.status === '0x1',
      };
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Transaction confirmation timed out');
}
