// End-to-end test of the deployed check-in flow on BNB testnet.
//
// This script performs exactly the same steps the frontend performs, but
// from a throwaway test wallet (NEVER Angga's wallets):
//   1. Read holdsAgentId(wallet) — must be true (the deployer was minted a
//      test Agent ID by scripts/deploy.js).
//   2. Read getUser(wallet) — streak / totals before.
//   3. Send checkIn() and wait for the receipt.
//   4. Read getUser(wallet) + getLeaderboard() after — streak must be 1 on
//      the first check-in, and the wallet must appear on the leaderboard.
//   5. Attempt a second checkIn() on the same UTC day — it MUST revert
//      with "already checked in today".
//
// ENVIRONMENT
//   BSC_TESTNET_RPC  optional, defaults to a public endpoint.
//   PRIVATE_KEY      required. The same test wallet used for deployment
//                    (it holds the minted test Agent ID).
//
// USAGE:
//   PRIVATE_KEY=0x... node scripts/checkin-test.js
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

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("PRIVATE_KEY env var is required (testnet test wallet only).");
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "testnet.json"), "utf8")
  );
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "artifacts", "AgentIdDailyCheckin.json"), "utf8")
  );

  const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC || RPC_URLS[0]);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error(`Wrong network: chainId ${network.chainId}, expected ${CHAIN_ID}.`);
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(deployment.checkinContract, artifact.abi, wallet);
  console.log(`Contract: ${deployment.checkinContract}`);
  console.log(`Tester:   ${wallet.address}`);

  // 1. Agent ID gate.
  const holds = await contract.holdsAgentId(wallet.address);
  check("holdsAgentId(tester) is true", holds === true, `holds=${holds}`);

  // 2. State before.
  const before = await contract.getUser(wallet.address);
  const beforeStreak = Number(before[0].currentStreak);
  const beforeTotal = Number(before[0].totalCheckins);
  console.log(`Before: streak=${beforeStreak}, total=${beforeTotal}, checkedInToday=${before[2]}`);

  // 3. Check in.
  const tx = await contract.checkIn();
  console.log(`checkIn tx sent: ${tx.hash}`);
  console.log(`  ${BSCSCAN_BASE}/tx/${tx.hash}`);
  const receipt = await tx.wait();
  check("checkIn() mined", receipt.status === 1, `block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);

  // 4. State after.
  const after = await contract.getUser(wallet.address);
  const afterStreak = Number(after[0].currentStreak);
  const afterTotal = Number(after[0].totalCheckins);
  check("totalCheckins increased by 1", afterTotal === beforeTotal + 1, `${beforeTotal} -> ${afterTotal}`);
  check(
    "streak is 1 on first check-in (or previous+1 on a consecutive day)",
    afterStreak === 1 || afterStreak === beforeStreak + 1,
    `streak=${afterStreak}`
  );
  check("hasCheckedInToday is now true", after[2] === true);

  const board = await contract.getLeaderboard();
  const onBoard = board[0].some((a) => a.toLowerCase() === wallet.address.toLowerCase());
  check("tester appears on the leaderboard", onBoard, `board size=${board[0].length}`);

  // 5. Second check-in today must revert.
  let reverted = false;
  let revertMsg = "";
  try {
    const tx2 = await contract.checkIn();
    await tx2.wait();
  } catch (e) {
    reverted = true;
    revertMsg = e.reason || e.message || String(e);
  }
  check("second checkIn() same day reverts", reverted, revertMsg.slice(0, 120));

  console.log(failures === 0 ? "\nALL END-TO-END CHECKS PASSED." : `\n${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message || e);
  process.exit(1);
});
