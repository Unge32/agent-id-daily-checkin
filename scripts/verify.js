// Verify the deployed contracts' source on BscScan testnet.
//
// PREREQUISITE
// - Contracts deployed (deployments/testnet.json exists).
// - A BscScan API key (free: create an account at https://testnet.bscscan.com
//   and generate one under "API Keys"). It goes in the BSCSCAN_API_KEY env
//   var — never commit it.
//
// USAGE:
//   BSCSCAN_API_KEY=... node scripts/verify.js
//
// NOTES
// - The contracts have NO imports, so the source file itself is the full
//   source to submit — no flattening step is needed.
// - Compiler settings MUST match compile.js exactly: solc 0.8.28, optimizer
//   enabled, 200 runs. The script reads the artifact for the compiler
//   version and passes the constructor argument ABI-encoded (the registry
//   address) for AgentIdDailyCheckin; MockAgentId has no constructor args.
// - Verification is asynchronous: the API returns a GUID, then this script
//   polls the result until it succeeds or fails.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const API_URL = "https://api-testnet.bscscan.com/api";

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function postForm(params) {
  const body = new URLSearchParams(params);
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.json();
}

async function verifyOne({ apiKey, address, contractName, source, constructorArgs, compilerVersion }) {
  console.log(`Submitting ${contractName} (${address}) for verification...`);
  const submit = await postForm({
    apikey: apiKey,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: address,
    contractname: contractName,
    compilerversion: `v${compilerVersion}`,
    sourceCode: source,
    optimizationUsed: "1",
    runs: "200",
    constructorArguements: constructorArgs || "",
    licenseType: "3", // 3 = MIT
  });
  if (submit.status !== "1") {
    throw new Error(`Verification submit failed for ${contractName}: ${submit.result} ${submit.message || ""}`);
  }
  const guid = submit.result;
  console.log(`  GUID: ${guid} — polling for the result...`);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const check = await postForm({
      apikey: apiKey,
      module: "contract",
      action: "checkverifystatus",
      guid,
    });
    const result = String(check.result || "");
    if (result.startsWith("Pass")) {
      console.log(`  VERIFIED: ${contractName} — ${result}`);
      return true;
    }
    if (result.startsWith("Fail") || check.status === "0" && result.includes("Unable")) {
      throw new Error(`Verification failed for ${contractName}: ${result}`);
    }
    // Otherwise still pending — keep polling.
  }
  throw new Error(`Verification timed out for ${contractName} (GUID ${guid}). Check manually on BscScan.`);
}

async function main() {
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("BSCSCAN_API_KEY env var is required (free key from testnet.bscscan.com).");
  }
  const deployment = loadJson(path.join(__dirname, "..", "deployments", "testnet.json"));
  const contractsDir = path.join(__dirname, "..", "contracts");
  const artifactsDir = path.join(__dirname, "..", "artifacts");

  const checkinArtifact = loadJson(path.join(artifactsDir, "AgentIdDailyCheckin.json"));
  const checkinSource = fs.readFileSync(path.join(contractsDir, "AgentIdDailyCheckin.sol"), "utf8");
  // Constructor argument: the registry address, ABI-encoded (no 0x prefix).
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder()
    .encode(["address"], [deployment.agentIdRegistry])
    .slice(2);

  await verifyOne({
    apiKey,
    address: deployment.checkinContract,
    contractName: "AgentIdDailyCheckin",
    source: checkinSource,
    constructorArgs,
    compilerVersion: checkinArtifact.compilerVersion,
  });

  if (deployment.mockAgentId) {
    const mockArtifact = loadJson(path.join(artifactsDir, "MockAgentId.json"));
    const mockSource = fs.readFileSync(path.join(contractsDir, "MockAgentId.sol"), "utf8");
    await verifyOne({
      apiKey,
      address: deployment.mockAgentId,
      contractName: "MockAgentId",
      source: mockSource,
      constructorArgs: "",
      compilerVersion: mockArtifact.compilerVersion,
    });
  }

  console.log("Done. Both contracts verified on BscScan testnet.");
  console.log(`Check-in contract: https://testnet.bscscan.com/address/${deployment.checkinContract}#code`);
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message || e);
  process.exit(1);
});
