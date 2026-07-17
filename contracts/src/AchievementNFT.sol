// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from
    "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {MovrChainAttestation} from "./MovrChainAttestation.sol";

/// @title AchievementNFT — community achievements as NFTs
/// @notice Admin creates achievement definitions. Runners claim when attestation stats qualify.
///         Owners can list NFTs for sale in native MON.
contract AchievementNFT is ERC721URIStorageUpgradeable, AccessControlUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum Criterion {
        SingleRunMeters,
        TotalDistanceMeters,
        StreakDays
    }

    struct AchievementDef {
        string name;
        string description;
        Criterion criterion;
        uint256 threshold;
        uint256 stakingBoostBps;
        bool active;
    }

    struct Listing {
        address seller;
        uint256 priceWei;
        bool active;
    }

    MovrChainAttestation public attestation;
    uint256 public nextAchievementId;
    uint256 public nextTokenId;

    mapping(uint256 => AchievementDef) public achievements;
    mapping(uint256 => string) private _achievementURI;
    mapping(address => mapping(uint256 => bool)) public hasClaimed;
    mapping(uint256 => uint256) public tokenAchievementId;
    /// @notice Boost bps snapshotted at mint — immune to later `setAchievementBoost` edits.
    mapping(uint256 => uint256) public tokenBoostBps;
    mapping(address => uint256) public accountBoostBps;
    mapping(address => uint256) public ownedAchievementCount;
    mapping(uint256 => Listing) public listings;

    event AchievementCreated(uint256 indexed achievementId, string name, Criterion criterion, uint256 threshold);
    event AchievementClaimed(address indexed runner, uint256 indexed achievementId, uint256 indexed tokenId);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    event Unlisted(uint256 indexed tokenId);
    event Purchased(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 priceWei);

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address attestation_) external initializer {
        require(owner_ != address(0) && attestation_ != address(0), "zero addr");
        __ERC721_init("MovrChain Achievement", "MAVT");
        __AccessControl_init();
        attestation = MovrChainAttestation(attestation_);
        nextAchievementId = 1;
        nextTokenId = 1;
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorageUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function setAdmin(address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled) _grantRole(ADMIN_ROLE, account);
        else _revokeRole(ADMIN_ROLE, account);
    }

    function createAchievement(
        string calldata name_,
        string calldata description_,
        Criterion criterion,
        uint256 threshold,
        uint256 stakingBoostBps,
        string calldata tokenURI_
    ) external onlyRole(ADMIN_ROLE) returns (uint256 id) {
        require(bytes(name_).length > 0, "name");
        require(threshold > 0, "threshold");
        id = nextAchievementId++;
        achievements[id] = AchievementDef({
            name: name_,
            description: description_,
            criterion: criterion,
            threshold: threshold,
            stakingBoostBps: stakingBoostBps,
            active: true
        });
        _achievementURI[id] = tokenURI_;
        emit AchievementCreated(id, name_, criterion, threshold);
    }

    function setAchievementActive(uint256 achievementId, bool active) external onlyRole(ADMIN_ROLE) {
        require(achievementId > 0 && achievementId < nextAchievementId, "unknown");
        achievements[achievementId].active = active;
    }

    /// @notice Updates boost for *future* mints only. Already-minted tokens keep `tokenBoostBps`.
    function setAchievementBoost(uint256 achievementId, uint256 stakingBoostBps) external onlyRole(ADMIN_ROLE) {
        require(achievementId > 0 && achievementId < nextAchievementId, "unknown");
        achievements[achievementId].stakingBoostBps = stakingBoostBps;
    }

    /// @notice Update metadata URI used for future mints of this achievement.
    function setAchievementURI(uint256 achievementId, string calldata tokenURI_) external onlyRole(ADMIN_ROLE) {
        require(achievementId > 0 && achievementId < nextAchievementId, "unknown");
        require(bytes(tokenURI_).length > 0, "uri");
        _achievementURI[achievementId] = tokenURI_;
    }

    function achievementURI(uint256 achievementId) external view returns (string memory) {
        require(achievementId > 0 && achievementId < nextAchievementId, "unknown");
        return _achievementURI[achievementId];
    }

    /// @notice Fix metadata on an already-minted token (admin rescue / art refresh).
    function setTokenURI(uint256 tokenId, string calldata tokenURI_) external onlyRole(ADMIN_ROLE) {
        require(_ownerOf(tokenId) != address(0), "token");
        _setTokenURI(tokenId, tokenURI_);
    }

    function eligible(address runner, uint256 achievementId) public view returns (bool) {
        AchievementDef memory a = achievements[achievementId];
        if (!a.active || hasClaimed[runner][achievementId]) return false;

        (uint256 totalDistanceMeters,, uint256 bestSingleRunMeters,,,) = attestation.runnerStats(runner);
        uint256 currentStreakDays = attestation.effectiveCurrentStreakDays(runner);

        if (a.criterion == Criterion.SingleRunMeters) {
            return bestSingleRunMeters >= a.threshold;
        }
        if (a.criterion == Criterion.TotalDistanceMeters) {
            return totalDistanceMeters >= a.threshold;
        }
        // Active streak only — historical longest does not keep eligibility after idle decay.
        return currentStreakDays >= a.threshold;
    }

    function claimAchievement(uint256 achievementId) external returns (uint256 tokenId) {
        require(eligible(msg.sender, achievementId), "not eligible");
        tokenId = _mintAchievement(msg.sender, achievementId);
    }

    function adminMint(address to, uint256 achievementId) external onlyRole(ADMIN_ROLE) returns (uint256 tokenId) {
        require(achievementId > 0 && achievementId < nextAchievementId, "unknown");
        require(!hasClaimed[to][achievementId], "already claimed");
        tokenId = _mintAchievement(to, achievementId);
    }

    function _mintAchievement(address to, uint256 achievementId) internal returns (uint256 tokenId) {
        hasClaimed[to][achievementId] = true;
        tokenId = nextTokenId++;
        tokenAchievementId[tokenId] = achievementId;
        tokenBoostBps[tokenId] = achievements[achievementId].stakingBoostBps;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _achievementURI[achievementId]);
        emit AchievementClaimed(to, achievementId, tokenId);
    }

    function totalStakingBoostBps(address account) external view returns (uint256) {
        return accountBoostBps[account];
    }

    function listNFT(uint256 tokenId, uint256 priceWei) external {
        require(ownerOf(tokenId) == msg.sender, "not owner");
        require(priceWei > 0, "price");
        listings[tokenId] = Listing({seller: msg.sender, priceWei: priceWei, active: true});
        emit Listed(tokenId, msg.sender, priceWei);
    }

    function unlistNFT(uint256 tokenId) external {
        Listing storage L = listings[tokenId];
        require(L.active && L.seller == msg.sender, "not listed");
        L.active = false;
        emit Unlisted(tokenId);
    }

    function buyNFT(uint256 tokenId) external payable nonReentrant {
        Listing storage L = listings[tokenId];
        require(L.active, "not listed");
        require(msg.value >= L.priceWei, "price");
        address seller = L.seller;
        uint256 price = L.priceWei;
        L.active = false;
        _transfer(seller, msg.sender, tokenId);
        (bool ok,) = seller.call{value: price}("");
        require(ok, "pay fail");
        if (msg.value > price) {
            (bool refundOk,) = msg.sender.call{value: msg.value - price}("");
            require(refundOk, "refund");
        }
        emit Purchased(tokenId, msg.sender, seller, price);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        // Use mint-time snapshot so later admin boost edits cannot underflow or inflate accounting.
        uint256 boost = tokenBoostBps[tokenId];

        if (from != address(0)) {
            if (boost > 0) accountBoostBps[from] -= boost;
            if (ownedAchievementCount[from] > 0) ownedAchievementCount[from] -= 1;
        }
        if (to != address(0)) {
            if (boost > 0) accountBoostBps[to] += boost;
            ownedAchievementCount[to] += 1;
        }
        if (listings[tokenId].active && from != address(0)) {
            listings[tokenId].active = false;
            emit Unlisted(tokenId);
        }
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Storage gap for future upgrades (append-only layout).
    uint256[50] private __gap;
}
