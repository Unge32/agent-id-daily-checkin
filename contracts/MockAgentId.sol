// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockAgentId — TESTNET ONLY mock of the Agent ID registry
/// @notice The real Agent ID contract (SPACE ID Agent ID, ERC-721,
///  non-transferable) exists on BNB Chain mainnet at
///  0x60b9262456de011f7d15a54cdd8c48baaa8b022f, but it is NOT deployed on
///  BNB testnet. This mock exists only so the check-in contract can be
///  deployed and tested on testnet: it implements the single function the
///  check-in contract reads (`balanceOf`) plus a public `mint` so a test
///  wallet can give itself a test Agent ID.
///
///  DO NOT deploy this mock on mainnet. On mainnet, pass the real Agent ID
///  contract address to the AgentIdDailyCheckin constructor instead.
///
///  This mock is deliberately minimal: it is NOT a full ERC-721 (no
///  transfers, no approvals, no metadata) because the check-in contract
///  never needs those. Anyone can mint test IDs to any address — that is
///  fine for a testnet mock and would be unacceptable on mainnet, which is
///  exactly why this file is test-only.
contract MockAgentId {
    /// @notice Human-readable name of the mock collection.
    string public name = "Mock Agent ID";

    /// @notice Symbol of the mock collection.
    string public symbol = "MAID";

    /// @notice Total test IDs ever minted.
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _owners;
    uint256 private _nextTokenId = 1;

    /// @notice Emitted on mint (from the zero address), mirroring ERC-721.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /// @notice How many test Agent IDs `account` holds.
    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    /// @notice Owner of one test ID. Reverts for IDs that were never minted.
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "token does not exist");
        return owner;
    }

    /// @notice Mint one test Agent ID to `to`. Anyone may call this on testnet.
    /// @return tokenId The new test ID (starts at 1, increments per mint).
    function mint(address to) external returns (uint256) {
        require(to != address(0), "zero address");
        uint256 tokenId = _nextTokenId++;
        _owners[tokenId] = to;
        _balances[to] += 1;
        totalSupply += 1;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
}
