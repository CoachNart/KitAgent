import { createAdapter } from '../engine/adapterRegistry.js';
import { createPlan } from '../engine/transactionPlan.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const word = (value) => value.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export const nftAdapter = createAdapter({
  id: 'erc721',
  name: 'ERC-721 NFT transfers on Robinhood Chain',
  capabilities: ['nft-transfer'],
  prepare: async ({ from, token, to, tokenId }) => {
    if (!ADDRESS.test(from) || !ADDRESS.test(token) || !ADDRESS.test(to)) throw new Error('Wallet, NFT contract and recipient are required.');
    if (!/^\d+$/.test(String(tokenId))) throw new Error('NFT token ID must be numeric.');
    const data = `0x42842e0e${word(from)}${word(to)}${BigInt(tokenId).toString(16).padStart(64,'0')}`;
    return createPlan({
      adapter: 'erc721',
      title: 'Transfer NFT',
      from,
      transactions: [{ to: token, data }],
      expectedChanges: [`Transfer ERC-721 ${token} #${tokenId} to ${to}`],
      risk: ['NFT transfers are irreversible once confirmed.', 'Review the NFT contract, token ID and recipient before signing.'],
      metadata: { token, tokenId: String(tokenId), recipient: to },
    });
  },
});
