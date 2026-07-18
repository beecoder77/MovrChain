// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {MovrMultisig} from "../src/MovrMultisig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Schedule (or execute) Timelock batch: MOVR.approve(staking) + staking.fundRewards(amount).
/// Env: PRIVATE_KEY, MOVR_MULTISIG, TIMELOCK, MOVR_TOKEN, STAKING, TARGET_MOVR, SALT, EXECUTE (optional "1")
contract FundStakingViaTimelock is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address multisigAddr = vm.envAddress("MOVR_MULTISIG");
        address timelockAddr = vm.envAddress("TIMELOCK");
        address movr = vm.envAddress("MOVR_TOKEN");
        address staking = vm.envAddress("STAKING");
        uint256 amount = vm.envUint("TARGET_MOVR");
        bytes32 salt = vm.envOr("SALT", bytes32(uint256(0xf1)));
        bool tryExecute = vm.envOr("EXECUTE", false);

        MovrMultisig multisig = MovrMultisig(payable(multisigAddr));
        TimelockController timelock = TimelockController(payable(timelockAddr));
        uint256 delay = timelock.getMinDelay();

        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory payloads = new bytes[](2);

        targets[0] = movr;
        values[0] = 0;
        payloads[0] = abi.encodeWithSelector(IERC20.approve.selector, staking, amount);

        targets[1] = staking;
        values[1] = 0;
        payloads[1] = abi.encodeWithSignature("fundRewards(uint256)", amount);

        bytes32 predecessor = bytes32(0);
        bytes32 opId = timelock.hashOperationBatch(targets, values, payloads, predecessor, salt);

        if (tryExecute) {
            require(timelock.isOperationReady(opId), "Timelock op not ready yet");
            console2.log("Executing fundRewards batch");
            vm.startBroadcast(pk);
            timelock.executeBatch(targets, values, payloads, predecessor, salt);
            vm.stopBroadcast();
            console2.log("Executed. Staking funded.");
            return;
        }

        if (timelock.isOperation(opId) && !timelock.isOperationDone(opId)) {
            console2.log("Operation already scheduled:");
            console2.logBytes32(opId);
            console2.log("Ready?", timelock.isOperationReady(opId));
            console2.log("Wait delay (s):", delay);
            return;
        }

        bytes memory scheduleCall = abi.encodeCall(
            TimelockController.scheduleBatch, (targets, values, payloads, predecessor, salt, delay)
        );

        console2.log("Scheduling approve + fundRewards via Multisig -> Timelock");
        console2.log("Amount:", amount);
        console2.log("Delay (s):", delay);

        vm.startBroadcast(pk);
        uint256 txId = multisig.submitTransaction(timelockAddr, 0, scheduleCall);
        console2.log("Multisig txId:", txId);
        if (multisig.threshold() == 1) {
            // Nested Timelock scheduleBatch needs headroom (default estimate can OOG / fail).
            multisig.executeTransaction{gas: 800_000}(txId);
            console2.log("Multisig executed (threshold=1).");
        }
        vm.stopBroadcast();

        console2.log("Timelock op id:");
        console2.logBytes32(opId);
        console2.log("After delay: ./fund-all-pools.sh execute");
    }
}
