// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {MovrMultisig} from "../src/MovrMultisig.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";
import {MovrFeed} from "../src/MovrFeed.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";

/// @notice One-shot deploy of the upgradeable Movr stack (UUPS + Beacon) with Timelock + Multisig.
/// Keeps existing MOVR_TOKEN (+ optional MOVR_PROFILE).
/// Env: PRIVATE_KEY, MOVR_TOKEN, MULTISIG_SIGNER_2, MULTISIG_SIGNER_3
/// Optional: ADMIN_ADDRESS, TIMELOCK_DELAY (default 1 days)
contract DeployUpgradeableStack is Script {
    uint256 public constant DEFAULT_DELAY = 1 days;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address signer2 = vm.envAddress("MULTISIG_SIGNER_2");
        address signer3 = vm.envAddress("MULTISIG_SIGNER_3");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", DEFAULT_DELAY);

        require(signer2 != address(0) && signer3 != address(0), "signers");
        require(signer2 != deployer && signer3 != deployer && signer2 != signer3, "signers distinct");

        console2.log("Deployer:", deployer);
        console2.log("MOVR_TOKEN:", movr);
        console2.log("Timelock delay (s):", delay);

        vm.startBroadcast(pk);

        // ---- Authority ----
        MovrMultisig multisig = new MovrMultisig(deployer, signer2, signer3);
        address[] memory proposers = new address[](1);
        proposers[0] = address(multisig);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // anyone can execute after delay
        TimelockController timelock = new TimelockController(delay, proposers, executors, deployer);

        // ---- Implementations + proxies ----
        MovrChainAttestation attestation = MovrChainAttestation(
            _uups(address(new MovrChainAttestation()), abi.encodeCall(MovrChainAttestation.initialize, (deployer)))
        );
        AchievementNFT nfts = AchievementNFT(
            _uups(
                address(new AchievementNFT()),
                abi.encodeCall(AchievementNFT.initialize, (deployer, address(attestation)))
            )
        );
        if (admin != deployer) nfts.setAdmin(admin, true);
        _seedAchievements(nfts);

        ClubMemberNFT memberNft =
            ClubMemberNFT(_uups(address(new ClubMemberNFT()), abi.encodeCall(ClubMemberNFT.initialize, (deployer))));

        ClubTreasury treasuryImpl = new ClubTreasury();
        // Beacon owned by Timelock from day one
        UpgradeableBeacon beacon = new UpgradeableBeacon(address(treasuryImpl), address(timelock));

        MovrClubRegistry registry = MovrClubRegistry(
            _uups(
                address(new MovrClubRegistry()),
                abi.encodeCall(MovrClubRegistry.initialize, (deployer, movr, address(memberNft), address(beacon)))
            )
        );
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));

        ClubBadgeNFT badges = ClubBadgeNFT(
            _uups(address(new ClubBadgeNFT()), abi.encodeCall(ClubBadgeNFT.initialize, (deployer, address(registry))))
        );

        MovrStaking staking = MovrStaking(
            _uups(address(new MovrStaking()), abi.encodeCall(MovrStaking.initialize, (deployer, movr, address(nfts))))
        );
        staking.setClubRegistry(address(registry));
        staking.setClubBadges(address(badges));
        registry.setStaking(address(staking));

        MovrFeed feed = MovrFeed(
            _uups(address(new MovrFeed()), abi.encodeCall(MovrFeed.initialize, (deployer, address(attestation))))
        );

        MovrMilestoneReward milestone = MovrMilestoneReward(
            _uups(
                address(new MovrMilestoneReward()),
                abi.encodeCall(MovrMilestoneReward.initialize, (deployer, movr, address(attestation)))
            )
        );
        milestone.setClubRegistry(address(registry));
        attestation.setClubRegistry(address(registry));
        registry.setMilestoneReward(address(milestone));

        MovrClubChallenges challenges = MovrClubChallenges(
            _uups(
                address(new MovrClubChallenges()),
                abi.encodeCall(MovrClubChallenges.initialize, (deployer, movr, address(registry)))
            )
        );
        registry.setChallenges(address(challenges));

        // ---- Hand ownership / admin to Timelock ----
        _transferOwnable(address(attestation), address(timelock));
        _transferOwnable(address(feed), address(timelock));
        _transferOwnable(address(registry), address(timelock));
        _transferOwnable(address(challenges), address(timelock));

        _handAccessAdmin(address(nfts), deployer, address(timelock));
        _handAccessAdmin(address(memberNft), deployer, address(timelock));
        _handAccessAdmin(address(badges), deployer, address(timelock));
        _handAccessAdmin(address(staking), deployer, address(timelock));
        _handAccessAdmin(address(milestone), deployer, address(timelock));

        // Timelock self-admin only via Multisig proposals thereafter
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        vm.stopBroadcast();

        console2.log("=== Deployed (proxies / governance) ===");
        console2.log("MOVR_MULTISIG=", address(multisig));
        console2.log("TIMELOCK=", address(timelock));
        console2.log("TREASURY_BEACON=", address(beacon));
        console2.log("TREASURY_IMPL=", address(treasuryImpl));
        console2.log("ATTESTATION=", address(attestation));
        console2.log("ACHIEVEMENT_NFT=", address(nfts));
        console2.log("CLUB_MEMBER_NFT=", address(memberNft));
        console2.log("CLUB_REGISTRY=", address(registry));
        console2.log("CLUB_BADGE_NFT=", address(badges));
        console2.log("MOVR_STAKING=", address(staking));
        console2.log("MOVR_FEED=", address(feed));
        console2.log("MILESTONE_REWARD=", address(milestone));
        console2.log("CLUB_CHALLENGES=", address(challenges));
    }

    function _uups(address impl, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(impl, initData));
    }

    function _transferOwnable(address target, address newOwner) internal {
        (bool ok,) = target.call(abi.encodeWithSignature("transferOwnership(address)", newOwner));
        require(ok, "ownable");
    }

    function _handAccessAdmin(address target, address from, address to) internal {
        bytes32 defaultAdmin = 0x00;
        (bool ok1,) = target.call(abi.encodeWithSignature("grantRole(bytes32,address)", defaultAdmin, to));
        require(ok1, "grant admin");
        // Best-effort ADMIN_ROLE grant (not all contracts define it)
        bytes32 adminRole = keccak256("ADMIN_ROLE");
        (bool okAdmin,) = target.call(abi.encodeWithSignature("grantRole(bytes32,address)", adminRole, to));
        okAdmin; // optional
        (bool ok2,) = target.call(abi.encodeWithSignature("renounceRole(bytes32,address)", defaultAdmin, from));
        require(ok2, "renounce");
    }

    function _uri(string memory slug) internal view returns (string memory uri) {
        uri = vm.readFile(string.concat("metadata/", slug, ".uri.txt"));
        bytes memory b = bytes(uri);
        if (b.length > 0 && b[b.length - 1] == 0x0a) {
            assembly {
                mstore(uri, sub(mload(uri), 1))
            }
        }
    }

    function _seedAchievements(AchievementNFT nfts) internal {
        nfts.createAchievement(
            "First Kilometer",
            "Complete a single verified run of at least 1 km",
            AchievementNFT.Criterion.SingleRunMeters,
            1000,
            300,
            _uri("1k")
        );
        nfts.createAchievement(
            "First 5K",
            "Complete a single verified run of at least 5 km",
            AchievementNFT.Criterion.SingleRunMeters,
            5000,
            500,
            _uri("5k")
        );
        nfts.createAchievement(
            "First 10K",
            "Complete a single verified run of at least 10 km",
            AchievementNFT.Criterion.SingleRunMeters,
            10_000,
            800,
            _uri("10k")
        );
        nfts.createAchievement(
            "First Half Marathon",
            "Complete a single verified run of at least 21.0975 km",
            AchievementNFT.Criterion.SingleRunMeters,
            21_098,
            1200,
            _uri("half")
        );
        nfts.createAchievement(
            "First Marathon",
            "Complete a single verified run of at least 42.195 km",
            AchievementNFT.Criterion.SingleRunMeters,
            42_195,
            2000,
            _uri("marathon")
        );
        nfts.createAchievement(
            "7-Day Streak",
            "Run at least 1 km per day for 7 consecutive days",
            AchievementNFT.Criterion.StreakDays,
            7,
            700,
            _uri("streak-7")
        );
        nfts.createAchievement(
            "14-Day Streak",
            "Run at least 1 km per day for 14 consecutive days",
            AchievementNFT.Criterion.StreakDays,
            14,
            1200,
            _uri("streak-14")
        );
        nfts.createAchievement(
            "30-Day Streak",
            "Run at least 1 km per day for 30 consecutive days",
            AchievementNFT.Criterion.StreakDays,
            30,
            2000,
            _uri("streak-30")
        );
        nfts.createAchievement(
            "Double Digits Total",
            "Accumulate 10 km across all verified runs",
            AchievementNFT.Criterion.TotalDistanceMeters,
            10_000,
            400,
            _uri("total-10k")
        );
        nfts.createAchievement(
            "Century Club",
            "Accumulate 100 km across all verified runs",
            AchievementNFT.Criterion.TotalDistanceMeters,
            100_000,
            1500,
            _uri("century")
        );
    }
}
