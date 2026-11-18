// Deploy to BNB testnet (chainId 97) and wire up the frontend config.
//
// PREREQUISITES
// - `node scripts/compile.js` has been run (artifacts/ exists).
// - A funded TESTNET wallet. This script uses a fresh throwaway test wallet,
//   NEVER Angga's wallets. Fund it with testnet BNB (tBNB, worthless) from
//   the BNB testnet faucet: https://testnet.bnbchain.org/faucet-smart
//   (0.1 tBNB per request is more than enough for both deployments).
//
// ENVIRONMENT
//   BSC_TESTNET_RPC   optional, defaults to a public endpoint below.
//   PRIVATE_KEY       required. The test wallet's private key (0x...).
//                     NEVER commit a real key. NEVER use a mainnet key here.
//   AGENT_ID_REGISTRY optional. If set, the check-in contract is deployed
//                     pointing at that registry and NO mock is deployed.
//                     If unset, MockAgentId is deployed, one test Agent ID
//                     is minted to the deployer, and the check-in contract
//                     points at the mock.
//
// USAGE:
//   PRIVATE_KEY=0x... node scripts/deploy.js
//
// OUTPUT
//   - Prints both contract addresses + BscScan testnet links.
//   - Writes deployments/testnet.json (addresses, deployer, tx hashes).
//   - Rewrites frontend/config.js with the deployed addresses.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URLS = [
  "https://data-seed-prebsc-1-s1.binance.org:8545/",
  "https://data-seed-prebsc-2-s1.binance.org:8545/",
  "https://bsc-testnet.publicnode.com",
];
const CHAIN_ID = 97;
const BSCSCAN_BASE = "https://testnet.bscscan.com";

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "artifacts", `${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing artifact ${p}. Run: node scripts/compile.js`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function updateFrontendConfig(checkin, registry) {
  const configPath = path.join(__dirname, "..", "frontend", "config.js");
  let text = fs.readFileSync(configPath, "utf8");
  text = text.replace(
    /CHECKIN_CONTRACT: "0x[0-9a-fA-F]*"/,
    `CHECKIN_CONTRACT: "${checkin}"`
  );
  text = text.replace(
    /AGENT_ID_REGISTRY: "0x[0-9a-fA-F]*"/,
    `AGENT_ID_REGISTRY: "${registry}"`
  );
  fs.writeFileSync(configPath, text);
  console.log("frontend/config.js updated with deployed addresses.");
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY env var is required (testnet test wallet only).");
  }
  const rpcUrl = process.env.BSC_TESTNET_RPC || RPC_URLS[0];
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error(`Wrong network: chainId ${network.chainId}, expected ${CHAIN_ID} (BNB testnet).`);
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} tBNB`);
  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 tBNB. Fund this TEST wallet from the BNB testnet faucet " +
        "(https://testnet.bnbchain.org/faucet-smart) and re-run."
    );
  }

  let registryAddress = process.env.AGENT_ID_REGISTRY || null;
  let mockAddress = null;
  let mockMintTx = null;

  if (!registryAddress) {
    console.log("No AGENT_ID_REGISTRY set — deploying MockAgentId (testnet only)...");
    const mockArtifact = loadArtifact("MockAgentId");
    const mockFactory = new ethers.ContractFactory(
      mockArtifact.abi,
      mockArtifact.bytecode,
      wallet
    );
    const mock = await mockFactory.deploy();
    await mock.waitForDeployment();
    mockAddress = await mock.getAddress();
    console.log(`MockAgentId deployed: ${mockAddress}`);
    console.log(`  ${BSCSCAN_BASE}/address/${mockAddress}`);
    const mintTx = await mock.mint(wallet.address);
    const mintReceipt = await mintTx.wait();
    mockMintTx = mintTx.hash;
    console.log(`Minted 1 test Agent ID to deployer (tx ${mockMintTx}, block ${mintReceipt.blockNumber}).`);
    registryAddress = mockAddress;
  } else {
    console.log(`Using registry from env: ${registryAddress}`);
  }

  console.log("Deploying AgentIdDailyCheckin...");

  // Pre-deploy validation (review finding L1): the registry is immutable,
  // so a wrong address would brick the deployment. Check BEFORE deploying
  // that the registry is a contract and answers balanceOf.
  const registryCode = await provider.getCode(registryAddress);
  if (registryCode === "0x") {
    throw new Error(`Registry ${registryAddress} has no code — not a contract. Aborting before deploy.`);
  }
  const registryReader = new ethers.Contract(
    registryAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  await registryReader.balanceOf(wallet.address);
  console.log(`Registry pre-check passed: ${registryAddress} is a contract with balanceOf().`);
  const artifact = loadArtifact("AgentIdDailyCheckin");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(registryAddress);
  const deployTx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const receipt = await deployTx.wait();
  const checkinAddress = await contract.getAddress();
  console.log(`AgentIdDailyCheckin deployed: ${checkinAddress}`);
  console.log(`  ${BSCSCAN_BASE}/address/${checkinAddress}`);
  console.log(`  deploy tx: ${deployTx.hash} (block ${receipt.blockNumber})`);

  // Sanity reads right after deployment.
  const onChainRegistry = await contract.agentIdRegistry();
  const holds = await contract.holdsAgentId(wallet.address);
  console.log(`On-chain registry: ${onChainRegistry} (matches: ${onChainRegistry.toLowerCase() === registryAddress.toLowerCase()})`);
  console.log(`Deployer holds an Agent ID (per contract): ${holds}`);

  const deployment = {
    network: "BNB testnet",
    chainId: CHAIN_ID,
    deployer: wallet.address,
    agentIdRegistry: registryAddress,
    mockAgentId: mockAddress,
    mockMintTx,
    checkinContract: checkinAddress,
    checkinDeployTx: deployTx.hash,
    checkinDeployBlock: receipt.blockNumber,
    bscscan: {
      checkin: `${BSCSCAN_BASE}/address/${checkinAddress}`,
      registry: `${BSCSCAN_BASE}/address/${registryAddress}`,
    },
    deployedAt: new Date().toISOString(),
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "testnet.json"),
    JSON.stringify(deployment, null, 2) + "\n"
  );
  console.log("deployments/testnet.json written.");
  updateFrontendConfig(checkinAddress, registryAddress);
  console.log("Done. Next: node scripts/checkin-test.js (end-to-end), then node scripts/verify.js (BscScan).");
}

main().catch((e) => {
  console.error("DEPLOY FAILED:", e.message || e);
  process.exit(1);
});
