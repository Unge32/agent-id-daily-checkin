// Agent ID Daily Check-in — frontend logic.
//
// SECURITY NOTES (read before changing this file)
// - The user connects their OWN injected wallet (window.ethereum, e.g.
//   MetaMask). There is NO QR login, NO pairing code, and NO session stored
//   anywhere. The site never asks for a seed phrase or private key.
// - The only transaction this site ever sends is `checkIn()` on the
//   check-in contract. The user sees and confirms it in their own wallet
//   before anything happens. No other asset action exists in this dApp.
// - All reads (Agent ID balance, stats, leaderboard) are plain eth_call
//   reads through the user's wallet provider — no signatures needed.
// - The contract ABI is fetched from abi/AgentIdDailyCheckin.json at load.
//   If that file is missing, the page shows an error instead of guessing.
(function () {
  "use strict";

  var ethers = window.ethers;
  var els = {};
  ["btn-connect", "btn-network", "btn-checkin", "btn-refresh",
   "wallet-status", "agentid-status", "checkin-status", "tx-link",
   "stat-streak", "stat-longest", "stat-total", "stat-last",
   "link-contract", "link-registry"].forEach(function (id) {
    els[id] = document.getElementById(id);
  });
  var boardBody = document.querySelector("#board tbody");

  var provider = null; // ethers.BrowserProvider
  var signer = null;
  var account = null;
  var contract = null; // read/write contract (connected to signer once set)
  var abi = null;

  function setText(el, text) { el.textContent = text; }
  function shortAddr(addr) {
    return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "—";
  }
  function bscscanAddress(addr) { return CONFIG.BSCSCAN_BASE + "/address/" + addr; }
  function bscscanTx(hash) { return CONFIG.BSCSCAN_BASE + "/tx/" + hash; }

  function showTxLink(hash) {
    els["tx-link"].innerHTML = "";
    var a = document.createElement("a");
    a.href = bscscanTx(hash);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Transaction: " + hash.slice(0, 18) + "… (view on BscScan)";
    els["tx-link"].appendChild(a);
  }

  function setCheckinEnabled(enabled, label) {
    els["btn-checkin"].disabled = !enabled;
    if (label) els["btn-checkin"].textContent = label;
  }

  async function loadAbi() {
    var res = await fetch("abi/AgentIdDailyCheckin.json");
    if (!res.ok) throw new Error("ABI file missing (HTTP " + res.status + ")");
    abi = await res.json();
  }

  function readContract() {
    // Read-only instance over the user's provider (falls back to a public
    // RPC if no wallet is connected yet — reads never need a signature).
    var rpc = provider || new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
    return new ethers.Contract(CONFIG.CHECKIN_CONTRACT, abi, rpc);
  }

  async function refreshAll() {
    // The board is public: it loads through a provider-only read, so it
    // works before any wallet is connected. (Only the per-user stats below
    // need an account.)
    try {
      var board = await readContract().getLeaderboard();
      var rows = "";
      if (board[0].length === 0) {
        rows = '<tr><td colspan="3">No check-ins yet — be the first.</td></tr>';
      } else {
        for (var i = 0; i < board[0].length; i++) {
          rows += "<tr><td>" + (i + 1) + "</td><td>" + board[0][i] +
            "</td><td>" + board[1][i].toString() + "</td></tr>";
        }
      }
      boardBody.innerHTML = rows;
    } catch (e) {
      boardBody.innerHTML = '<tr><td colspan="3">Could not load the board: ' +
        escapeHtml(e.message) + "</td></tr>";
    }

    if (!account) return;
    try {
      var user = await readContract().getUser(account);
      var stats = user[0];
      setText(els["stat-streak"], stats.currentStreak.toString());
      setText(els["stat-longest"], stats.longestStreak.toString());
      setText(els["stat-total"], stats.totalCheckins.toString());
      setText(els["stat-last"],
        stats.lastCheckinDay === 0n ? "never" : stats.lastCheckinDay.toString());

      var holds = user[1];
      var doneToday = user[2];
      if (!holds) {
        setText(els["agentid-status"],
          "This address holds NO Agent ID. Only Agent ID holders can check in.");
        setText(els["checkin-status"], "Check-in is unavailable without an Agent ID.");
        setCheckinEnabled(false, "Check in");
      } else {
        setText(els["agentid-status"],
          "This address holds an Agent ID. You can check in.");
        if (doneToday) {
          setText(els["checkin-status"], "Already checked in today. Come back tomorrow.");
          setCheckinEnabled(false, "Checked in ✓");
        } else {
          setText(els["checkin-status"], "You have not checked in today yet.");
          setCheckinEnabled(true, "Check in");
        }
      }
    } catch (e) {
      setText(els["checkin-status"], "Could not load your stats: " + e.message);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  async function connect() {
    if (!window.ethereum) {
      setText(els["wallet-status"],
        "No injected wallet found in this browser. Install MetaMask (or another injected wallet) and reload.");
      return;
    }
    try {
      setText(els["wallet-status"], "Requesting accounts in your wallet…");
      provider = new ethers.BrowserProvider(window.ethereum);
      var accounts = await provider.send("eth_requestAccounts", []);
      account = accounts[0];
      signer = await provider.getSigner();
      contract = new ethers.Contract(CONFIG.CHECKIN_CONTRACT, abi, signer);
      setText(els["wallet-status"], "Connected: " + account);
      els["btn-network"].disabled = false;
      await ensureNetwork();
      await refreshAll();
    } catch (e) {
      setText(els["wallet-status"], "Connection failed: " + e.message);
    }
  }

  async function ensureNetwork() {
    var net = await provider.getNetwork();
    if (Number(net.chainId) === CONFIG.CHAIN_ID) {
      els["btn-network"].disabled = true;
      return true;
    }
    setText(els["wallet-status"],
      "Wrong network (chainId " + net.chainId + "). Switch to " + CONFIG.CHAIN_NAME + ".");
    els["btn-network"].disabled = false;
    return false;
  }

  async function switchNetwork() {
    var hexId = "0x" + CONFIG.CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch (e) {
      if (e.code !== 4902) throw e; // 4902 = chain not added to the wallet
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexId,
          chainName: CONFIG.CHAIN_NAME,
          nativeCurrency: { name: CONFIG.CHAIN_CURRENCY, symbol: CONFIG.CHAIN_CURRENCY, decimals: 18 },
          rpcUrls: CONFIG.RPC_URLS,
          blockExplorerUrls: [CONFIG.BSCSCAN_BASE],
        }],
      });
    }
    setText(els["wallet-status"], "Network switched. Refreshing…");
    await refreshAll();
  }

  async function checkIn() {
    if (!contract || !account) return;
    setCheckinEnabled(false, "Waiting for confirmation…");
    setText(els["checkin-status"],
      "Confirm the check-in in your wallet. You only pay your own gas — nothing else moves.");
    try {
      var tx = await contract.checkIn();
      setText(els["checkin-status"], "Transaction sent. Waiting for confirmation…");
      showTxLink(tx.hash);
      await tx.wait();
      setText(els["checkin-status"], "Checked in! Your streak is updated on-chain.");
      await refreshAll();
    } catch (e) {
      var msg = (e && e.reason) || (e && e.message) || String(e);
      if (e && e.code === "ACTION_REJECTED") msg = "You rejected the transaction in your wallet.";
      setText(els["checkin-status"], "Check-in failed: " + msg);
      setCheckinEnabled(true, "Check in");
    }
  }

  async function init() {
    els["link-contract"].textContent = shortAddr(CONFIG.CHECKIN_CONTRACT);
    els["link-contract"].href = bscscanAddress(CONFIG.CHECKIN_CONTRACT);
    els["link-registry"].textContent = shortAddr(CONFIG.AGENT_ID_REGISTRY);
    els["link-registry"].href = bscscanAddress(CONFIG.AGENT_ID_REGISTRY);
    try {
      await loadAbi();
    } catch (e) {
      setText(els["wallet-status"], "Failed to load contract ABI: " + e.message);
      return;
    }
    if (CONFIG.CHECKIN_CONTRACT === "0x0000000000000000000000000000000000000000") {
      setText(els["wallet-status"],
        "Contract not deployed yet — the deployer still needs to fill in the address in config.js.");
    }
    // Load the public leaderboard even before a wallet is connected.
    try { await refreshAll(); } catch (e) { /* board shows its own error */ }

    els["btn-connect"].addEventListener("click", connect);
    els["btn-network"].addEventListener("click", function () {
      switchNetwork().catch(function (e) {
        setText(els["wallet-status"], "Network switch failed: " + e.message);
      });
    });
    els["btn-checkin"].addEventListener("click", checkIn);
    els["btn-refresh"].addEventListener("click", refreshAll);
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", function (accounts) {
        account = accounts[0] || null;
        if (account) connect(); else location.reload();
      });
      window.ethereum.on("chainChanged", function () { location.reload(); });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
