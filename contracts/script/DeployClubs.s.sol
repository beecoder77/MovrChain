// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {MovrStaking} from "../src/MovrStaking.sol";

/// @dev Partial UUPS+Beacon club deploy. Prefer `DeployUpgradeableStack` for Timelock ownership.
contract DeployClubs is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address achievementNft = vm.envAddress("ACHIEVEMENT_NFT");

        vm.startBroadcast(pk);

        ClubMemberNFT memberNft = ClubMemberNFT(
            address(
                new ERC1967Proxy(address(new ClubMemberNFT()), abi.encodeCall(ClubMemberNFT.initialize, (deployer)))
            )
        );
        UpgradeableBeacon beacon = new UpgradeableBeacon(address(new ClubTreasury()), deployer);
        MovrClubRegistry registry = MovrClubRegistry(
            address(
                new ERC1967Proxy(
                    address(new MovrClubRegistry()),
                    abi.encodeCall(MovrClubRegistry.initialize, (deployer, movr, address(memberNft), address(beacon)))
                )
            )
        );
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));

        ClubBadgeNFT badges = ClubBadgeNFT(
            address(
                new ERC1967Proxy(
                    address(new ClubBadgeNFT()), abi.encodeCall(ClubBadgeNFT.initialize, (deployer, address(registry)))
                )
            )
        );

        MovrStaking staking = MovrStaking(
            address(
                new ERC1967Proxy(
                    address(new MovrStaking()), abi.encodeCall(MovrStaking.initialize, (deployer, movr, achievementNft))
                )
            )
        );
        staking.setClubRegistry(address(registry));
        staking.setClubBadges(address(badges));
        registry.setStaking(address(staking));

        vm.stopBroadcast();

        console2.log("CLUB_MEMBER_NFT=", address(memberNft));
        console2.log("CLUB_REGISTRY=", address(registry));
        console2.log("CLUB_BADGE_NFT=", address(badges));
        console2.log("MOVR_STAKING=", address(staking));
        console2.log("TREASURY_BEACON=", address(beacon));
    }
}
