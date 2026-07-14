// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";

/// @notice Deploy MovrMilestoneReward only. Fund separately with cast (Monad gas).
/// Env: PRIVATE_KEY, MOVR_TOKEN, ATTESTATION
contract DeployMilestoneReward is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address movr = vm.envAddress("MOVR_TOKEN");
        address attestation = vm.envAddress("ATTESTATION");

        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);
        MovrMilestoneReward rewards = new MovrMilestoneReward(deployer, movr, attestation);
        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("MILESTONE_REWARD=", address(rewards));
        console2.log("Default rewardPerKm=", rewards.rewardPerKm());
        console2.log("Next: approve + fund via deploy-milestone-reward.sh");
    }
}
