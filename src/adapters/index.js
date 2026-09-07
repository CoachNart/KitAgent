import { AdapterRegistry } from '../engine/adapterRegistry.js';
import { nativeTransferAdapter } from './nativeEth.js';
import { tokenAdapter } from './erc20.js';
import { uniswapV2Adapter } from './uniswapV2.js';
import { nftAdapter } from './erc721.js';
import { morphoAdapter } from './morpho.js';
import { discoveryAdapter } from './discovery.js';

const lighterAdapter = {
  id: 'lighter',
  name: 'Lighter Perpetuals',
  capabilities: ['lighter-status', 'lighter-market-order', 'lighter-limit-order', 'lighter-cancel-order', 'lighter-leverage', 'lighter-close-position'],
  chains: [4663],
  async load() {
    return (await import('./lighter.js')).lighterAdapter;
  },
  async discover(context) { return (await this.load()).discover(context); },
  async quote(context) { return (await this.load()).quote(context); },
  async prepare(context) { return (await this.load()).prepare(context); },
  async simulate(context) { return (await this.load()).simulate(context); },
  async execute(plan, context) { return (await this.load()).execute(plan, context); },
  async verify(context) { return (await this.load()).verify(context); },
};

export const adapterRegistry = new AdapterRegistry([
  nativeTransferAdapter,
  tokenAdapter,
  uniswapV2Adapter,
  nftAdapter,
  morphoAdapter,
  lighterAdapter,
  discoveryAdapter,
]);

export const getAdapterCapabilities = () => adapterRegistry.list().map(({ id, name, capabilities, chains }) => ({ id, name, capabilities, chains }));
