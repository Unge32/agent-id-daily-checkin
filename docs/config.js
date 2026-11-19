// Configuration for the Agent ID Daily Check-in frontend.
//
// HOW TO FILL THIS IN
// - After deploying (see scripts/deploy.js), paste the deployed contract
//   addresses below. `deploy.js` writes this file for you automatically.
// - Mainnet deployment (chainId 56) with the real Agent ID registry
//   0x60b9262456de011f7d15a54cdd8c48baaa8b022f — see
//   deployments/mainnet.json. Testnet settings were chainId 97, registry
//   0xC6F8e04642eaD937c62f6E25186F36132bb92584 (mock).
//
// NOTE: no secrets ever belong in this file. Contract addresses are public.
const CONFIG = {
  // BNB mainnet (chainId 56).
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
  CHAIN_CURRENCY: "BNB",
  // Public BSC mainnet RPC endpoints (no key needed).
  RPC_URLS: [
    "https://bsc-dataseed.binance.org/",
    "https://bsc-dataseed1.defibit.io/",
    "https://bsc.publicnode.com",
  ],
  // Mainnet deployment — see deployments/mainnet.json.
  CHECKIN_CONTRACT: "0xf68D075FCFA4d6C47F115685ec1D2Aae0E036D8b",
  AGENT_ID_REGISTRY: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
  // BscScan base URL for transaction / address links.
  BSCSCAN_BASE: "https://bscscan.com",
};
