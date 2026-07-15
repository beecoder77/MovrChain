// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ClubTreasury} from "./ClubTreasury.sol";
import {ClubMemberNFT} from "./ClubMemberNFT.sol";

/// @title MovrClubRegistry — create clubs (≤10 wallets) with a dedicated treasury
contract MovrClubRegistry {
    uint256 public constant MAX_MEMBERS = 10;
    uint256 public constant MAX_NAME = 32;

    struct Club {
        string name;
        address creator;
        address treasury;
        uint64 createdAt;
        bool exists;
    }

    ClubMemberNFT public immutable memberNft;
    address public immutable movr;
    address public staking; // set once; pushed to treasuries
    address public milestoneReward; // set once; pushed to treasuries

    uint256 public nextClubId = 1;
    mapping(uint256 => Club) private _clubs;
    mapping(uint256 => address[]) private _members;
    mapping(uint256 => mapping(address => bool)) private _isMember;
    mapping(address => uint256) public clubOf; // 0 = none; one club per wallet (MVP)

    // Runner stats for club achievements
    mapping(address => bool) public hasEverJoined;
    mapping(address => uint256) public lifetimeDonatedAllClubs;
    mapping(address => uint256) public proposalsPassedCount;
    mapping(address => uint256) public votesCastCount;

    event ClubCreated(
        uint256 indexed clubId, address indexed creator, address treasury, string name
    );
    event MemberAdded(uint256 indexed clubId, address indexed account);
    event MemberLeft(uint256 indexed clubId, address indexed account);
    event StakingSet(address indexed staking);
    event MilestoneRewardSet(address indexed milestoneReward);
    event DonationCredited(address indexed donor, uint256 indexed clubId, uint256 amount);

    constructor(address movr_, address memberNft_) {
        require(movr_ != address(0) && memberNft_ != address(0), "zero");
        movr = movr_;
        memberNft = ClubMemberNFT(memberNft_);
    }

    function setStaking(address staking_) external {
        require(staking == address(0) && staking_ != address(0), "set");
        // Only club creators collectively risky — lock to first caller who is NFT admin via same deployer
        // For hackathon: allow once by memberNft DEFAULT_ADMIN (deployer script).
        require(memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), msg.sender), "admin");
        staking = staking_;
        emit StakingSet(staking_);
    }

    function setMilestoneReward(address milestoneReward_) external {
        require(milestoneReward == address(0) && milestoneReward_ != address(0), "set");
        require(memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), msg.sender), "admin");
        milestoneReward = milestoneReward_;
        emit MilestoneRewardSet(milestoneReward_);
    }

    /// @notice Push staking + milestoneReward wiring onto an existing club treasury.
    function wireTreasury(uint256 clubId) external {
        require(memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), msg.sender), "admin");
        Club storage c = _clubs[clubId];
        require(c.exists && c.treasury != address(0), "club");
        ClubTreasury t = ClubTreasury(c.treasury);
        if (staking != address(0)) t.setStaking(staking);
        if (milestoneReward != address(0)) t.setMilestoneReward(milestoneReward);
    }

    function createClub(string calldata name) external returns (uint256 clubId, address treasury) {
        require(clubOf[msg.sender] == 0, "already in club");
        bytes memory n = bytes(name);
        require(n.length > 0 && n.length <= MAX_NAME, "name");

        clubId = nextClubId++;
        ClubTreasury t = new ClubTreasury(movr, address(this), address(memberNft), clubId);
        treasury = address(t);
        if (staking != address(0)) {
            t.setStaking(staking);
        }
        if (milestoneReward != address(0)) {
            t.setMilestoneReward(milestoneReward);
        }

        _clubs[clubId] = Club({
            name: name,
            creator: msg.sender,
            treasury: treasury,
            createdAt: uint64(block.timestamp),
            exists: true
        });

        _addMember(clubId, msg.sender);
        emit ClubCreated(clubId, msg.sender, treasury, name);
    }

    /// @notice Creator invites a wallet into the club (max 10).
    function addMember(uint256 clubId, address account) external {
        Club storage c = _clubs[clubId];
        require(c.exists, "club");
        require(msg.sender == c.creator, "creator");
        require(account != address(0), "zero");
        require(!_isMember[clubId][account], "member");
        require(clubOf[account] == 0, "busy");
        require(_members[clubId].length < MAX_MEMBERS, "full");
        _addMember(clubId, account);
    }

    function leaveClub(uint256 clubId) external {
        require(_isMember[clubId][msg.sender], "member");
        Club storage c = _clubs[clubId];
        require(c.exists, "club");
        require(msg.sender != c.creator || _members[clubId].length == 1, "creator");
        _removeMember(clubId, msg.sender);
        emit MemberLeft(clubId, msg.sender);
    }

    function getClub(uint256 clubId)
        external
        view
        returns (
            string memory name,
            address creator,
            address treasury,
            uint64 createdAt,
            bool exists,
            uint256 memberCount_
        )
    {
        Club storage c = _clubs[clubId];
        return (c.name, c.creator, c.treasury, c.createdAt, c.exists, _members[clubId].length);
    }

    function isMember(uint256 clubId, address account) external view returns (bool) {
        return _isMember[clubId][account];
    }

    function memberCount(uint256 clubId) external view returns (uint256) {
        return _members[clubId].length;
    }

    function members(uint256 clubId) external view returns (address[] memory) {
        return _members[clubId];
    }

    function clubMemberCountFor(address account) external view returns (uint256) {
        uint256 id = clubOf[account];
        if (id == 0) return 0;
        return _members[id].length;
    }

    /// @notice Called by ClubTreasury after donation to mirror stats for achievements.
    function creditDonationStats(address donor, uint256 amount) external {
        uint256 id = clubOf[donor];
        require(id != 0 && _clubs[id].treasury == msg.sender, "treasury");
        lifetimeDonatedAllClubs[donor] += amount;
        emit DonationCredited(donor, id, amount);
    }

    function creditVote(address voter) external {
        uint256 id = clubOf[voter];
        require(id != 0 && _clubs[id].treasury == msg.sender, "treasury");
        votesCastCount[voter] += 1;
    }

    function creditProposalPassed(address proposer) external {
        uint256 id = clubOf[proposer];
        require(id != 0 && _clubs[id].treasury == msg.sender, "treasury");
        proposalsPassedCount[proposer] += 1;
    }

    function _addMember(uint256 clubId, address account) private {
        _isMember[clubId][account] = true;
        _members[clubId].push(account);
        clubOf[account] = clubId;
        hasEverJoined[account] = true;
        memberNft.mintMember(account, clubId);
        emit MemberAdded(clubId, account);
    }

    function _removeMember(uint256 clubId, address account) private {
        _isMember[clubId][account] = false;
        clubOf[account] = 0;
        address[] storage list = _members[clubId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == account) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }
}
