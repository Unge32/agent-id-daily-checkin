# Agent ID Daily Check-in

A daily check-in / streak dApp for Agent ID holders on BNB Chain — built for the
**Binance Agent ID Hackathon** (submission period 18 Nov – 9 Dec 2026).

**One sentence:** if you hold an Agent ID (`name.ai`), you can check in once a day
on-chain; consecutive days grow your streak, and the top 10 streaks are on a
public leaderboard.

## Why this exists

Agent ID is the on-chain name of a Binance Agentic Wallet. This dApp makes it
the access key to a daily habit: only Agent ID holders can check in, and every
check-in is a real on-chain interaction from an Agent ID address. No tokens,
no prizes, no funds — just a verifiable daily streak.

## How Agent ID is used

- The contract stores the Agent ID registry address (immutable, set in the
  constructor). On BNB mainnet that is the real Agent ID contract
  (`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`, SPACE ID Agent ID, ERC-721,
  non-transferable).
- `checkIn()` calls `balanceOf(msg.sender)` on that registry and requires the
  result to be greater than zero. No Agent ID → the transaction reverts.
  Agent ID is therefore the product's access control, not a cosmetic label.
- The frontend shows the same check before the button is enabled, by reading
  `balanceOf` for the connected address.

## Contracts

| Contract | Purpose |
|---|---|
| `contracts/AgentIdDailyCheckin.sol` | The dApp. One check-in per UTC day, streak + longest streak + total check-ins per user, top-10 leaderboard. |
| `contracts/MockAgentId.sol` | **Testnet only.** The real Agent ID contract is not deployed on BNB testnet, so this minimal mock (only `balanceOf` + a public `mint`) stands in for it during testing. Never deploy it on mainnet. |

### Deployed addresses (BNB testnet)

> **Not deployed yet.** Deployment is blocked on network access from the build
> environment (see "Status" below). After `node scripts/deploy.js`, the
> addresses land in `deployments/testnet.json` and in `frontend/config.js`.

- Check-in contract: *(pending)*
- Agent ID registry used (mock on testnet): *(pending)*
- BscScan testnet: *(pending)*

## What the contract does NOT do (hackathon safety red lines)

- **No funds:** `checkIn()` is not payable. There is no deposit, prize pool,
  payout, or token of any kind. Users only pay their own gas.
- **No promised returns:** no yield, no "passive income", no rewards — a streak
  is just an on-chain record.
- **No owner/admin:** there are no privileged functions at all, so there are no
  owner permissions to disclose or abuse.
- **No transfers:** no token transfers, no approvals, no scheduled or automatic
  movement of assets. The only external call is the read-only `balanceOf`.
- **No credentials:** the site never asks for a seed phrase, private key, API
  secret, or pairing code. Wallets connect with the user's own injected wallet
  (e.g. MetaMask) in their own browser — there is no QR login anywhere.
- **No trading:** the dApp has no trading features at all.
- **No fake activity:** check-ins are real transactions from real Agent ID
  holders. No wash interactions, no mass accounts.

## Project layout

```
contracts/                  Solidity sources (no imports — each file is self-contained)
frontend/                   Static site (no build step)
  index.html                Page structure
  app.js                    Wallet connect, Agent ID check, check-in, leaderboard
  config.js                 Chain + contract addresses (filled in by deploy.js)
  style.css
  abi/                      Contract ABI (hand-written, verified against the source)
  vendor/ethers.umd.min.js  Vendored ethers v6.17.0 — the site needs no CDN
scripts/
  compile.js                Compile with solc 0.8.28 (optimizer on, 200 runs)
  deploy.js                 Deploy to BNB testnet (+ mock registry + test mint)
  checkin-test.js           End-to-end test of the deployed flow
  verify.js                 Verify sources on BscScan testnet
test/
  logic.test.js             Offline mirror-test of the streak/leaderboard rules
deployments/                Deployment records (gitignored — created by deploy.js)
artifacts/                  Compiler output (gitignored — created by compile.js)
```

## Run it locally

```bash
npm install            # ethers is the only runtime dependency
npm run test:logic     # offline logic tests — 11 checks, no chain needed
npm run check:js       # syntax-check every JS file
```

Serve the frontend from `frontend/` with any static server, e.g.
`npx serve frontend` or `python3 -m http.server --directory frontend`.
Open it in a browser with MetaMask, switch to BNB testnet, connect, and check in.

## Deploy + verify (BNB testnet)

```bash
npm install --save-dev solc@0.8.28   # needs network access once
node scripts/compile.js              # -> artifacts/
# Fund a THROWAWAY test wallet with tBNB from
# https://testnet.bnbchain.org/faucet-smart (0.1 tBNB is plenty).
# NEVER use a mainnet key or Angga's wallets here.
PRIVATE_KEY=0x... node scripts/deploy.js      # -> deployments/testnet.json
PRIVATE_KEY=0x... node scripts/checkin-test.js # end-to-end checks
BSCSCAN_API_KEY=... node scripts/verify.js    # verify sources on BscScan testnet
```

`deploy.js` writes the deployed addresses into `frontend/config.js`
automatically. The check-in contract's constructor argument is the Agent ID
registry address; on testnet that is the deployed `MockAgentId`, on mainnet it
must be the real Agent ID contract.

## Status (18 Nov 2026)

- [x] Contracts written from scratch (no copied implementation)
- [x] Frontend written (connect own wallet, Agent ID check, check-in, leaderboard)
- [x] Logic mirror-tests pass (11/11, offline)
- [x] ABI validated against the source with ethers (encode/decode round-trip)
- [x] Independent code review of both contracts — done 18 Nov 2026 by a
      separate reviewer agent. It compiled both contracts with solc 0.8.28
      (optimizer 200 runs): **0 errors, 0 warnings**; re-ran the logic tests
      (11/11 pass at the time); and confirmed the shipped ABI is
      **byte-identical** to the recompiled one. Verdict: no critical or high
      findings. Fixes applied for all actionable findings: **M1** leaderboard
      staleness (expired entries are now pruned on every check-in, plus a new
      mirror test proving a pruned slot frees up — test suite is now 12/12),
      **L1** pre-deploy registry validation in `deploy.js`, **L2** view
      functions return `false` instead of reverting when the registry call
      fails, **L4** the leaderboard now loads before wallet connect, **N1**
      doc wording aligned with the code. **L3** (registry trust) is documented
      in the contract — no code change needed, no funds at stake. **L5**
      (timestamp edge) and **N3/N4** need no fix.
- [ ] Compile with solc (needs `npm install solc` — network access)
- [ ] Deploy to BNB testnet (needs tBNB from the faucet + RPC access)
- [ ] End-to-end test on testnet (`scripts/checkin-test.js`)
- [ ] Verify sources on BscScan testnet (`scripts/verify.js`, needs a free API key)
- [ ] Mainnet deployment (needs Angga's explicit go-ahead — NOT done yet)
- [ ] Hackathon submission (project name, website, contract addresses, Agent ID
      usage description — submitted during the submission period, by 9 Dec 2026 15:00 WIB)

**Blocker found during the build:** outbound network calls from the build
environment hit an approval gate (the first RPC check timed out waiting for
approval), so compilation, deployment, and verification could not run here.
Everything up to that point is complete and ready; the network steps are
scripted end-to-end above and only need a run from an environment with
network access.

## The honest 30-address bar (Innovation Award eligibility)

The Innovation Award requires the product to be live with **at least 30 Agent
ID addresses having interacted with the contract during the submission
period**. That is a distribution challenge, not a code challenge:

- This dApp is simple and genuinely usable, but it has no built-in audience.
  Getting 30 real Agent ID holders to check in means reaching the Agent ID
  community (X, Telegram, Binance Wallet channels) and giving them a reason to
  come back daily.
- The check-in itself is the reason to return (streaks + leaderboard), but
  there is no token incentive — and there must not be one, per the rules.
- Realistically, the Growth Award (top 10 by interacting Agent ID addresses /
  volume / tx count) is even harder: it rewards projects that already move
  significant on-chain activity.
- So: this is a legitimate, complete submission, but winning either project
  award depends on real adoption in the remaining ~3 weeks, which is far from
  guaranteed. The Community Promotion route (post about participating projects
  on X with #BinanceWalletHackathon + #AgenticWallet, 20 winners share
  2,000 USDC) is a separate, lower-effort path that does not need this dApp.

## License

MIT. See `contracts/*.sol` headers.
