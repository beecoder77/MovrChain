// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";

/// @notice Deploy club stack + new staking wired for yield donate.
/// Env: PRIVATE_KEY, MOVR_TOKEN, ACHIEVEMENT_NFT (existing)
contract DeployClubs is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address achievementNft = vm.envAddress("ACHIEVEMENT_NFT");

        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        ClubMemberNFT memberNft = new ClubMemberNFT(deployer);
        MovrClubRegistry registry = new MovrClubRegistry(movr, address(memberNft));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));

        ClubBadgeNFT badges = new ClubBadgeNFT(deployer, address(registry));

        MovrStaking staking = new MovrStaking(deployer, movr, achievementNft);
        staking.setClubRegistry(address(registry));
        staking.setClubBadges(address(badges));
        registry.setStaking(address(staking));

        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("CLUB_MEMBER_NFT=", address(memberNft));
        console2.log("CLUB_REGISTRY=", address(registry));
        console2.log("CLUB_BADGE_NFT=", address(badges));
        console2.log("MOVR_STAKING=", address(staking));
        console2.log("Set VITE_CLUB_REGISTRY / VITE_CLUB_MEMBER_NFT / VITE_CLUB_BADGE_NFT / VITE_STAKING");
    }
}
