export class AdapterRegistry {
  constructor(adapters = []) { this.adapters = new Map(adapters.map(adapter => [adapter.id, adapter])); }
  register(adapter) {
    if (!adapter?.id || !adapter?.capabilities) throw new Error('Adapter must define id and capabilities.');
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }
  get(id) { return this.adapters.get(id); }
  list() { return [...this.adapters.values()]; }
  find(capability) { return this.list().filter(adapter => adapter.capabilities.includes(capability)); }
}

export const createAdapter = ({ id, name, capabilities = [], chains = [4663], discover, quote, prepare, simulate, execute, verify }) => ({
  id, name, capabilities, chains,
  discover: discover || (async () => []),
  quote: quote || (async () => null),
  prepare: prepare || (async () => { throw new Error(`${name} does not implement prepare().`); }),
  simulate: simulate || (async () => null),
  execute: execute || (async () => { throw new Error(`${name} does not implement execute().`); }),
  verify: verify || (async () => null),
});
