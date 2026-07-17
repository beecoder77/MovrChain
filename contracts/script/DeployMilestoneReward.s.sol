// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";

/// @notice Deploy MovrMilestoneReward and wire club treasury run rewards.
/// Env: PRIVATE_KEY, MOVR_TOKEN, ATTESTATION, CLUB_REGISTRY (optional but required for club cut)
contract DeployMilestoneReward is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address attestation = vm.envAddress("ATTESTATION");
        address clubRegistry = vm.envOr("CLUB_REGISTRY", address(0));

        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);
        MovrMilestoneReward rewards = new MovrMilestoneReward(deployer, movr, attestation);
        if (clubRegistry != address(0)) {
            rewards.setClubRegistry(clubRegistry);
            MovrChainAttestation(attestation).setClubRegistry(clubRegistry);
            MovrClubRegistry(clubRegistry).setMilestoneReward(address(rewards));
        }
        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("MILESTONE_REWARD=", address(rewards));
        console2.log("CLUB_REGISTRY=", clubRegistry);
        console2.log("Default rewardPerKm=", rewards.rewardPerKm());
        console2.log("Default clubRewardPer10Km=", rewards.clubRewardPer10Km());
        console2.log("Next: approve + fund via deploy-milestone-reward.sh");
    }
}
