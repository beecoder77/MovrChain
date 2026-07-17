// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";

/// @notice Redeploy the hardened MovrChainAttestation + a fresh AchievementNFT wired to it.
/// Keeps the existing MOVR token / profile. Seeds the default achievement catalog.
/// Env: PRIVATE_KEY, optional ADMIN_ADDRESS
contract DeployAttestation is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        console2.log("Deployer:", deployer);
        console2.log("Admin:", admin);

        vm.startBroadcast(pk);

        MovrChainAttestation attestation = new MovrChainAttestation(deployer);
        AchievementNFT nfts = new AchievementNFT(deployer, address(attestation));

        if (admin != deployer) {
            nfts.setAdmin(admin, true);
        }

        _seedAchievements(nfts);

        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("ATTESTATION=", address(attestation));
        console2.log("ACHIEVEMENT_NFT=", address(nfts));
        console2.log("Set VITE_CONTRACT_ADDRESS to ATTESTATION for the frontend verify flow.");
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
