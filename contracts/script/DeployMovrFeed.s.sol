// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrFeed} from "../src/MovrFeed.sol";

contract DeployMovrFeed is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address attestation = vm.envAddress("ATTESTATION");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        MovrFeed feed = MovrFeed(
            address(
                new ERC1967Proxy(address(new MovrFeed()), abi.encodeCall(MovrFeed.initialize, (deployer, attestation)))
            )
        );
        vm.stopBroadcast();

        console2.log("MOVR_FEED=", address(feed));
    }
}
