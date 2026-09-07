import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';
import { createWalletClient, custom, defineChain } from 'viem';
import { morphoViemExtension, isRequirementSignature } from '@morpho-org/morpho-sdk';

const CHAIN_ID = 4663;
const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const robinhood = defineChain({ id: CHAIN_ID, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const txOf = (tx) => ({ to: tx.to, data: tx.data || '0x', value: tx.value ? BigInt(tx.value) : 0n });
const requireAddress = (value, label) => { if (!ADDRESS.test(value || '')) throw new Error(`${label} must be a valid EVM address.`); };

export const morphoAdapter = createAdapter({
  id: 'morpho',
  name: 'Morpho lending and borrowing on Robinhood Chain',
  capabilities: ['morpho-vault-deposit', 'morpho-vault-withdraw', 'morpho-blue-supply', 'morpho-blue-supply-collateral', 'morpho-blue-borrow', 'morpho-blue-repay', 'morpho-blue-withdraw-collateral'],
  chains: [CHAIN_ID],
  prepare: async ({ from, provider, operation, vault, amount, market, borrowAmount, withdrawAmount, positionData }) => {
    requireAddress(from, 'Wallet');
    if (!provider?.request) throw new Error('A connected wallet provider is required for Morpho signature requirements.');
    const client = createWalletClient({ account: from, chain: robinhood, transport: custom(provider) }).extend(morphoViemExtension({ supportSignature: true }));
    let output;
    if (operation === 'vault-deposit' || operation === 'vault-withdraw') {
      requireAddress(vault, 'Vault');
      const entity = client.morpho.vaultV2(vault, CHAIN_ID);
      output = operation === 'vault-deposit' ? entity.deposit({ amount: BigInt(amount), userAddress: from }) : entity.withdraw({ amount: BigInt(amount), userAddress: from });
    } else {
      if (!market?.loanToken || !market?.collateralToken || !market?.oracle || !market?.irm || market?.lltv === undefined) throw new Error('Morpho Blue requires complete market parameters.');
      const entity = client.morpho.blue({ loanToken: market.loanToken, collateralToken: market.collateralToken, oracle: market.oracle, irm: market.irm, lltv: BigInt(market.lltv) }, CHAIN_ID);
      const livePosition = positionData || await entity.getPositionData(from);
      if (operation === 'blue-supply') output = entity.supply({ assets: BigInt(amount), userAddress: from, positionData: livePosition });
      else if (operation === 'blue-supply-collateral') output = entity.supplyCollateral({ amount: BigInt(amount), userAddress: from });
      else if (operation === 'blue-borrow') output = entity.borrow({ amount: BigInt(borrowAmount), userAddress: from, positionData: livePosition });
      else if (operation === 'blue-repay') output = entity.repay({ assets: BigInt(amount), userAddress: from, positionData: livePosition });
      else if (operation === 'blue-withdraw-collateral') output = entity.withdrawCollateral({ amount: BigInt(withdrawAmount ?? amount), userAddress: from, positionData: livePosition });
      else throw new Error(`Unsupported Morpho operation: ${operation}`);
    }
    const requirements = output.getRequirements ? await output.getRequirements() : [];
    const signatures = [];
    const prerequisiteTransactions = [];
    for (const requirement of requirements) {
      if (isRequirementSignature(requirement)) signatures.push(await requirement.sign(client, from));
      else {
        if (!requirement?.to) throw new Error('Morpho returned an unsupported prerequisite. Nothing was submitted.');
        prerequisiteTransactions.push(txOf(requirement));
      }
    }
    const finalTx = output.buildTx(signatures);
    const transactions = [...prerequisiteTransactions, txOf(finalTx)];
    return createPlan({ adapter: 'morpho', title: `Morpho ${operation}`, from, transactions, expectedChanges: [`Execute ${operation} on Morpho`], risk: ['Morpho actions can move assets or change borrowing positions.', 'EIP-712 Permit, Permit2 or Morpho authorization signatures may be requested by the connected wallet.', 'Review every prerequisite approval and the final transaction before signing.'], metadata: { operation, vault: vault || null, market: market || null, requirements: requirements.length, signatures: signatures.length } });
  },
});
