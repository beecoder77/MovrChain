// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrProfile} from "../src/MovrProfile.sol";

/// @notice Deploy MovrProfile only (keeps existing MOVR / attestation / NFT / staking).
/// Env: PRIVATE_KEY
contract DeployMovrProfile is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);
        MovrProfile profile = new MovrProfile();
        vm.stopBroadcast();

        console2.log("=== Deployed ===");
        console2.log("MOVR_PROFILE=", address(profile));
        console2.log("Set VITE_PROFILE_ADDRESS=", address(profile));
    }
}
