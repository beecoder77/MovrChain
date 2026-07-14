// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrStaking} from "../src/MovrStaking.sol";

/// @notice Mint (if needed), approve, and fund staking rewards.
/// Env: PRIVATE_KEY, MOVR_TOKEN, STAKING, optional REWARD_AMOUNT (default 1_000_000 ether)
contract FundRewards is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        MovrToken movr = MovrToken(vm.envAddress("MOVR_TOKEN"));
        MovrStaking staking = MovrStaking(vm.envAddress("STAKING"));
        uint256 amount = vm.envOr("REWARD_AMOUNT", uint256(1_000_000 ether));

        console2.log("Deployer:", deployer);
        console2.log("MOVR:", address(movr));
        console2.log("Staking:", address(staking));
        console2.log("Amount:", amount);

        vm.startBroadcast(pk);

        if (movr.balanceOf(deployer) < amount) {
            uint256 mintAmt = amount - movr.balanceOf(deployer);
            console2.log("Minting:", mintAmt);
            movr.mint(deployer, mintAmt);
        }

        movr.approve(address(staking), amount);
        staking.fundRewards(amount);

        vm.stopBroadcast();

        console2.log("Staking MOVR balance:", movr.balanceOf(address(staking)));
        console2.log("Done.");
    }
}
