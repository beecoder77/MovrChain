// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrStaking} from "../src/MovrStaking.sol";

/// @notice Hackathon fast path: new MovrStaking proxy with deployer as DEFAULT_ADMIN,
///         wire clubs, fundRewards immediately (no Timelock wait).
/// Env: PRIVATE_KEY, MOVR_TOKEN, ACHIEVEMENT_NFT, CLUB_REGISTRY, CLUB_BADGE_NFT
///      optional REWARD_AMOUNT (default 1_000_000 ether)
contract DeployFundStakingDirect is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        MovrToken movr = MovrToken(vm.envAddress("MOVR_TOKEN"));
        address achievements = vm.envAddress("ACHIEVEMENT_NFT");
        address registry = vm.envAddress("CLUB_REGISTRY");
        address badges = vm.envAddress("CLUB_BADGE_NFT");
        uint256 amount = vm.envOr("REWARD_AMOUNT", uint256(1_000_000 ether));

        console2.log("Deployer:", deployer);
        console2.log("MOVR:", address(movr));
        console2.log("Achievements:", achievements);

        vm.startBroadcast(pk);

        MovrStaking impl = new MovrStaking();
        MovrStaking staking = MovrStaking(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(MovrStaking.initialize, (deployer, address(movr), achievements))
                )
            )
        );
        staking.setClubRegistry(registry);
        staking.setClubBadges(badges);

        if (movr.balanceOf(deployer) < amount) {
            movr.mint(deployer, amount - movr.balanceOf(deployer));
        }
        movr.approve(address(staking), amount);
        staking.fundRewards(amount);

        vm.stopBroadcast();

        console2.log("=== Update .env + frontend ===");
        console2.log("MOVR_STAKING_IMPL=", address(impl));
        console2.log("STAKING=", address(staking));
        console2.log("MOVR_STAKING=", address(staking));
        console2.log("rewardReserve=", staking.rewardReserve());
        console2.log("staking MOVR bal=", movr.balanceOf(address(staking)));
    }
}
