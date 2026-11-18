// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Agent ID Daily Check-in
/// @author Built fresh for the Binance Agent ID Hackathon (Nov–Dec 2026)
/// @notice A daily check-in / streak dApp gated by Agent ID.
///
/// HOW AGENT ID IS USED
/// - Only addresses that hold an Agent ID (an ERC-721 name like `name.ai`)
///   can call `checkIn()`. Holding is verified on-chain by calling
///   `balanceOf(address)` on the Agent ID registry contract and requiring
///   the result to be greater than zero. Agent ID is therefore the access
///   control for the whole product: no Agent ID, no check-in.
///
/// WHAT THIS CONTRACT DOES NOT DO (hackathon safety red lines)
/// - It holds NO user funds: `checkIn()` is not payable and there is no
///   deposit, prize pool, or payout of any kind. Users only pay their own
///   gas for the check-in transaction.
/// - It promises NO returns: there are no tokens, no rewards, no yield,
///   no "passive income" of any kind. A streak is just an on-chain record.
/// - It has NO owner / admin: there are no privileged functions at all, so
///   there are no owner permissions to disclose or abuse.
/// - It performs NO transfers: no token transfers, no approvals, no
///   scheduled or automatic movement of any asset, and no interaction with
///   any other contract besides the read-only `balanceOf` call above.
/// - It collects NO credentials: no seed phrases, private keys, API secrets
///   or pairing codes are ever requested, on-chain or off-chain.
///
/// DEPLOYMENT NOTES
/// - The Agent ID registry address is set once in the constructor (immutable).
///   On BNB Chain mainnet it is the real Agent ID contract:
///   0x60b9262456de011f7d15a54cdd8c48baaa8b022f (SPACE ID Agent ID, ERC-721,
///   non-transferable). On BNB testnet that contract does not exist, so a
///   test-only mock registry (MockAgentId.sol) is deployed instead and its
///   address is passed to the constructor.
/// - A "day" is a UTC day: `block.timestamp / 86400`. A user can check in
///   at most once per UTC day. Checking in on consecutive days grows the
///   streak; missing a day resets it to 1 on the next check-in.
/// - The leaderboard keeps the top 10 addresses by stored current streak.
///   Entries whose streak has expired are pruned on every check-in, and
///   `getLeaderboard()` reports the *effective* streak: 0 once more than one
///   UTC day has passed since the last check-in, so a stale streak can never
///   sit above a live one.
interface IAgentIdRegistry {
    /// @notice Returns how many Agent IDs `account` holds (> 0 = holds one).
    function balanceOf(address account) external view returns (uint256);
}

contract AgentIdDailyCheckin {
    /// @notice The Agent ID registry used to gate check-ins (immutable).
    IAgentIdRegistry public immutable agentIdRegistry;

    /// @notice Seconds in one UTC day.
    uint256 public constant SECONDS_PER_DAY = 86400;

    /// @notice Maximum number of entries on the leaderboard.
    uint8 public constant LEADERBOARD_SIZE = 10;

    /// @notice Per-user check-in record.
    struct UserStats {
        uint256 currentStreak; // streak as of the last check-in
        uint256 longestStreak; // best streak ever
        uint256 totalCheckins; // lifetime check-ins
        uint256 lastCheckinDay; // UTC day number of the last check-in (0 = never)
    }

    /// @notice Check-in records, keyed by user address.
    mapping(address => UserStats) private users;

    /// @notice Top addresses by stored current streak, sorted descending.
    address[] private leaderboard;

    /// @notice Emitted on every successful check-in.
    event CheckedIn(
        address indexed user,
        uint256 indexed day,
        uint256 currentStreak,
        uint256 totalCheckins
    );

    /// @param _agentIdRegistry Address of the Agent ID registry contract.
    constructor(address _agentIdRegistry) {
        require(_agentIdRegistry != address(0), "registry is zero address");
        agentIdRegistry = IAgentIdRegistry(_agentIdRegistry);
    }

    /// @notice True when `account` holds at least one Agent ID.
    /// @dev Returns false (instead of reverting) if the registry call fails,
    ///  e.g. for the zero address or a paused registry. `checkIn()` still
    ///  fails closed: a failed registry read means no check-in.
    function holdsAgentId(address account) public view returns (bool) {
        try agentIdRegistry.balanceOf(account) returns (uint256 balance) {
            return balance > 0;
        } catch {
            return false;
        }
    }

    /// @notice The current UTC day number (`block.timestamp / 86400`).
    function currentDay() public view returns (uint256) {
        return block.timestamp / SECONDS_PER_DAY;
    }

    /// @notice True when `account` already checked in on the current UTC day.
    function hasCheckedInToday(address account) public view returns (bool) {
        return users[account].lastCheckinDay == currentDay();
    }

    /// @notice Check in for today. Requires an Agent ID and no check-in yet today.
    /// @dev Only the caller's own gas is spent; nothing else moves.
    function checkIn() external {
        require(holdsAgentId(msg.sender), "caller does not hold an Agent ID");

        uint256 day = currentDay();
        UserStats storage stats = users[msg.sender];
        require(stats.lastCheckinDay != day, "already checked in today");

        if (stats.lastCheckinDay != 0 && stats.lastCheckinDay == day - 1) {
            stats.currentStreak += 1;
        } else {
            // First check-in ever, or a day was missed: streak restarts at 1.
            stats.currentStreak = 1;
        }
        if (stats.currentStreak > stats.longestStreak) {
            stats.longestStreak = stats.currentStreak;
        }
        stats.totalCheckins += 1;
        stats.lastCheckinDay = day;

        _updateLeaderboard(msg.sender);

        emit CheckedIn(msg.sender, day, stats.currentStreak, stats.totalCheckins);
    }

    /// @notice Full record for one user, plus their Agent ID / today status.
    function getUser(address account)
        external
        view
        returns (UserStats memory stats, bool holdsId, bool checkedInToday)
    {
        stats = users[account];
        holdsId = holdsAgentId(account);
        checkedInToday = stats.lastCheckinDay == currentDay();
    }

    /// @notice A user's streak as it stands right now: 0 once more than one
    ///  UTC day has passed since their last check-in (i.e. the whole UTC day
    ///  after it was missed), otherwise their stored current streak.
    function effectiveStreak(address account) public view returns (uint256) {
        UserStats storage stats = users[account];
        if (stats.lastCheckinDay == 0) {
            return 0;
        }
        if (currentDay() > stats.lastCheckinDay + 1) {
            return 0;
        }
        return stats.currentStreak;
    }

    /// @notice The leaderboard: top addresses with their effective streaks.
    ///  Entries whose streak has expired are pruned on every check-in, so
    ///  the board never shows a stale streak above a live one.
    /// @return addrs The ranked addresses, best streak first.
    /// @return streaks The matching effective streaks (0 = streak expired).
    function getLeaderboard()
        external
        view
        returns (address[] memory addrs, uint256[] memory streaks)
    {
        uint256 len = leaderboard.length;
        addrs = new address[](len);
        streaks = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            addrs[i] = leaderboard[i];
            streaks[i] = effectiveStreak(leaderboard[i]);
        }
    }

    /// @notice Number of addresses currently on the leaderboard.
    function leaderboardLength() external view returns (uint256) {
        return leaderboard.length;
    }

    /// @dev Keeps `leaderboard` sorted descending by stored current streak,
    ///  capped at LEADERBOARD_SIZE entries. Called on every check-in.
    ///  Expired entries are pruned first: a stored streak is dead once its
    ///  owner has missed the whole UTC day after their last check-in, so it
    ///  must not keep a slot (or rank above a live streak). The caller has
    ///  just checked in, so they are never pruned by this step.
    ///  TRUST ASSUMPTION: `checkIn()` calls the registry's `balanceOf`
    ///  before any state changes. The registry is immutable and is either
    ///  the known SPACE ID Agent ID contract or the test-only mock, so a
    ///  re-entrant registry is not a realistic threat; no funds are at stake
    ///  in any case.
    function _updateLeaderboard(address user) internal {
        uint256 streak = users[user].currentStreak;
        uint256 day = currentDay();

        uint256 write = 0;
        for (uint256 i = 0; i < leaderboard.length; i++) {
            address entry = leaderboard[i];
            if (day <= users[entry].lastCheckinDay + 1) {
                leaderboard[write] = entry;
                write++;
            }
        }
        while (leaderboard.length > write) {
            leaderboard.pop();
        }

        uint256 len = leaderboard.length;

        // Remove the user from their old position, if present.
        uint256 existingIndex = len; // sentinel value: not found
        for (uint256 i = 0; i < len; i++) {
            if (leaderboard[i] == user) {
                existingIndex = i;
                break;
            }
        }
        if (existingIndex != len) {
            for (uint256 i = existingIndex; i < len - 1; i++) {
                leaderboard[i] = leaderboard[i + 1];
            }
            leaderboard.pop();
            len -= 1;
        }

        // Find where the new streak belongs (sorted descending).
        uint256 pos = len; // sentinel value: after the last entry
        for (uint256 i = 0; i < len; i++) {
            if (streak > users[leaderboard[i]].currentStreak) {
                pos = i;
                break;
            }
        }
        // If the board is full and the streak does not beat the last entry,
        // the user does not make the board.
        if (pos == len && len >= LEADERBOARD_SIZE) {
            return;
        }
        if (len < LEADERBOARD_SIZE) {
            leaderboard.push(address(0));
            len += 1;
        }
        // Shift entries right to open the slot, then insert.
        for (uint256 i = len - 1; i > pos; i--) {
            leaderboard[i] = leaderboard[i - 1];
        }
        leaderboard[pos] = user;
    }
}
