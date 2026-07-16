// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IClubRegistryChallenges {
    function isMember(uint256 clubId, address account) external view returns (bool);
    function isClubManager(uint256 clubId, address account) external view returns (bool);
    function members(uint256 clubId) external view returns (address[] memory);
    function getClub(
        uint256 clubId
    )
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

interface IClubTreasuryChallenges {
    function lockChallengeFunds(uint256 amount) external;
}

/// @title MovrClubChallenges — member challenges with manager approval + treasury reward split
contract MovrClubChallenges is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_RULE = 280;
    uint256 public constant MAX_DURATION = 365;

    enum DurationUnit {
        Hours,
        Days,
        Months
    }

    enum ChallengeState {
        Active,
        Settled,
        Cancelled
    }

    enum CompletionStatus {
        None,
        Pending,
        Approved,
        Rejected
    }

    struct Challenge {
        uint256 clubId;
        address creator;
        string rule;
        DurationUnit unit;
        uint32 duration;
        uint256 rewardPool;
        uint64 startAt;
        uint64 endAt;
        ChallengeState state;
        uint256 approvedCount;
    }

    IERC20 public immutable movr;
    IClubRegistryChallenges public immutable registry;

    uint256 public nextChallengeId = 1;
    Challenge[] private _challenges;
    mapping(uint256 => uint256[]) private _clubChallengeIds;
    mapping(uint256 => mapping(address => CompletionStatus)) public completionStatus;

    event ChallengeCreated(
        uint256 indexed challengeId,
        uint256 indexed clubId,
        address indexed creator,
        string rule,
        uint8 unit,
        uint32 duration,
        uint256 rewardPool,
        uint64 endAt
    );
    event CompletionSubmitted(uint256 indexed challengeId, address indexed member);
    event CompletionApproved(uint256 indexed challengeId, address indexed member, address indexed approver);
    event CompletionRejected(uint256 indexed challengeId, address indexed member, address indexed approver);
    event ChallengeSettled(uint256 indexed challengeId, uint256 winners, uint256 payoutEach);

    constructor(address movr_, address registry_) {
        require(movr_ != address(0) && registry_ != address(0), "zero");
        movr = IERC20(movr_);
        registry = IClubRegistryChallenges(registry_);
    }

    function challengeCount() external view returns (uint256) {
        return _challenges.length;
    }

    function clubChallengeCount(uint256 clubId) external view returns (uint256) {
        return _clubChallengeIds[clubId].length;
    }

    function clubChallengeAt(uint256 clubId, uint256 index) external view returns (uint256) {
        return _clubChallengeIds[clubId][index];
    }

    function getChallenge(uint256 challengeId)
        external
        view
        returns (
            uint256 clubId,
            address creator,
            string memory rule,
            DurationUnit unit,
            uint32 duration,
            uint256 rewardPool,
            uint64 startAt,
            uint64 endAt,
            ChallengeState state,
            uint256 approvedCount
        )
    {
        Challenge storage c = _challengeAt(challengeId);
        return (
            c.clubId,
            c.creator,
            c.rule,
            c.unit,
            c.duration,
            c.rewardPool,
            c.startAt,
            c.endAt,
            c.state,
            c.approvedCount
        );
    }

    function isActive(uint256 challengeId) public view returns (bool) {
        if (challengeId == 0 || challengeId >= nextChallengeId) return false;
        Challenge storage c = _challenges[challengeId - 1];
        return c.state == ChallengeState.Active && block.timestamp < c.endAt;
    }

    /// @notice Any member can start a challenge; reward MOVR is escrowed from club treasury.
    function createChallenge(
        uint256 clubId,
        string calldata rule,
        DurationUnit unit,
        uint32 duration,
        uint256 rewardAmount
    ) external returns (uint256 challengeId) {
        require(registry.isMember(clubId, msg.sender), "member");
        bytes memory r = bytes(rule);
        require(r.length > 0 && r.length <= MAX_RULE, "rule");
        require(duration > 0 && duration <= MAX_DURATION, "duration");
        require(rewardAmount > 0, "reward");

        (, , address treasury, , bool exists, , ) = registry.getClub(clubId);
        require(exists && treasury != address(0), "club");

        IClubTreasuryChallenges(treasury).lockChallengeFunds(rewardAmount);

        uint64 startAt = uint64(block.timestamp);
        uint64 endAt = startAt + _durationSeconds(unit, duration);

        challengeId = nextChallengeId++;
        _challenges.push(
            Challenge({
                clubId: clubId,
                creator: msg.sender,
                rule: rule,
                unit: unit,
                duration: duration,
                rewardPool: rewardAmount,
                startAt: startAt,
                endAt: endAt,
                state: ChallengeState.Active,
                approvedCount: 0
            })
        );
        _clubChallengeIds[clubId].push(challengeId);

        emit ChallengeCreated(
            challengeId, clubId, msg.sender, rule, uint8(unit), duration, rewardAmount, endAt
        );
    }

    function submitCompletion(uint256 challengeId) external {
        Challenge storage c = _requireActive(challengeId);
        require(registry.isMember(c.clubId, msg.sender), "member");
        CompletionStatus s = completionStatus[challengeId][msg.sender];
        require(s == CompletionStatus.None || s == CompletionStatus.Rejected, "status");
        completionStatus[challengeId][msg.sender] = CompletionStatus.Pending;
        emit CompletionSubmitted(challengeId, msg.sender);
    }

    function approveCompletion(uint256 challengeId, address member) external {
        Challenge storage c = _requireActive(challengeId);
        require(registry.isClubManager(c.clubId, msg.sender), "manager");
        require(registry.isMember(c.clubId, member), "member");
        require(completionStatus[challengeId][member] == CompletionStatus.Pending, "pending");
        completionStatus[challengeId][member] = CompletionStatus.Approved;
        c.approvedCount += 1;
        emit CompletionApproved(challengeId, member, msg.sender);
    }

    function rejectCompletion(uint256 challengeId, address member) external {
        Challenge storage c = _requireActive(challengeId);
        require(registry.isClubManager(c.clubId, msg.sender), "manager");
        require(completionStatus[challengeId][member] == CompletionStatus.Pending, "pending");
        completionStatus[challengeId][member] = CompletionStatus.Rejected;
        emit CompletionRejected(challengeId, member, msg.sender);
    }

    /// @notice After deadline, split reward equally among approved members; unused returns to treasury.
    function settle(uint256 challengeId) external nonReentrant {
        require(challengeId > 0 && challengeId < nextChallengeId, "id");
        Challenge storage c = _challenges[challengeId - 1];
        require(c.state == ChallengeState.Active, "state");
        require(block.timestamp >= c.endAt, "open");

        c.state = ChallengeState.Settled;

        (, , address treasury, , , , ) = registry.getClub(c.clubId);
        uint256 winners = c.approvedCount;
        uint256 pool = c.rewardPool;

        if (winners == 0) {
            movr.safeTransfer(treasury, pool);
            emit ChallengeSettled(challengeId, 0, 0);
            return;
        }

        uint256 each = pool / winners;
        require(each > 0, "dust");

        address[] memory roster = registry.members(c.clubId);
        uint256 paid;
        for (uint256 i = 0; i < roster.length; i++) {
            address m = roster[i];
            if (completionStatus[challengeId][m] != CompletionStatus.Approved) continue;
            movr.safeTransfer(m, each);
            paid += each;
        }

        uint256 remainder = pool - paid;
        if (remainder > 0) {
            movr.safeTransfer(treasury, remainder);
        }

        emit ChallengeSettled(challengeId, winners, each);
    }

    function _requireActive(uint256 challengeId) private view returns (Challenge storage c) {
        require(challengeId > 0 && challengeId < nextChallengeId, "id");
        c = _challenges[challengeId - 1];
        require(c.state == ChallengeState.Active, "state");
        require(block.timestamp < c.endAt, "ended");
    }

    function _challengeAt(uint256 challengeId) private view returns (Challenge storage c) {
        require(challengeId > 0 && challengeId < nextChallengeId, "id");
        return _challenges[challengeId - 1];
    }

    function _durationSeconds(DurationUnit unit, uint32 duration) private pure returns (uint64) {
        if (unit == DurationUnit.Hours) return uint64(duration) * 1 hours;
        if (unit == DurationUnit.Days) return uint64(duration) * 1 days;
        return uint64(duration) * 30 days;
    }
}
