// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ClubMemberNFT} from "./ClubMemberNFT.sol";

interface IClubRegistryView {
    function isMember(uint256 clubId, address account) external view returns (bool);
    function memberCount(uint256 clubId) external view returns (uint256);
    function members(uint256 clubId) external view returns (address[] memory);
    function creditDonationStats(address donor, uint256 amount) external;
    function creditVote(address voter) external;
    function creditProposalPassed(address proposer) external;
}

/// @title ClubTreasury — pooled MOVR + proposals for group spends
/// @notice Vote weight: member 1 · ClubMemberNFT 2 · top-3 lifetime donors 3 (highest wins).
contract ClubTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TITLE = 64;
    uint256 public constant MAX_REASON = 160;

    enum ProposalState {
        Active,
        Executed,
        Cancelled
    }

    struct Proposal {
        address proposer;
        string title;
        string reason;
        uint256 amount;
        uint256 yesWeight;
        uint256 noWeight;
        uint256 voteCount; // unique members who voted
        ProposalState state;
        uint64 createdAt;
    }

    IERC20 public immutable movr;
    IClubRegistryView public immutable registry;
    ClubMemberNFT public immutable memberNft;
    uint256 public immutable clubId;
    address public staking; // authorized to push donations (yield %)
    address public milestoneReward; // authorized to push run → treasury MOVR

    /// @notice Quorum unlock: all members voted, or this long after propose
    uint64 public constant VOTING_PERIOD = 24 hours;

    mapping(address => uint256) public lifetimeDonated;
    address[3] private _topDonors; // descending by lifetimeDonated

    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    mapping(address => uint256) public votesCast;
    mapping(address => uint256) public proposalsPassed;

    event Donation(address indexed donor, uint256 amount);
    event Proposed(uint256 indexed proposalId, address indexed proposer, uint256 amount, string title);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event Executed(uint256 indexed proposalId, uint256 amount);
    event Cancelled(uint256 indexed proposalId);
    event StakingSet(address indexed staking);
    event MilestoneRewardSet(address indexed milestoneReward);

    constructor(address movr_, address registry_, address memberNft_, uint256 clubId_) {
        require(
            movr_ != address(0) && registry_ != address(0) && memberNft_ != address(0) && clubId_ > 0,
            "zero"
        );
        movr = IERC20(movr_);
        registry = IClubRegistryView(registry_);
        memberNft = ClubMemberNFT(memberNft_);
        clubId = clubId_;
    }

    function setStaking(address staking_) external {
        require(msg.sender == address(registry), "registry");
        staking = staking_;
        emit StakingSet(staking_);
    }

    function setMilestoneReward(address milestoneReward_) external {
        require(msg.sender == address(registry), "registry");
        milestoneReward = milestoneReward_;
        emit MilestoneRewardSet(milestoneReward_);
    }

    function balance() public view returns (uint256) {
        return movr.balanceOf(address(this));
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint256 proposalId)
        external
        view
        returns (
            address proposer,
            string memory title,
            string memory reason,
            uint256 amount,
            uint256 yesWeight,
            uint256 noWeight,
            ProposalState state,
            uint64 createdAt,
            uint256 voteCount
        )
    {
        Proposal storage p = _proposals[proposalId];
        return (
            p.proposer,
            p.title,
            p.reason,
            p.amount,
            p.yesWeight,
            p.noWeight,
            p.state,
            p.createdAt,
            p.voteCount
        );
    }

    function topDonors() external view returns (address[3] memory) {
        return _topDonors;
    }

    /// @notice True when all current members voted, or voting period ended.
    function votingClosed(uint256 proposalId) public view returns (bool) {
        require(proposalId < _proposals.length, "id");
        Proposal storage p = _proposals[proposalId];
        if (p.voteCount >= registry.memberCount(clubId)) return true;
        return block.timestamp >= uint256(p.createdAt) + uint256(VOTING_PERIOD);
    }

    /// @notice Passed + voting closed + funds available (does not check Active).
    function canExecute(uint256 proposalId) public view returns (bool) {
        if (proposalId >= _proposals.length) return false;
        Proposal storage p = _proposals[proposalId];
        if (p.state != ProposalState.Active) return false;
        if (p.yesWeight <= p.noWeight) return false;
        if (p.amount > balance()) return false;
        return votingClosed(proposalId);
    }

    /// @notice Weight for `account` in this club: 0 if not member; else 1 / 2 / 3.
    function votingPower(address account) public view returns (uint256) {
        if (!registry.isMember(clubId, account)) return 0;
        if (_isTopDonor(account)) return 3;
        if (memberNft.holdsMemberNFT(account, clubId)) return 2;
        return 1;
    }

    /// @notice Record MOVR already transferred to this treasury (staking yield or run reward).
    function recordDonation(address donor, uint256 amount) external nonReentrant {
        require(msg.sender == staking || msg.sender == milestoneReward, "auth");
        require(donor != address(0) && amount > 0, "bad");
        require(registry.isMember(clubId, donor), "member");
        lifetimeDonated[donor] += amount;
        _recomputeTopDonors(donor);
        registry.creditDonationStats(donor, amount);
        emit Donation(donor, amount);
    }

    /// @notice Member pulls MOVR from self into treasury (manual donate).
    function donate(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        require(registry.isMember(clubId, msg.sender), "member");
        movr.safeTransferFrom(msg.sender, address(this), amount);
        lifetimeDonated[msg.sender] += amount;
        _recomputeTopDonors(msg.sender);
        registry.creditDonationStats(msg.sender, amount);
        emit Donation(msg.sender, amount);
    }

    function propose(string calldata title, string calldata reason, uint256 amount)
        external
        returns (uint256 proposalId)
    {
        require(registry.isMember(clubId, msg.sender), "member");
        require(amount > 0 && amount <= balance(), "amount");
        bytes memory t = bytes(title);
        bytes memory r = bytes(reason);
        require(t.length > 0 && t.length <= MAX_TITLE, "title");
        require(r.length <= MAX_REASON, "reason");

        proposalId = _proposals.length;
        _proposals.push(
            Proposal({
                proposer: msg.sender,
                title: title,
                reason: reason,
                amount: amount,
                yesWeight: 0,
                noWeight: 0,
                voteCount: 0,
                state: ProposalState.Active,
                createdAt: uint64(block.timestamp)
            })
        );
        emit Proposed(proposalId, msg.sender, amount, title);
    }

    function vote(uint256 proposalId, bool support) external {
        require(registry.isMember(clubId, msg.sender), "member");
        require(proposalId < _proposals.length, "id");
        Proposal storage p = _proposals[proposalId];
        require(p.state == ProposalState.Active, "state");
        require(!hasVoted[proposalId][msg.sender], "voted");

        uint256 weight = votingPower(msg.sender);
        require(weight > 0, "power");

        hasVoted[proposalId][msg.sender] = true;
        p.voteCount += 1;
        if (support) p.yesWeight += weight;
        else p.noWeight += weight;
        votesCast[msg.sender] += 1;
        registry.creditVote(msg.sender);

        emit Voted(proposalId, msg.sender, support, weight);
    }

    function execute(uint256 proposalId) external nonReentrant {
        require(proposalId < _proposals.length, "id");
        Proposal storage p = _proposals[proposalId];
        require(p.state == ProposalState.Active, "state");
        require(p.yesWeight > p.noWeight, "not passed");
        require(votingClosed(proposalId), "voting open");
        require(p.amount <= balance(), "funds");

        p.state = ProposalState.Executed;
        proposalsPassed[p.proposer] += 1;
        registry.creditProposalPassed(p.proposer);
        // Send to proposer as club spend contact (hackathon MVP — refreshments/jersey lead)
        movr.safeTransfer(p.proposer, p.amount);
        emit Executed(proposalId, p.amount);
    }

    function cancel(uint256 proposalId) external {
        require(proposalId < _proposals.length, "id");
        Proposal storage p = _proposals[proposalId];
        require(p.state == ProposalState.Active, "state");
        require(msg.sender == p.proposer, "proposer");
        p.state = ProposalState.Cancelled;
        emit Cancelled(proposalId);
    }

    function _isTopDonor(address account) private view returns (bool) {
        for (uint256 i = 0; i < 3; i++) {
            if (_topDonors[i] == account) return true;
        }
        return false;
    }

    function _recomputeTopDonors(address touched) private {
        // Insert / bubble `touched` into top-3 ranking by lifetimeDonated
        if (!_isTopDonor(touched)) {
            // find slot or weaker donor
            uint256 weakest = type(uint256).max;
            uint256 weakIdx = 3;
            for (uint256 i = 0; i < 3; i++) {
                address d = _topDonors[i];
                if (d == address(0)) {
                    _topDonors[i] = touched;
                    _sortTopDonors();
                    return;
                }
                uint256 don = lifetimeDonated[d];
                if (don < weakest) {
                    weakest = don;
                    weakIdx = i;
                }
            }
            if (lifetimeDonated[touched] > weakest && weakIdx < 3) {
                _topDonors[weakIdx] = touched;
            }
        }
        _sortTopDonors();
    }

    function _sortTopDonors() private {
        // Tiny insertion sort for 3 slots
        for (uint256 i = 1; i < 3; i++) {
            for (uint256 j = i; j > 0; j--) {
                address a = _topDonors[j - 1];
                address b = _topDonors[j];
                if (b == address(0)) break;
                if (a == address(0) || lifetimeDonated[b] > lifetimeDonated[a]) {
                    _topDonors[j - 1] = b;
                    _topDonors[j] = a;
                } else {
                    break;
                }
            }
        }
    }
}
