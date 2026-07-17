// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";

contract DeployMilestoneReward is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address attestation = vm.envAddress("ATTESTATION");
        address clubRegistry = vm.envOr("CLUB_REGISTRY", address(0));

        vm.startBroadcast(pk);
        MovrMilestoneReward rewards = MovrMilestoneReward(
            address(
                new ERC1967Proxy(
                    address(new MovrMilestoneReward()),
                    abi.encodeCall(MovrMilestoneReward.initialize, (deployer, movr, attestation))
                )
            )
        );
        if (clubRegistry != address(0)) {
            rewards.setClubRegistry(clubRegistry);
            MovrChainAttestation(attestation).setClubRegistry(clubRegistry);
            MovrClubRegistry(clubRegistry).setMilestoneReward(address(rewards));
        }
        vm.stopBroadcast();

        console2.log("MILESTONE_REWARD=", address(rewards));
    }
}
