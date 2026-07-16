// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";

/// @notice Deploy challenges + wire registry and existing club treasuries.
/// Requires a registry deployed from current MovrClubRegistry.sol (with setChallenges).
/// Env: PRIVATE_KEY, MOVR_TOKEN, CLUB_REGISTRY
contract DeployClubChallenges is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address movr = vm.envAddress("MOVR_TOKEN");
        address registryAddr = vm.envAddress("CLUB_REGISTRY");
        address deployer = vm.addr(pk);

        // Preflight: old registries lack challenges() - staticcall fails with empty revert.
        (bool hasChallengesGetter,) =
            registryAddr.staticcall(abi.encodeWithSignature("challenges()"));
        require(hasChallengesGetter, "registry outdated: run ./deploy-clubs.sh first");

        MovrClubRegistry registry = MovrClubRegistry(registryAddr);
        ClubMemberNFT memberNft = ClubMemberNFT(address(registry.memberNft()));
        require(
            memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), deployer),
            "deployer is not ClubMemberNFT admin - use the wallet that ran deploy-clubs.sh"
        );
        require(registry.challenges() == address(0), "challenges already set on registry");

        vm.startBroadcast(pk);

        MovrClubChallenges challenges = new MovrClubChallenges(movr, registryAddr);
        registry.setChallenges(address(challenges));

        uint256 next = registry.nextClubId();
        for (uint256 id = 1; id < next; id++) {
            registry.wireTreasury(id);
        }

        vm.stopBroadcast();

        console2.log("CLUB_CHALLENGES=", address(challenges));
        console2.log("Set VITE_CLUB_CHALLENGES=", address(challenges));
    }
}
