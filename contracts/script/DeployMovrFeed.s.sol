// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrFeed} from "../src/MovrFeed.sol";

/// @notice Deploy MovrFeed. Env: PRIVATE_KEY, ATTESTATION
contract DeployMovrFeed is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address attestation = vm.envAddress("ATTESTATION");

        console2.log("Deployer:", vm.addr(pk));
        console2.log("Attestation:", attestation);

        vm.startBroadcast(pk);
        MovrFeed feed = new MovrFeed(vm.addr(pk), attestation);
        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("MOVR_FEED=", address(feed));
    }
}
