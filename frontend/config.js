// Configuration for the Agent ID Daily Check-in frontend.
//
// HOW TO FILL THIS IN
// - After deploying (see scripts/deploy.js), paste the deployed contract
//   addresses below. `deploy.js` writes this file for you automatically.
// - CHAIN_ID 97 is BNB testnet. For a mainnet deployment, change CHAIN_ID
//   to 56 and set REGISTRY to the real Agent ID contract
//   0x60b9262456de011f7d15a54cdd8c48baaa8b022f, then update the RPC URLs
//   and the BscScan links below.
//
// NOTE: no secrets ever belong in this file. Contract addresses are public.
const CONFIG = {
  // BNB testnet (chainId 97). Change to 56 for BNB mainnet.
  CHAIN_ID: 97,
  CHAIN_NAME: "BNB Smart Chain Testnet",
  CHAIN_CURRENCY: "tBNB",
  // Public BSC testnet RPC endpoints (no key needed).
  RPC_URLS: [
    "https://data-seed-prebsc-1-s1.binance.org:8545/",
    "https://data-seed-prebsc-2-s1.binance.org:8545/",
    "https://bsc-testnet.publicnode.com",
  ],
  // Fill in after deployment — see deployments/testnet.json.
  CHECKIN_CONTRACT: "0x0000000000000000000000000000000000000000",
  AGENT_ID_REGISTRY: "0x0000000000000000000000000000000000000000",
  // BscScan testnet base URL for transaction / address links.
  BSCSCAN_BASE: "https://testnet.bscscan.com",
};
