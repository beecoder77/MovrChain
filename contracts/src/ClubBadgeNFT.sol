// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MovrClubRegistry} from "./MovrClubRegistry.sol";

/// @title ClubBadgeNFT — club achievements (Join, Donatur, Pulse Payer, Squad, Roster, Consensus)
contract ClubBadgeNFT is ERC721, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum Badge {
        JoinClub, // 0
        ClubDonatur, // 1
        PulsePayer, // 2 — passed a proposal
        SquadOf5, // 3
        FullRoster, // 4
        Consensus // 5 — cast ≥3 votes

    }

    MovrClubRegistry public immutable registry;
    uint256 public nextTokenId = 1;

    mapping(address => mapping(uint8 => bool)) public hasClaimed;
    mapping(uint256 => uint8) public tokenBadge;
    mapping(uint8 => uint256) public stakingBoostBps; // optional small boosts
    mapping(address => uint256) public accountBoostBps;

    event BadgeClaimed(address indexed account, uint8 indexed badge, uint256 indexed tokenId);

    constructor(address admin_, address registry_) ERC721("MovrChain Club Badge", "MCBADGE") {
        require(admin_ != address(0) && registry_ != address(0), "zero");
        registry = MovrClubRegistry(registry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        stakingBoostBps[uint8(Badge.JoinClub)] = 200;
        stakingBoostBps[uint8(Badge.ClubDonatur)] = 300;
        stakingBoostBps[uint8(Badge.PulsePayer)] = 400;
        stakingBoostBps[uint8(Badge.SquadOf5)] = 500;
        stakingBoostBps[uint8(Badge.FullRoster)] = 800;
        stakingBoostBps[uint8(Badge.Consensus)] = 300;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function eligible(address account, uint8 badge) public view returns (bool) {
        if (hasClaimed[account][badge]) return false;
        if (badge == uint8(Badge.JoinClub)) return registry.hasEverJoined(account);
        if (badge == uint8(Badge.ClubDonatur)) return registry.lifetimeDonatedAllClubs(account) > 0;
        if (badge == uint8(Badge.PulsePayer)) return registry.proposalsPassedCount(account) > 0;
        if (badge == uint8(Badge.SquadOf5)) return registry.clubMemberCountFor(account) >= 5;
        if (badge == uint8(Badge.FullRoster)) return registry.clubMemberCountFor(account) >= 10;
        if (badge == uint8(Badge.Consensus)) return registry.votesCastCount(account) >= 3;
        return false;
    }

    function claim(uint8 badge) external returns (uint256 tokenId) {
        require(badge <= uint8(Badge.Consensus), "badge");
        require(eligible(msg.sender, badge), "not eligible");
        hasClaimed[msg.sender][badge] = true;
        tokenId = nextTokenId++;
        tokenBadge[tokenId] = badge;
        uint256 boost = stakingBoostBps[badge];
        if (boost > 0) accountBoostBps[msg.sender] += boost;
        _safeMint(msg.sender, tokenId);
        emit BadgeClaimed(msg.sender, badge, tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        // Soulbound: mint and burn only — blocks boost/eligibility drift on transfer.
        if (from != address(0) && to != address(0)) {
            revert("soulbound");
        }
        return super._update(to, tokenId, auth);
    }
}
