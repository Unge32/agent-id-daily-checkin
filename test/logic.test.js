// Offline mirror-test of the AgentIdDailyCheckin logic.
//
// This file re-implements the contract's rules in plain JavaScript and runs
// assertions against them. It does NOT need a compiler, a chain, or the
// network — it validates the LOGIC (day math, streak growth/reset, the
// once-per-day rule, the Agent ID gate, and the leaderboard ordering/cap)
// so the rules can be checked before the contract is compiled and deployed.
//
// Run: node test/logic.test.js   (exit code 0 = all pass)
//
// The mirror below is intentionally written to follow the Solidity line by
// line. If you change the contract, change this mirror the same way and
// re-run.
const SECONDS_PER_DAY = 86400;
const LEADERBOARD_SIZE = 10;

function dayOf(timestamp) {
  return Math.floor(timestamp / SECONDS_PER_DAY);
}

class CheckinMirror {
  constructor() {
    this.users = new Map(); // address -> {currentStreak, longestStreak, totalCheckins, lastCheckinDay}
    this.leaderboard = []; // addresses, sorted desc by stored currentStreak
    this.agentIds = new Set(); // addresses holding an Agent ID
  }

  _stats(addr) {
    if (!this.users.has(addr)) {
      this.users.set(addr, { currentStreak: 0, longestStreak: 0, totalCheckins: 0, lastCheckinDay: 0 });
    }
    return this.users.get(addr);
  }

  holdsAgentId(addr) {
    return this.agentIds.has(addr);
  }

  checkIn(addr, timestamp) {
    // require(holdsAgentId(msg.sender), "caller does not hold an Agent ID");
    if (!this.holdsAgentId(addr)) throw new Error("caller does not hold an Agent ID");
    const day = dayOf(timestamp);
    const stats = this._stats(addr);
    // require(stats.lastCheckinDay != day, "already checked in today");
    if (stats.lastCheckinDay === day) throw new Error("already checked in today");
    if (stats.lastCheckinDay !== 0 && stats.lastCheckinDay === day - 1) {
      stats.currentStreak += 1;
    } else {
      stats.currentStreak = 1;
    }
    if (stats.currentStreak > stats.longestStreak) stats.longestStreak = stats.currentStreak;
    stats.totalCheckins += 1;
    stats.lastCheckinDay = day;
    this._updateLeaderboard(addr, timestamp);
    return { ...stats, day };
  }

  effectiveStreak(addr, timestamp) {
    const stats = this._stats(addr);
    if (stats.lastCheckinDay === 0) return 0;
    if (dayOf(timestamp) > stats.lastCheckinDay + 1) return 0;
    return stats.currentStreak;
  }

  getLeaderboard(timestamp) {
    return this.leaderboard.map((addr) => ({ addr, streak: this.effectiveStreak(addr, timestamp) }));
  }

  _updateLeaderboard(user, timestamp) {
    const streak = this._stats(user).currentStreak;
    const day = dayOf(timestamp);
    // Prune expired entries first (mirror of the contract fix for review M1):
    // a stored streak is dead once its owner has missed the whole UTC day
    // after their last check-in, so it must not keep a slot.
    this.leaderboard = this.leaderboard.filter(
      (entry) => day <= this._stats(entry).lastCheckinDay + 1
    );
    let len = this.leaderboard.length;
    let existingIndex = len;
    for (let i = 0; i < len; i++) {
      if (this.leaderboard[i] === user) { existingIndex = i; break; }
    }
    if (existingIndex !== len) {
      this.leaderboard.splice(existingIndex, 1);
      len -= 1;
    }
    let pos = len;
    for (let i = 0; i < len; i++) {
      if (streak > this._stats(this.leaderboard[i]).currentStreak) { pos = i; break; }
    }
    if (pos === len && len >= LEADERBOARD_SIZE) return;
    this.leaderboard.splice(pos, 0, user);
    if (this.leaderboard.length > LEADERBOARD_SIZE) this.leaderboard.length = LEADERBOARD_SIZE;
  }
}

// ---------- test harness ----------
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name} — ${e.message}`);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}
function throws(fn, msg, what) {
  try {
    fn();
  } catch (e) {
    if (e.message !== msg) throw new Error(`${what}: wrong error "${e.message}", expected "${msg}"`);
    return;
  }
  throw new Error(`${what}: expected an error but none was thrown`);
}

// Use a fixed base time: 2026-11-18 00:00 UTC = day 20380.
const DAY0 = Date.UTC(2026, 10, 18) / 1000;
const ALICE = "0xalice";
const BOB = "0xbob";

test("first check-in starts a streak of 1", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  const r = c.checkIn(ALICE, DAY0 + 3600);
  eq(r.currentStreak, 1, "streak");
  eq(r.longestStreak, 1, "longest");
  eq(r.totalCheckins, 1, "total");
  eq(r.lastCheckinDay, dayOf(DAY0), "day");
});

test("second check-in on the same UTC day reverts", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.checkIn(ALICE, DAY0 + 3600);
  throws(() => c.checkIn(ALICE, DAY0 + 7200), "already checked in today", "same-day");
});

test("check-in the next day grows the streak to 2", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.checkIn(ALICE, DAY0 + 3600);
  const r = c.checkIn(ALICE, DAY0 + SECONDS_PER_DAY + 3600);
  eq(r.currentStreak, 2, "streak");
  eq(r.totalCheckins, 2, "total");
});

test("missing a day resets the streak to 1 and keeps the longest", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.checkIn(ALICE, DAY0 + 3600);
  c.checkIn(ALICE, DAY0 + SECONDS_PER_DAY + 3600); // streak 2
  const r = c.checkIn(ALICE, DAY0 + 3 * SECONDS_PER_DAY + 3600); // skipped a day
  eq(r.currentStreak, 1, "streak after a missed day");
  eq(r.longestStreak, 2, "longest preserved");
  eq(r.totalCheckins, 3, "total");
});

test("a 7-day run reaches a streak of 7", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  for (let d = 0; d < 7; d++) c.checkIn(ALICE, DAY0 + d * SECONDS_PER_DAY + 100);
  eq(c._stats(ALICE).currentStreak, 7, "streak");
  eq(c._stats(ALICE).longestStreak, 7, "longest");
});

test("check-in without an Agent ID reverts", () => {
  const c = new CheckinMirror();
  throws(() => c.checkIn(ALICE, DAY0 + 3600), "caller does not hold an Agent ID", "no Agent ID");
});

test("effective streak is 0 after more than one missed day", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.checkIn(ALICE, DAY0 + 3600);
  c.checkIn(ALICE, DAY0 + SECONDS_PER_DAY + 3600); // streak 2
  eq(c.effectiveStreak(ALICE, DAY0 + 2 * SECONDS_PER_DAY + 3600), 2, "still alive on the next day");
  eq(c.effectiveStreak(ALICE, DAY0 + 3 * SECONDS_PER_DAY + 3600), 0, "expired after a missed day");
  eq(c.effectiveStreak(BOB, DAY0), 0, "never checked in");
});

test("leaderboard orders by streak, best first (expired entries pruned)", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.agentIds.add(BOB);
  c.checkIn(ALICE, DAY0 + 100);
  c.checkIn(BOB, DAY0 + 100);
  c.checkIn(BOB, DAY0 + SECONDS_PER_DAY + 100);
  c.checkIn(BOB, DAY0 + 2 * SECONDS_PER_DAY + 100); // bob streak 3
  // Alice's last check-in was day 0; bob's day-2 check-in prunes her:
  // her streak expired (day 2 > 0 + 1), so she no longer occupies a slot.
  const board = c.getLeaderboard(DAY0 + 2 * SECONDS_PER_DAY + 200);
  eq(board.length, 1, "board length after pruning");
  eq(board[0].addr, BOB, "first place");
  eq(board[0].streak, 3, "first streak");
});

test("a pruned slot is freed for a live user", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.agentIds.add(BOB);
  for (let d = 0; d < 5; d++) c.checkIn(ALICE, DAY0 + d * SECONDS_PER_DAY + 100); // alice streak 5
  // Alice stops. Three days later bob checks in; alice's streak is expired
  // and pruned, so bob (streak 1) takes the top slot instead of sitting
  // below a dead streak of 5.
  c.checkIn(BOB, DAY0 + 8 * SECONDS_PER_DAY + 100);
  const board = c.getLeaderboard(DAY0 + 8 * SECONDS_PER_DAY + 200);
  eq(board.length, 1, "board length");
  eq(board[0].addr, BOB, "bob takes the slot");
  eq(board[0].streak, 1, "bob streak");
});

test("leaderboard caps at 10 and drops the lowest", () => {
  const c = new CheckinMirror();
  // All 12 users stay live on day 11: user i checks in on days (11-i)..11,
  // ending with streak i+1. The board must keep the top 10 and drop the
  // two lowest (streaks 1 and 2).
  for (let i = 0; i < 12; i++) {
    const addr = "0xuser" + i;
    c.agentIds.add(addr);
    for (let d = 11 - i; d <= 11; d++) c.checkIn(addr, DAY0 + d * SECONDS_PER_DAY + 100);
  }
  const board = c.getLeaderboard(DAY0 + 11 * SECONDS_PER_DAY + 200);
  eq(board.length, 10, "board length");
  eq(board[0].addr, "0xuser11", "top address");
  eq(board[0].streak, 12, "top streak");
  eq(board[9].addr, "0xuser2", "10th place address");
  eq(board[9].streak, 3, "10th streak (live, not expired)");
});

test("a user climbs the board when their streak grows", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.agentIds.add(BOB);
  c.checkIn(BOB, DAY0 + 100);
  c.checkIn(BOB, DAY0 + SECONDS_PER_DAY + 100);
  c.checkIn(BOB, DAY0 + 2 * SECONDS_PER_DAY + 100); // bob streak 3
  c.checkIn(ALICE, DAY0 + 3 * SECONDS_PER_DAY + 100); // alice streak 1, day 3
  let board = c.getLeaderboard(DAY0 + 3 * SECONDS_PER_DAY + 200);
  eq(board[0].addr, BOB, "bob leads first");
  for (let d = 4; d <= 6; d++) c.checkIn(ALICE, DAY0 + d * SECONDS_PER_DAY + 100); // alice streak 4
  board = c.getLeaderboard(DAY0 + 6 * SECONDS_PER_DAY + 200);
  eq(board[0].addr, ALICE, "alice takes the lead");
  eq(board[0].streak, 4, "alice streak");
});

test("UTC day boundary: 23:59 and 00:01 are different days", () => {
  const c = new CheckinMirror();
  c.agentIds.add(ALICE);
  c.checkIn(ALICE, DAY0 + 86340); // 23:59 UTC
  const r = c.checkIn(ALICE, DAY0 + 86460); // 00:01 UTC next day
  eq(r.currentStreak, 2, "consecutive across midnight");
  eq(r.lastCheckinDay, dayOf(DAY0) + 1, "new day number");
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
