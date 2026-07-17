// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";

contract DeployClubChallenges is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address movr = vm.envAddress("MOVR_TOKEN");
        address registryAddr = vm.envAddress("CLUB_REGISTRY");
        address deployer = vm.addr(pk);

        MovrClubRegistry registry = MovrClubRegistry(registryAddr);
        ClubMemberNFT memberNft = ClubMemberNFT(address(registry.memberNft()));
        require(
            memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), deployer) || registry.owner() == deployer,
            "not admin/owner"
        );
        require(registry.challenges() == address(0), "challenges already set");

        vm.startBroadcast(pk);
        MovrClubChallenges challenges = MovrClubChallenges(
            address(
                new ERC1967Proxy(
                    address(new MovrClubChallenges()),
                    abi.encodeCall(MovrClubChallenges.initialize, (deployer, movr, registryAddr))
                )
            )
        );
        registry.setChallenges(address(challenges));
        uint256 next = registry.nextClubId();
        for (uint256 id = 1; id < next; id++) {
            registry.wireTreasury(id);
        }
        vm.stopBroadcast();

        console2.log("CLUB_CHALLENGES=", address(challenges));
    }
}
