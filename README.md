# KitAgent

KitAgent is a non-custodial EVM onchain command center. It turns natural-language intent into explicit transaction plans and gates execution through **UNDERSTAND → VERIFY → SIMULATE → APPROVE → CONFIRM**.

## Included
- Robinhood Chain mainnet + testnet
- Native ETH and ERC-20 transfers, approvals, balances and allowance reads
- ERC-721 / ERC-1155 transfers and operator approvals
- Real LI.FI route discovery for supported swaps/bridges, with exact returned transaction data passed through simulation before signing
- Universal EVM contract executor
- Batch planner (never pretends separate calls are atomic)
- Gas estimation, balance sufficiency, RPC chain validation and receipt polling
- Explorer-backed portfolio/activity intelligence
- Configurable EVM testnet gas station and official faucet links
- Adapter configuration hooks for Uniswap, Morpho and LayerZero
- Capability-aware ERC-4337 sponsorship state; no false sponsorship claims
- Wallet event handling and network switching

## Environment hooks
Optional protocol addresses: `VITE_UNISWAP_ROUTER`, `VITE_MORPHO_ROUTER`, `VITE_LAYERZERO_ROUTER`.
Optional account-abstraction infrastructure: `VITE_BUNDLER_URL`, `VITE_PAYMASTER_URL`.

KitAgent intentionally refuses to invent contract addresses, token mappings, faucet endpoints, bridge destinations or sponsorship availability.
