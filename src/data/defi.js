export const DEFI_SERVICES = [
  { id: 'swap', label: 'Swap', description: 'Swap tokens across supported EVM networks with route, price impact and gas preview.' },
  { id: 'bridge', label: 'Bridge', description: 'Move assets across supported networks with route and fee preview.' },
  { id: 'lend', label: 'Lending', description: 'Prepare supply and borrow actions for supported lending protocols.' },
  { id: 'liquidity', label: 'Liquidity', description: 'Add, remove and inspect liquidity positions where adapters are available.' },
  { id: 'stake', label: 'Staking', description: 'Prepare staking and unstaking actions for supported protocols.' },
  { id: 'yield', label: 'Yield', description: 'Compare supported yield opportunities without pretending returns are guaranteed.' },
  { id: 'approve', label: 'Approve', description: 'Review token approvals and prepare allowance changes.' },
  { id: 'send', label: 'Send', description: 'Send native tokens and ERC-20 assets after explicit confirmation.' },
  { id: 'batch', label: 'Batch', description: 'Prepare multiple compatible transactions as a reviewable batch.' },
  { id: 'contract', label: 'Contract', description: 'Inspect and prepare supported contract calls with decoded parameters.' },
];

export const WEB3_CATEGORIES = [
  'DeFi', 'NFT marketplace', 'NFT minting', 'NFT transfer', 'NFT listing', 'NFT offers',
  'Swap', 'Bridge', 'Lending', 'Borrowing', 'Liquidity', 'Staking', 'Yield', 'Approvals',
  'Portfolio', 'Gas', 'Faucets', 'Token transfers', 'Degen', 'Memecoins', 'On-chain analytics',
  'Governance', 'DAOs', 'Airdrops', 'RWA', 'Gaming', 'Payments', 'Wallets', 'Smart contracts',
  'Multichain discovery',
];

export const EXECUTION_POLICY = {
  prepare: true,
  simulate: true,
  showGas: true,
  showRisk: true,
  requireTerminalConfirmation: true,
  requireWalletApproval: true,
  silentBroadcast: false,
};
