// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ClubMemberNFT — soulbound-ish membership badge (weight tier 2)
/// @notice Only the club registry can mint. Transfers are blocked after mint.
contract ClubMemberNFT is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public nextTokenId = 1;
    mapping(uint256 => uint256) public tokenClubId;
    mapping(address => mapping(uint256 => uint256)) public memberToken; // account => clubId => tokenId

    event MemberMinted(address indexed account, uint256 indexed clubId, uint256 indexed tokenId);
    event MemberBurned(address indexed account, uint256 indexed clubId, uint256 indexed tokenId);

    constructor(address admin_) ERC721("MovrChain Club Member", "MCLUB") {
        require(admin_ != address(0), "zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function mintMember(address to, uint256 clubId) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(to != address(0) && clubId > 0, "bad");
        require(memberToken[to][clubId] == 0, "already");
        tokenId = nextTokenId++;
        tokenClubId[tokenId] = clubId;
        memberToken[to][clubId] = tokenId;
        _safeMint(to, tokenId);
        emit MemberMinted(to, clubId, tokenId);
    }

    function holdsMemberNFT(address account, uint256 clubId) external view returns (bool) {
        uint256 tid = memberToken[account][clubId];
        return tid != 0 && _ownerOf(tid) == account;
    }

    /// @notice Burn membership NFT when leaving a club so the wallet can rejoin later.
    function burnMember(address account, uint256 clubId) external onlyRole(MINTER_ROLE) {
        uint256 tid = memberToken[account][clubId];
        require(tid != 0 && _ownerOf(tid) == account, "none");
        delete memberToken[account][clubId];
        delete tokenClubId[tid];
        _burn(tid);
        emit MemberBurned(account, clubId, tid);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        // Allow mint (from == 0) and burn (to == 0); block peer transfers
        if (from != address(0) && to != address(0)) {
            revert("soulbound");
        }
        return super._update(to, tokenId, auth);
    }
}
