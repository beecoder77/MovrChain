// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MovrChainAttestation} from "./MovrChainAttestation.sol";

/// @title MovrMilestoneReward — pay MOVR proportional to verified distance
/// @notice 1 MOVR per km (distanceMeters * rewardPerKm / 1000). Requires milestoneMet (≥1 km).
contract MovrMilestoneReward is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    uint256 public constant METERS_PER_KM = 1000;

    IERC20 public immutable movr;
    MovrChainAttestation public immutable attestation;

    /// @notice MOVR wei paid per full kilometer (default 1 MOVR)
    uint256 public rewardPerKm = 1 ether;

    mapping(bytes32 => bool) public claimed;

    event RewardClaimed(bytes32 indexed runHash, address indexed runner, uint256 amount);
    event RewardPerKmUpdated(uint256 amount);
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

    /// @notice MOVR wei owed for a run (0 if not claimable by `account`)
    function previewReward(bytes32 runHash, address account) public view returns (uint256) {
        if (!claimable(runHash, account)) return 0;
        (, uint256 distanceMeters, , , ) = attestation.attestations(runHash);
        return (distanceMeters * rewardPerKm) / METERS_PER_KM;
    }

    /// @notice Claim MOVR for a verified milestone run (1 MOVR × km attested)
    function claim(bytes32 runHash) external nonReentrant returns (uint256 amount) {
        require(claimable(runHash, msg.sender), "not claimable");
        (, uint256 distanceMeters, , , ) = attestation.attestations(runHash);
        amount = (distanceMeters * rewardPerKm) / METERS_PER_KM;
        require(amount > 0, "zero reward");
        require(movr.balanceOf(address(this)) >= amount, "empty pool");
        claimed[runHash] = true;
        movr.safeTransfer(msg.sender, amount);
        emit RewardClaimed(runHash, msg.sender, amount);
    }
}
