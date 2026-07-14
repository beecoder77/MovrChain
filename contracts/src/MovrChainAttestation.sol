// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MovrChainAttestation
/// @notice On-chain GPX run proofs + streak tracking for achievement eligibility
contract MovrChainAttestation {
    struct RunRecord {
        address runner;
        uint256 distanceMeters;
        uint256 durationSeconds;
        uint256 timestamp;
        bool milestoneMet;
    }

    struct RunnerStats {
        uint256 totalDistanceMeters;
        uint256 runCount;
        uint256 bestSingleRunMeters;
        uint256 currentStreakDays;
        uint256 longestStreakDays;
        uint256 lastRunDay; // UTC day index = timestamp / 1 days
    }

    uint256 public constant MILESTONE_METERS = 1000;

    mapping(bytes32 => RunRecord) public attestations;
    mapping(address => RunnerStats) public runnerStats;

    event RunAttested(
        bytes32 indexed runHash,
        address indexed runner,
        uint256 distanceMeters,
        bool milestoneMet,
        uint256 currentStreakDays
    );

    function attestRun(
        bytes32 runHash,
        uint256 distanceMeters,
        uint256 durationSeconds
    ) external {
        require(attestations[runHash].runner == address(0), "Already attested");
        require(distanceMeters > 0, "Invalid distance");
        require(durationSeconds > 0, "Invalid duration");

        bool milestone = distanceMeters >= MILESTONE_METERS;

        attestations[runHash] = RunRecord({
            runner: msg.sender,
            distanceMeters: distanceMeters,
            durationSeconds: durationSeconds,
            timestamp: block.timestamp,
            milestoneMet: milestone
        });

        RunnerStats storage s = runnerStats[msg.sender];
        s.totalDistanceMeters += distanceMeters;
        s.runCount += 1;
        if (distanceMeters > s.bestSingleRunMeters) {
            s.bestSingleRunMeters = distanceMeters;
        }

        // Streak: days with ≥1 km count
        if (distanceMeters >= MILESTONE_METERS) {
            uint256 day = block.timestamp / 1 days;
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

        emit RunAttested(runHash, msg.sender, distanceMeters, milestone, s.currentStreakDays);
    }
}
