// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title MovrChainAttestation
/// @notice Self-attested run commitments on Monad (not a GPS oracle).
/// @dev `runHash` is derived on-chain as
///      keccak256(abi.encode(msg.sender, distanceMeters, durationSeconds, routeCommit))
///      so metrics cannot be swapped against an arbitrary hash, and another wallet cannot
///      front-run someone else's commitment.
contract MovrChainAttestation is Ownable, Pausable {
    error AlreadyAttested();
    error InvalidDistance();
    error InvalidDuration();
    error DistanceTooHigh();
    error DurationTooHigh();
    error PaceUnrealistic();
    error DailyLimit();

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
        uint256 lastRunDay; // UTC day index = timestamp / 1 days
    }

    /// @notice Minimum distance that counts toward streak + milestone flag
    uint256 public constant MILESTONE_METERS = 1000;
    /// @notice Hard cap (~200 km) — anti-farm sanity bound
    uint256 public constant MAX_DISTANCE_METERS = 200_000;
    /// @notice Hard cap (~48 h) for a single activity
    uint256 public constant MAX_DURATION_SECONDS = 172_800;
    /// @notice Max average speed ~10 m/s (~36 km/h) — blocks teleport claims
    uint256 public constant MAX_METERS_PER_SECOND = 10;
    /// @notice Soft anti-spam: attestations per UTC day per wallet
    uint256 public constant MAX_ATTESTS_PER_DAY = 24;

    mapping(bytes32 => RunRecord) public attestations;
    mapping(address => RunnerStats) public runnerStats;
    mapping(address => mapping(uint256 => uint256)) public attestsOnDay;

    event RunAttested(
        bytes32 indexed runHash,
        address indexed runner,
        uint256 distanceMeters,
        bool milestoneMet,
        uint256 currentStreakDays,
        bytes32 routeCommit
    );

    constructor(address owner_) Ownable(owner_) {}

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Commit a run. `routeCommit` should be a client hash of sampled GPX points.
    /// @return runHash Deterministic id bound to caller + metrics + routeCommit
    function attestRun(bytes32 routeCommit, uint256 distanceMeters, uint256 durationSeconds)
        external
        whenNotPaused
        returns (bytes32 runHash)
    {
        if (distanceMeters == 0) revert InvalidDistance();
        if (durationSeconds == 0) revert InvalidDuration();
        if (distanceMeters > MAX_DISTANCE_METERS) revert DistanceTooHigh();
        if (durationSeconds > MAX_DURATION_SECONDS) revert DurationTooHigh();
        // distance / duration <= MAX_METERS_PER_SECOND  <=>  distance <= duration * max
        if (distanceMeters > durationSeconds * MAX_METERS_PER_SECOND) revert PaceUnrealistic();

        uint256 day = block.timestamp / 1 days;
        uint256 used = attestsOnDay[msg.sender][day];
        if (used >= MAX_ATTESTS_PER_DAY) revert DailyLimit();

        runHash = computeRunHash(msg.sender, distanceMeters, durationSeconds, routeCommit);
        if (attestations[runHash].runner != address(0)) revert AlreadyAttested();

        bool milestone = distanceMeters >= MILESTONE_METERS;

        attestations[runHash] = RunRecord({
            runner: msg.sender,
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            timestamp: block.timestamp,
            milestoneMet: milestone,
            routeCommit: routeCommit
        });

        attestsOnDay[msg.sender][day] = used + 1;

        RunnerStats storage s = runnerStats[msg.sender];
        s.totalDistanceMeters += distanceMeters;
        s.runCount += 1;
        if (distanceMeters > s.bestSingleRunMeters) {
            s.bestSingleRunMeters = distanceMeters;
        }

        // Streak: UTC days with ≥1 km
        if (milestone) {
            if (s.lastRunDay == 0) {
                s.currentStreakDays = 1;
            } else if (day == s.lastRunDay) {
                // same day — keep streak
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

        emit RunAttested(runHash, msg.sender, distanceMeters, milestone, s.currentStreakDays, routeCommit);
    }

    function computeRunHash(
        address runner,
        uint256 distanceMeters,
        uint256 durationSeconds,
        bytes32 routeCommit
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(runner, distanceMeters, durationSeconds, routeCommit));
    }

    function isAttested(bytes32 runHash) external view returns (bool) {
        return attestations[runHash].runner != address(0);
    }
}
