// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {MovrMultisig} from "../src/MovrMultisig.sol";

/// @notice Schedule (and optionally execute after delay) a UUPS `upgradeToAndCall` or beacon `upgradeTo`.
/// Env:
///   PRIVATE_KEY          — must be a Multisig signer
///   MOVR_MULTISIG
///   TIMELOCK
///   TARGET               — proxy or UpgradeableBeacon address
///   NEW_IMPLEMENTATION
///   MODE                 — "uups" (default) or "beacon"
///   SALT                 — optional bytes32 salt (default 0)
///   EXECUTE_AFTER_DELAY  — if "1", warps are NOT done on-chain; script only executes if ready
contract UpgradeViaTimelock is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address multisigAddr = vm.envAddress("MOVR_MULTISIG");
        address timelockAddr = vm.envAddress("TIMELOCK");
        address target = vm.envAddress("TARGET");
        address newImpl = vm.envAddress("NEW_IMPLEMENTATION");
        string memory mode = vm.envOr("MODE", string("uups"));
        bytes32 salt = vm.envOr("SALT", bytes32(0));
        bool tryExecute = vm.envOr("EXECUTE_AFTER_DELAY", false);

        MovrMultisig multisig = MovrMultisig(payable(multisigAddr));
        TimelockController timelock = TimelockController(payable(timelockAddr));
        uint256 delay = timelock.getMinDelay();

        bytes memory upgradeCall;
        if (keccak256(bytes(mode)) == keccak256(bytes("beacon"))) {
            upgradeCall = abi.encodeWithSignature("upgradeTo(address)", newImpl);
        } else {
            upgradeCall = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, "");
        }

        bytes memory scheduleCall =
            abi.encodeCall(TimelockController.schedule, (target, 0, upgradeCall, bytes32(0), salt, delay));

        console2.log("Scheduling upgrade via Multisig -> Timelock");
        console2.log("Target:", target);
        console2.log("New impl:", newImpl);
        console2.log("Delay (s):", delay);

        vm.startBroadcast(pk);
        uint256 txId = multisig.submitTransaction(timelockAddr, 0, scheduleCall);
        console2.log("Multisig txId (needs 2nd confirmation + execute):", txId);
        vm.stopBroadcast();

        bytes32 opId = timelock.hashOperation(target, 0, upgradeCall, bytes32(0), salt);
        console2.log("Timelock operation id:");
        console2.logBytes32(opId);
        console2.log("Next: second signer confirms + executes the Multisig tx, then wait delay.");
        console2.log("After delay anyone can: forge script ... --sig runExecute()");

        if (tryExecute) {
            require(timelock.isOperationReady(opId), "not ready");
            vm.startBroadcast(pk);
            timelock.execute(target, 0, upgradeCall, bytes32(0), salt);
            vm.stopBroadcast();
            console2.log("Executed.");
        }
    }
}
