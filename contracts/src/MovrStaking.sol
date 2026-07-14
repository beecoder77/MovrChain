// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AchievementNFT} from "./AchievementNFT.sol";

/// @title MovrStaking — stake MOVR; more Achievements → faster rewards
/// @notice Reward rate in MOVR/second per MOVR staked is baseRate + (baseRate * boostBps / 10000).
///         Cap boost at maxBoostBps (admin-configurable).
contract MovrStaking is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20 public immutable movr;
    AchievementNFT public immutable achievements;

    uint256 public rewardPerTokenPerSecond; // base rate (wei MOVR per staked wei per second)
    uint256 public maxBoostBps = 10_000; // 100% max boost by default
    uint256 public baseAchievementBoostBps = 200; // +2% per achievement held (admin overrideable)
    bool public useDefBoost; // if true, use each NFT's stakingBoostBps; else count * baseAchievementBoostBps

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt; // accrued but not yet claimed snapshot
        uint256 lastUpdate;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 reward);
    event RatesUpdated(uint256 rewardPerTokenPerSecond, uint256 maxBoostBps, uint256 baseAchievementBoostBps);

    constructor(address owner_, address movr_, address achievements_) {
        require(owner_ != address(0) && movr_ != address(0) && achievements_ != address(0), "zero");
        movr = IERC20(movr_);
        achievements = AchievementNFT(achievements_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
        // Default: ~10% APY ≈ 0.1 / year / second relative to 1e18 — set conservatively for demo
        // 1e18 staked earning 3.17e9 wei/sec ≈ ~10% APY. Use small demo rate.
        rewardPerTokenPerSecond = 3e9;
        useDefBoost = true;
    }

    function setAdmin(address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled) _grantRole(ADMIN_ROLE, account);
        else _revokeRole(ADMIN_ROLE, account);
    }

    function configureRates(
        uint256 rewardPerTokenPerSecond_,
        uint256 maxBoostBps_,
        uint256 baseAchievementBoostBps_,
        bool useDefBoost_
    ) external onlyRole(ADMIN_ROLE) {
        rewardPerTokenPerSecond = rewardPerTokenPerSecond_;
        maxBoostBps = maxBoostBps_;
        baseAchievementBoostBps = baseAchievementBoostBps_;
        useDefBoost = useDefBoost_;
        emit RatesUpdated(rewardPerTokenPerSecond_, maxBoostBps_, baseAchievementBoostBps_);
    }

    /// @notice Fund the staking contract with MOVR rewards (owner/admin transfer + approve, then call)
    function fundRewards(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        movr.safeTransferFrom(msg.sender, address(this), amount);
    }

    function boostBpsOf(address account) public view returns (uint256 boost) {
        if (useDefBoost) {
            boost = achievements.totalStakingBoostBps(account);
        } else {
            boost = achievements.ownedAchievementCount(account) * baseAchievementBoostBps;
        }
        if (boost > maxBoostBps) boost = maxBoostBps;
    }

    function pendingReward(address account) public view returns (uint256) {
        StakeInfo memory s = stakes[account];
        if (s.amount == 0) return s.rewardDebt;
        uint256 elapsed = block.timestamp - s.lastUpdate;
        uint256 boost = boostBpsOf(account);
        uint256 rate = rewardPerTokenPerSecond + (rewardPerTokenPerSecond * boost) / 10_000;
        uint256 accrued = (s.amount * rate * elapsed) / 1e18;
        return s.rewardDebt + accrued;
    }

    function _harvest(address account) internal {
        StakeInfo storage s = stakes[account];
        if (s.amount > 0 && s.lastUpdate > 0) {
            uint256 elapsed = block.timestamp - s.lastUpdate;
            uint256 boost = boostBpsOf(account);
            uint256 rate = rewardPerTokenPerSecond + (rewardPerTokenPerSecond * boost) / 10_000;
            s.rewardDebt += (s.amount * rate * elapsed) / 1e18;
        }
        s.lastUpdate = block.timestamp;
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        _harvest(msg.sender);
        movr.safeTransferFrom(msg.sender, address(this), amount);
        stakes[msg.sender].amount += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(amount > 0 && s.amount >= amount, "balance");
        _harvest(msg.sender);
        s.amount -= amount;
        totalStaked -= amount;
        movr.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant {
        _harvest(msg.sender);
        uint256 reward = stakes[msg.sender].rewardDebt;
        require(reward > 0, "none");
        stakes[msg.sender].rewardDebt = 0;
        require(movr.balanceOf(address(this)) >= reward + totalStaked, "insufficient rewards");
        movr.safeTransfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }
}
