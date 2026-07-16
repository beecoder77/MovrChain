// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MovrChainAttestation} from "./MovrChainAttestation.sol";
import {ClubTreasury} from "./ClubTreasury.sol";

interface IClubRegistryForReward {
    function clubOf(address account) external view returns (uint256);
    function getClub(uint256 clubId)
        external
        view
        returns (
            string memory name,
            address creator,
            address treasury,
            uint64 createdAt,
            bool exists,
            uint256 memberCount_,
            bool isPublic
        );
}

/// @title MovrMilestoneReward — pay MOVR proportional to verified distance
/// @notice Runner: 1 MOVR/km. If in a club: +1 MOVR/10km to that club treasury (additive; credits top-donor stats).
contract MovrMilestoneReward is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint256 public constant METERS_PER_KM = 1000;
    /// @notice Distance used for club cut: 1 MOVR per 10 km
    uint256 public constant METERS_PER_CLUB_REWARD = 10_000;

    IERC20 public immutable movr;
    MovrChainAttestation public immutable attestation;
    IClubRegistryForReward public clubRegistry;

    /// @notice MOVR wei paid to runner per full kilometer (default 1 MOVR)
    uint256 public rewardPerKm = 1 ether;
    /// @notice MOVR wei paid to club treasury per 10 km (default 1 MOVR)
    uint256 public clubRewardPer10Km = 1 ether;

    mapping(bytes32 => bool) public claimed;

    event RewardClaimed(
        bytes32 indexed runHash,
        address indexed runner,
        uint256 runnerAmount,
        uint256 clubAmount,
        address indexed treasury
    );
    event RewardPerKmUpdated(uint256 amount);
    event ClubRewardPer10KmUpdated(uint256 amount);
    event ClubRegistrySet(address indexed registry);
    event Funded(address indexed from, uint256 amount);

    constructor(address owner_, address movr_, address attestation_) {
        require(owner_ != address(0) && movr_ != address(0) && attestation_ != address(0), "zero");
        movr = IERC20(movr_);
        attestation = MovrChainAttestation(attestation_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
    }

    function setRewardPerKm(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "amount");
        rewardPerKm = amount;
        emit RewardPerKmUpdated(amount);
    }

    function setClubRewardPer10Km(uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "amount");
        clubRewardPer10Km = amount;
        emit ClubRewardPer10KmUpdated(amount);
    }

    function setClubRegistry(address registry_) external onlyRole(ADMIN_ROLE) {
        require(registry_ != address(0), "zero");
        clubRegistry = IClubRegistryForReward(registry_);
        emit ClubRegistrySet(registry_);
    }

    /// @notice Pull MOVR into the reward pool (caller must approve this contract)
    function fund(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(amount > 0, "amount");
        movr.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function claimable(bytes32 runHash, address account) public view returns (bool) {
        if (claimed[runHash] || account == address(0)) return false;
        (
            address runner,
            ,
            ,
            ,
            bool milestoneMet
        ) = attestation.attestations(runHash);
        return runner == account && milestoneMet;
    }

    /// @notice Runner MOVR wei owed for a run (0 if not claimable by `account`)
    function previewReward(bytes32 runHash, address account) public view returns (uint256) {
        if (!claimable(runHash, account)) return 0;
        (, uint256 distanceMeters, , , ) = attestation.attestations(runHash);
        return (distanceMeters * rewardPerKm) / METERS_PER_KM;
    }

    /// @notice Club treasury MOVR for this run if `account` is in a club (0 otherwise)
    function previewClubReward(bytes32 runHash, address account) public view returns (uint256) {
        if (!claimable(runHash, account)) return 0;
        if (address(clubRegistry) == address(0)) return 0;
        if (clubRegistry.clubOf(account) == 0) return 0;
        (, uint256 distanceMeters, , , ) = attestation.attestations(runHash);
        return (distanceMeters * clubRewardPer10Km) / METERS_PER_CLUB_REWARD;
    }

    /// @notice Claim runner MOVR; if in a club, also fund treasury (1 MOVR/10km) with donor credit
    function claim(bytes32 runHash) external nonReentrant returns (uint256 amount) {
        require(claimable(runHash, msg.sender), "not claimable");
        (, uint256 distanceMeters, , , ) = attestation.attestations(runHash);
        amount = (distanceMeters * rewardPerKm) / METERS_PER_KM;
        require(amount > 0, "zero reward");

        uint256 clubAmount;
        address treasury;
        if (address(clubRegistry) != address(0)) {
            uint256 clubId = clubRegistry.clubOf(msg.sender);
            if (clubId != 0) {
                clubAmount = (distanceMeters * clubRewardPer10Km) / METERS_PER_CLUB_REWARD;
                if (clubAmount > 0) {
                    (, , treasury, , , , ) = clubRegistry.getClub(clubId);
                    require(treasury != address(0), "treasury");
                }
            }
        }

        uint256 total = amount + clubAmount;
        require(movr.balanceOf(address(this)) >= total, "empty pool");
        claimed[runHash] = true;

        movr.safeTransfer(msg.sender, amount);
        if (clubAmount > 0) {
            movr.safeTransfer(treasury, clubAmount);
            ClubTreasury(treasury).recordDonation(msg.sender, clubAmount);
        }

        emit RewardClaimed(runHash, msg.sender, amount, clubAmount, treasury);
    }
}
