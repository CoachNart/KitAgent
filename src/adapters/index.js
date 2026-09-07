import { AdapterRegistry } from '../engine/adapterRegistry.js';
import { nativeTransferAdapter } from './nativeEth.js';
import { tokenAdapter } from './erc20.js';
import { uniswapV2Adapter } from './uniswapV2.js';
import { nftAdapter } from './erc721.js';
import { discoveryAdapter } from './discovery.js';

export const adapterRegistry = new AdapterRegistry([
  nativeTransferAdapter,
  tokenAdapter,
  uniswapV2Adapter,
  nftAdapter,
  discoveryAdapter,
]);

export const getAdapterCapabilities = () => adapterRegistry.list().map(({ id, name, capabilities, chains }) => ({ id, name, capabilities, chains }));
