// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AchievementNFT} from "./AchievementNFT.sol";
import {ClubTreasury} from "./ClubTreasury.sol";
import {MovrClubRegistry} from "./MovrClubRegistry.sol";

/// @title MovrStaking — stake MOVR; achievements boost rewards; optional club yield donate
/// @notice On claim, donateBps (200–500 or 0) of rewards go to the member's club treasury.
contract MovrStaking is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant MIN_DONATE_BPS = 200;
    uint256 public constant MAX_DONATE_BPS = 500;

    IERC20 public immutable movr;
    AchievementNFT public immutable achievements;
    MovrClubRegistry public clubRegistry;

    uint256 public rewardPerTokenPerSecond;
    uint256 public maxBoostBps = 10_000;
    uint256 public baseAchievementBoostBps = 200;
    bool public useDefBoost;

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastUpdate;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;

    /// @notice 0 = off; else 200–500 basis points of claim to club treasury
    mapping(address => uint16) public donateBps;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 kept, uint256 donated, address treasury);
    event RatesUpdated(uint256 rewardPerTokenPerSecond, uint256 maxBoostBps, uint256 baseAchievementBoostBps);
    event DonatePrefsUpdated(address indexed user, uint16 bps);
    event ClubRegistrySet(address indexed registry);

    constructor(address owner_, address movr_, address achievements_) {
        require(owner_ != address(0) && movr_ != address(0) && achievements_ != address(0), "zero");
        movr = IERC20(movr_);
        achievements = AchievementNFT(achievements_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
        rewardPerTokenPerSecond = 3e9;
        useDefBoost = true;
    }

    function setClubRegistry(address registry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(registry_ != address(0), "zero");
        clubRegistry = MovrClubRegistry(registry_);
        emit ClubRegistrySet(registry_);
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

    function fundRewards(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        movr.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Turn on/off automatic yield donate to your club treasury (200–500 bps, or 0 = off).
    function setDonateBps(uint16 bps) external {
        require(bps == 0 || (bps >= MIN_DONATE_BPS && bps <= MAX_DONATE_BPS), "bps");
        if (bps > 0) {
            require(address(clubRegistry) != address(0), "registry");
            uint256 clubId = clubRegistry.clubOf(msg.sender);
            require(clubId != 0, "no club");
        }
        donateBps[msg.sender] = bps;
        emit DonatePrefsUpdated(msg.sender, bps);
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

        uint16 bps = donateBps[msg.sender];
        uint256 donated;
        address treasury;
        if (bps > 0 && address(clubRegistry) != address(0)) {
            uint256 clubId = clubRegistry.clubOf(msg.sender);
            if (clubId != 0) {
                (, , treasury,,,,) = clubRegistry.getClub(clubId);
                donated = (reward * uint256(bps)) / 10_000;
                if (donated > 0 && treasury != address(0)) {
                    movr.safeTransfer(treasury, donated);
                    ClubTreasury(treasury).recordDonation(msg.sender, donated);
                } else {
                    donated = 0;
                    treasury = address(0);
                }
            }
        }

        uint256 kept = reward - donated;
        if (kept > 0) {
            movr.safeTransfer(msg.sender, kept);
        }
        emit Claimed(msg.sender, kept, donated, treasury);
    }
}
