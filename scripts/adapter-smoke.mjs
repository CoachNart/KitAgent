import { getAdapterCapabilities } from '../src/adapters/index.js';

const expected = ['native-eth', 'erc20', 'uniswap-v2', 'erc721', 'morpho', 'lighter', 'discovery'];
const actual = getAdapterCapabilities().map((adapter) => adapter.id);
const missing = expected.filter((id) => !actual.includes(id));
if (missing.length) throw new Error(`Missing adapters: ${missing.join(', ')}`);

const swap = getAdapterCapabilities().find((adapter) => adapter.id === 'uniswap-v2');
if (!swap.capabilities.includes('swap') || !swap.chains.includes(4663)) throw new Error('Uniswap adapter is not configured for Robinhood Chain.');
const nft = getAdapterCapabilities().find((adapter) => adapter.id === 'erc721');
if (!nft.capabilities.includes('nft-transfer') || !nft.chains.includes(4663)) throw new Error('ERC-721 adapter is not configured for Robinhood Chain.');
const morpho = getAdapterCapabilities().find((adapter) => adapter.id === 'morpho');
if (!morpho.capabilities.includes('morpho-blue-borrow') || !morpho.chains.includes(4663)) throw new Error('Morpho adapter is not configured for Robinhood Chain.');
const lighter = getAdapterCapabilities().find((adapter) => adapter.id === 'lighter');
if (!lighter.capabilities.includes('lighter-market-order') || !lighter.chains.includes(4663)) throw new Error('Lighter adapter is not configured for Robinhood Chain.');

console.log('KitAgent adapter smoke test passed.');
console.log(JSON.stringify(getAdapterCapabilities(), null, 2));
