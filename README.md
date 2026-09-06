# KitAgent

**KitAgent — Onchain Command Center**

KitAgent turns natural-language intent into explicit EVM execution plans. It is non-custodial: private keys remain in the user's wallet and every executable transaction passes verification, simulation, wallet approval and receipt confirmation.

## Current product surface

- Modern cyan terminal navigation and responsive chain-category picker
- KitSetups-matched account/profile presentation
- Trading is always reachable; free/trial users see blurred signal data with a Premium CTA
- One KitAgent account per device/browser fingerprint; existing account sign-in remains supported
- Terminal faucet intent resolves verified public testnet faucets from the chain registry
- 41 EVM networks exposed through the Chain Categories control, plus the non-EVM catalog
- Robinhood Chain mainnet + testnet
- ETH and ERC-20 transfers
- ERC-20 approvals, balances and allowance reads
- ERC-721 / ERC-1155 transfers and operator approvals
- Live swap routing through LI.FI
- Cross-chain route discovery through the same execution pipeline
- Gas price, gas limit, fee and native-balance checks
- RPC chain validation and health checks
- Receipt polling and revert detection
- Explorer-backed portfolio/activity
- Arbitrary EVM contract simulation/execution
- DeFi execution templates for Aave-compatible Pool interfaces when a verified target is configured
- Batch validation and atomicity gating; no false atomic claims
- ERC-4337 bundler capability, UserOperation estimation/submission helpers and sponsorship state
- Dynamic custom EVM testnet configuration
- Selector-aware transaction decoding and risk warnings

## Faucet behavior

A terminal prompt such as `Get test ETH on Sepolia` is resolved against a verified faucet map. The agent opens the appropriate faucet with the connected wallet address available to the user. Networks without a verified public faucet are rejected rather than being presented with a fabricated URL.

## Environment hooks

Optional:

- `VITE_DEFI_TARGET` — verified DeFi Pool target for the Aave-compatible templates
- `VITE_BUNDLER_URL` — ERC-4337 bundler endpoint
- `VITE_PAYMASTER_URL` — paymaster endpoint
- `VITE_ENTRYPOINT` — supported EntryPoint address

KitAgent refuses to fabricate protocol addresses, token contracts, bridge destinations, faucet URLs, EntryPoints, paymasters or Multicall3 deployments. Those must be verified/configured before the corresponding capability becomes executable.

## Run

```bash
npm install
npm run dev
npm run build
```
