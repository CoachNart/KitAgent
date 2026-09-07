import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';
import { createPublicClient, defineChain, http } from 'viem';
import { morphoViemExtension, isRequirementSignature } from '@morpho-org/morpho-sdk';

const CHAIN_ID = 4663;
const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const robinhood = defineChain({ id: CHAIN_ID, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const client = createPublicClient({ chain: robinhood, transport: http(RPC_URL) }).extend(morphoViemExtension());
const txOf = (tx) => ({ to: tx.to, data: tx.data || '0x', value: tx.value ? BigInt(tx.value) : 0n });

const requireAddress = (value, label) => { if (!ADDRESS.test(value || '')) throw new Error(`${label} must be a valid EVM address.`); };
const requirementsToTransactions = (requirements) => {
  const txs = [];
  for (const requirement of requirements || []) {
    if (isRequirementSignature(requirement)) throw new Error('This Morpho route requires an off-chain signature. KitAgent will not request it silently; choose an approval-based route or explicit signature flow.');
    if (!requirement?.to) throw new Error('Morpho returned an unsupported prerequisite. Nothing was submitted.');
    txs.push(txOf(requirement));
  }
  return txs;
};

export const morphoAdapter = createAdapter({
  id: 'morpho',
  name: 'Morpho lending and borrowing on Robinhood Chain',
  capabilities: ['morpho-vault-deposit', 'morpho-vault-withdraw', 'morpho-blue-supply', 'morpho-blue-supply-collateral', 'morpho-blue-borrow', 'morpho-blue-repay', 'morpho-blue-withdraw-collateral'],
  chains: [CHAIN_ID],
  prepare: async ({ from, operation, vault, amount, shares, market, borrowAmount, withdrawAmount, positionData }) => {
    requireAddress(from, 'Wallet');
    const userAddress = from;
    let output;
    if (operation === 'vault-deposit') {
      requireAddress(vault, 'Vault');
      output = await client.morpho.vaultV2(vault, CHAIN_ID).deposit({ amount: BigInt(amount), userAddress });
    } else if (operation === 'vault-withdraw') {
      requireAddress(vault, 'Vault');
      output = client.morpho.vaultV2(vault, CHAIN_ID).withdraw({ amount: BigInt(amount), userAddress });
    } else {
      if (!market?.loanToken || !market?.collateralToken || !market?.oracle || !market?.irm || market?.lltv === undefined) throw new Error('Morpho Blue requires complete market parameters: loanToken, collateralToken, oracle, irm and lltv.');
      const entity = client.morpho.blue({ loanToken: market.loanToken, collateralToken: market.collateralToken, oracle: market.oracle, irm: market.irm, lltv: BigInt(market.lltv) }, CHAIN_ID);
      const livePosition = positionData || await entity.getPositionData(userAddress);
      if (operation === 'blue-supply') output = await entity.supply({ assets: BigInt(amount), userAddress, positionData: livePosition });
      else if (operation === 'blue-supply-collateral') output = await entity.supplyCollateral({ amount: BigInt(amount), userAddress });
      else if (operation === 'blue-borrow') output = await entity.borrow({ amount: BigInt(borrowAmount), userAddress, positionData: livePosition });
      else if (operation === 'blue-repay') output = await entity.repay({ assets: BigInt(amount), userAddress, positionData: livePosition });
      else if (operation === 'blue-withdraw-collateral') output = entity.withdrawCollateral({ amount: BigInt(withdrawAmount ?? amount), userAddress, positionData: livePosition });
      else throw new Error(`Unsupported Morpho operation: ${operation}`);
    }

    const requirements = output.getRequirements ? await output.getRequirements() : [];
    const prerequisiteTransactions = requirementsToTransactions(requirements);
    const finalTx = output.buildTx([]);
    const transactions = [...prerequisiteTransactions, txOf(finalTx)];
    return createPlan({
      adapter: 'morpho',
      title: `Morpho ${operation}`,
      from,
      transactions,
      expectedChanges: [`Execute ${operation} on Morpho`, `Robinhood Chain transaction count: ${transactions.length}`],
      risk: ['Morpho actions can move assets or change borrowing positions.', 'Review every prerequisite approval and the final transaction before signing.', 'KitAgent blocks unsupported signature requirements rather than signing them silently.'],
      metadata: { operation, vault: vault || null, market: market || null, requirements: requirements.length },
    });
  },
});
