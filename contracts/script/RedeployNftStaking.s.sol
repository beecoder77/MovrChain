// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";

/// @notice Redeploys AchievementNFT + MovrStaking against existing token/attestation,
///         seeding data-URI metadata art. Needed because the first NFT deploy lacked setAchievementURI.
/// Env: PRIVATE_KEY, MOVR_TOKEN, ATTESTATION, optional ADMIN_ADDRESS, REWARD_AMOUNT
contract RedeployNftStaking is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        MovrToken movr = MovrToken(vm.envAddress("MOVR_TOKEN"));
        address attestation = vm.envAddress("ATTESTATION");

        console2.log("Deployer:", deployer);
        console2.log("MOVR:", address(movr));
        console2.log("Attestation:", attestation);

        vm.startBroadcast(pk);

        AchievementNFT nfts = AchievementNFT(
            address(
                new ERC1967Proxy(
                    address(new AchievementNFT()), abi.encodeCall(AchievementNFT.initialize, (deployer, attestation))
                )
            )
        );
        MovrStaking staking = MovrStaking(
            address(
                new ERC1967Proxy(
                    address(new MovrStaking()),
                    abi.encodeCall(MovrStaking.initialize, (deployer, address(movr), address(nfts)))
                )
            )
        );

        if (admin != deployer) {
            nfts.setAdmin(admin, true);
            staking.setAdmin(admin, true);
        }

        _seed(nfts);
        vm.stopBroadcast();

        console2.log("=== New addresses (update .env) ===");
        console2.log("ACHIEVEMENT_NFT=", address(nfts));
        console2.log("STAKING=", address(staking));
        console2.log("Then run ./fund-rewards.sh to fill the new staking pool.");
        console2.log("MOVR_TOKEN and ATTESTATION unchanged.");
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

    function _seed(AchievementNFT nfts) internal {
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
