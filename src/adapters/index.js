import { AdapterRegistry } from '../engine/adapterRegistry.js';
import { nativeTransferAdapter } from './nativeEth.js';
import { tokenAdapter } from './erc20.js';

export const adapterRegistry = new AdapterRegistry([
  nativeTransferAdapter,
  tokenAdapter,
]);

export const getAdapterCapabilities = () => adapterRegistry.list().map(({ id, name, capabilities, chains }) => ({ id, name, capabilities, chains }));
