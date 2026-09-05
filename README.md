# KitAgent

**KitAgent — Onchain Command Center**

KitAgent turns natural-language intent into explicit EVM execution plans. It is non-custodial: private keys remain in the user's wallet and every executable transaction passes verification, simulation, wallet approval and receipt confirmation.

## Shipped execution surface

- Robinhood Chain mainnet + testnet
- ETH and ERC-20 transfers
- ERC-20 approvals, balances and allowance reads
- ERC-721 / ERC-1155 transfers and operator approvals
- Live swap routing through LI.FI
- Cross-chain route discovery through the same execution pipeline
- Ethereum, Base, Arbitrum, Optimism, Polygon and BNB Chain route IDs
- Exact route transaction simulation before signing
- Gas price, gas limit, fee and native-balance checks
- RPC chain validation and health checks
- Receipt polling and revert detection
- Explorer-backed portfolio/activity
- Testnet gas station and verified faucet handling
- Arbitrary EVM contract simulation/execution
- DeFi execution templates for Aave-compatible Pool interfaces when a verified target is configured
- Batch validation and atomicity gating; no false atomic claims
- ERC-4337 bundler capability, UserOperation estimation/submission helpers and sponsorship state
- Dynamic custom EVM testnet configuration
- Selector-aware transaction decoding and risk warnings

## Environment hooks

Optional:

- `VITE_DEFI_TARGET` — verified DeFi Pool target for the Aave-compatible templates
- `VITE_BUNDLER_URL` — ERC-4337 bundler endpoint
- `VITE_PAYMASTER_URL` — paymaster endpoint
- `VITE_ENTRYPOINT` — supported EntryPoint address

KitAgent intentionally refuses to fabricate protocol addresses, token contracts, bridge destinations, faucet URLs, EntryPoints, paymasters or Multicall3 deployments. Those must be verified/configured before the corresponding capability becomes executable.

## Robinhood Chain

Robinhood Chain is EVM-compatible and uses ETH for gas. Mainnet is chain ID 4663 and testnet is 46630. The public RPCs are rate-limited; production deployments should use a provider endpoint.

## Run

```bash
npm install
npm run dev
npm run build
```
