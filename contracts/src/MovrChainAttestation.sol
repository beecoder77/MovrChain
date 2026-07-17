// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IClubOf {
    function clubOf(address account) external view returns (uint256);
}

/// @title MovrChainAttestation
/// @notice Run commitments on Monad. Self-attest is optional; owner can require ATTESTER_ROLE.
/// @dev `runHash` = keccak256(abi.encode(runner, distanceMeters, durationSeconds, routeCommit)).
///      Club membership for rewards is snapshotted at attest time into `clubIdAtAttest`.
contract MovrChainAttestation is Ownable, Pausable, AccessControl {
    error AlreadyAttested();
    error InvalidDistance();
    error InvalidDuration();
    error DistanceTooHigh();
    error DurationTooHigh();
    error PaceUnrealistic();
    error DailyLimit();
    error SelfAttestDisabled();

    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    struct RunRecord {
        address runner;
        uint256 distanceMeters;
        uint256 durationSeconds;
        uint256 timestamp;
        bool milestoneMet;
        bytes32 routeCommit;
    }

    struct RunnerStats {
        uint256 totalDistanceMeters;
        uint256 runCount;
        uint256 bestSingleRunMeters;
        uint256 currentStreakDays;
        uint256 longestStreakDays;
        uint256 lastRunDay;
    }

    uint256 public constant MILESTONE_METERS = 1000;
    uint256 public constant MAX_DISTANCE_METERS = 200_000;
    uint256 public constant MAX_DURATION_SECONDS = 172_800;
    uint256 public constant MAX_METERS_PER_SECOND = 10;
    uint256 public constant MAX_ATTESTS_PER_DAY = 24;

    /// @notice When false, only ATTESTER_ROLE may attest (production / oracle path).
    bool public selfAttestEnabled = true;
    IClubOf public clubRegistry;

    mapping(bytes32 => RunRecord) public attestations;
    /// @notice Club id of the runner at the moment of attestation (0 = none). Immutable per run.
    mapping(bytes32 => uint256) public clubIdAtAttest;
    mapping(address => RunnerStats) public runnerStats;
    mapping(address => mapping(uint256 => uint256)) public attestsOnDay;

    event RunAttested(
        bytes32 indexed runHash,
        address indexed runner,
        uint256 distanceMeters,
        bool milestoneMet,
        uint256 currentStreakDays,
        bytes32 routeCommit,
        uint256 clubIdAtAttest
    );
    event SelfAttestUpdated(bool enabled);
    event ClubRegistrySet(address indexed registry);

    constructor(address owner_) Ownable(owner_) {
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ATTESTER_ROLE, owner_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setSelfAttestEnabled(bool enabled) external onlyOwner {
        selfAttestEnabled = enabled;
        emit SelfAttestUpdated(enabled);
    }

    function setClubRegistry(address registry_) external onlyOwner {
        clubRegistry = IClubOf(registry_);
        emit ClubRegistrySet(registry_);
    }

    function setAttester(address account, bool enabled) external onlyOwner {
        if (enabled) _grantRole(ATTESTER_ROLE, account);
        else _revokeRole(ATTESTER_ROLE, account);
    }

    /// @notice Self-attest (when enabled) or attester-submit for `msg.sender`.
    function attestRun(bytes32 routeCommit, uint256 distanceMeters, uint256 durationSeconds)
        external
        whenNotPaused
        returns (bytes32 runHash)
    {
        if (!selfAttestEnabled && !hasRole(ATTESTER_ROLE, msg.sender)) revert SelfAttestDisabled();
        return _attest(msg.sender, routeCommit, distanceMeters, durationSeconds);
    }

    /// @notice Trusted attester path — records a run for `runner` (oracle / backend).
    function attestRunFor(address runner, bytes32 routeCommit, uint256 distanceMeters, uint256 durationSeconds)
        external
        whenNotPaused
        onlyRole(ATTESTER_ROLE)
        returns (bytes32 runHash)
    {
        require(runner != address(0), "runner");
        return _attest(runner, routeCommit, distanceMeters, durationSeconds);
    }

    function _attest(address runner, bytes32 routeCommit, uint256 distanceMeters, uint256 durationSeconds)
        internal
        returns (bytes32 runHash)
    {
        if (distanceMeters == 0) revert InvalidDistance();
        if (durationSeconds == 0) revert InvalidDuration();
        if (distanceMeters > MAX_DISTANCE_METERS) revert DistanceTooHigh();
        if (durationSeconds > MAX_DURATION_SECONDS) revert DurationTooHigh();
        if (distanceMeters > durationSeconds * MAX_METERS_PER_SECOND) revert PaceUnrealistic();

        uint256 day = block.timestamp / 1 days;
        uint256 used = attestsOnDay[runner][day];
        if (used >= MAX_ATTESTS_PER_DAY) revert DailyLimit();

        runHash = computeRunHash(runner, distanceMeters, durationSeconds, routeCommit);
        if (attestations[runHash].runner != address(0)) revert AlreadyAttested();

        bool milestone = distanceMeters >= MILESTONE_METERS;
        uint256 clubId;
        if (address(clubRegistry) != address(0)) {
            clubId = clubRegistry.clubOf(runner);
        }

        attestations[runHash] = RunRecord({
            runner: runner,
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            timestamp: block.timestamp,
            milestoneMet: milestone,
            routeCommit: routeCommit
        });
        clubIdAtAttest[runHash] = clubId;
        attestsOnDay[runner][day] = used + 1;

        RunnerStats storage s = runnerStats[runner];
        s.totalDistanceMeters += distanceMeters;
        s.runCount += 1;
        if (distanceMeters > s.bestSingleRunMeters) {
            s.bestSingleRunMeters = distanceMeters;
        }

        if (s.currentStreakDays > 0 && day > s.lastRunDay + 1) {
            s.currentStreakDays = 0;
        }

        if (milestone) {
            if (s.currentStreakDays == 0) {
                s.currentStreakDays = 1;
            } else if (day == s.lastRunDay) {
                // same day
            } else if (day == s.lastRunDay + 1) {
                s.currentStreakDays += 1;
            } else {
                s.currentStreakDays = 1;
            }
            s.lastRunDay = day;
            if (s.currentStreakDays > s.longestStreakDays) {
                s.longestStreakDays = s.currentStreakDays;
            }
        }

        emit RunAttested(runHash, runner, distanceMeters, milestone, s.currentStreakDays, routeCommit, clubId);
    }

    function effectiveCurrentStreakDays(address runner) public view returns (uint256) {
        RunnerStats storage s = runnerStats[runner];
        if (s.currentStreakDays == 0) return 0;
        uint256 day = block.timestamp / 1 days;
        if (day > s.lastRunDay + 1) return 0;
        return s.currentStreakDays;
    }

    function computeRunHash(address runner, uint256 distanceMeters, uint256 durationSeconds, bytes32 routeCommit)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(runner, distanceMeters, durationSeconds, routeCommit));
    }

    function isAttested(bytes32 runHash) external view returns (bool) {
        return attestations[runHash].runner != address(0);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
