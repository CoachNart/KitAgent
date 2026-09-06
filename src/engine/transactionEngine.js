import { ROBINHOOD_CHAIN, rpc } from './robinhood.js';
import { validatePlan, ACTION_STATES } from './transactionPlan.js';

const hex = (value) => `0x${BigInt(value).toString(16)}`;

export const getWalletState = async (address) => {
  if (!address) return null;
  const [balance, blockNumber, chainId] = await Promise.all([
    rpc('eth_getBalance', [address, 'latest']),
    rpc('eth_blockNumber'),
    rpc('eth_chainId'),
  ]);
  return { address, chainId: Number(BigInt(chainId)), blockNumber: Number(BigInt(blockNumber)), nativeBalanceWei: BigInt(balance) };
};

export const estimateTransaction = async (tx) => {
  const gas = await rpc('eth_estimateGas', [{ ...tx, value: tx.value ? hex(tx.value) : undefined }]);
  return BigInt(gas);
};

export const simulateTransaction = async (tx) => {
  // eth_call proves the calldata can execute at the current state without broadcasting it.
  const result = await rpc('eth_call', [{ ...tx, value: tx.value ? hex(tx.value) : undefined }, 'latest']);
  return { ok: true, result };
};

export const submitPlan = async (plan, provider) => {
  validatePlan(plan);
  if (!provider?.request) throw new Error('No wallet provider available.');
  if (Number(plan.chainId) !== ROBINHOOD_CHAIN.chainId) throw new Error('Plan is not for Robinhood Chain.');

  const hashes = [];
  for (const tx of plan.transactions) {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: plan.from,
        to: tx.to,
        data: tx.data || '0x',
        value: tx.value ? hex(tx.value) : '0x0',
        ...(tx.gas ? { gas: hex(tx.gas) } : {}),
      }],
    });
    hashes.push(hash);
  }
  return { ...plan, state: ACTION_STATES.SUBMITTED, hashes };
};

export const waitForReceipt = async (hash, { attempts = 30, intervalMs = 2000 } = {}) => {
  for (let i = 0; i < attempts; i += 1) {
    const receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt) return receipt;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out while waiting for the transaction receipt.');
};
