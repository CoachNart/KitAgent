import { AdapterRegistry } from './adapterRegistry.js';
import { nativeTransferAdapter } from '../adapters/nativeEth.js';
import { tokenAdapter } from '../adapters/erc20.js';

export const adapterRegistry = new AdapterRegistry([
  nativeTransferAdapter,
  tokenAdapter,
]);

export const getAdapterCapabilities = () => adapterRegistry.list().map(({ id, name, capabilities, chains }) => ({ id, name, capabilities, chains }));
