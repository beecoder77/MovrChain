// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {MovrMultisig} from "../src/MovrMultisig.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

/// @dev V2 attestation that exposes a marker for upgrade verification.
contract MovrChainAttestationV2 is MovrChainAttestation {
    function version() external pure returns (string memory) {
        return "v2";
    }
}

contract MovrUpgradeTest is Test {
    uint256 constant DELAY = 1 days;

    address s1 = address(0xA1);
    address s2 = address(0xA2);
    address s3 = address(0xA3);
    address runner = address(0xB0B);

    MovrMultisig multisig;
    TimelockController timelock;
    MovrChainAttestation attestation;

    function setUp() public {
        multisig = new MovrMultisig(s1, s2, s3, 2);

        address[] memory proposers = new address[](1);
        proposers[0] = address(multisig);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // open executor

        timelock = new TimelockController(DELAY, proposers, executors, address(this));
        // Renounce optional admin so only Multisig→Timelock path remains for role changes.
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));

        attestation = ProxyDeploy.attestation(address(timelock));
    }

    function _scheduleUpgrade(address newImpl) internal returns (bytes32 opId) {
        bytes memory upgradeCall = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, "");
        bytes memory scheduleCall = abi.encodeCall(
            TimelockController.schedule, (address(attestation), 0, upgradeCall, bytes32(0), bytes32(0), DELAY)
        );

        vm.prank(s1);
        uint256 txId = multisig.submitTransaction(address(timelock), 0, scheduleCall);
        vm.prank(s2);
        multisig.confirmTransaction(txId);
        vm.prank(s1);
        multisig.executeTransaction(txId);

        opId = timelock.hashOperation(address(attestation), 0, upgradeCall, bytes32(0), bytes32(0));
    }

    function testPrematureUpgradeExecuteReverts() public {
        // Seed state
        vm.prank(runner);
        bytes32 runHash = attestation.attestRun(keccak256("r1"), 1500, 600);
        assertTrue(attestation.isAttested(runHash));

        MovrChainAttestationV2 v2 = new MovrChainAttestationV2();
        bytes32 opId = _scheduleUpgrade(address(v2));

        bytes memory upgradeCall = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(v2), "");
        vm.expectRevert();
        timelock.execute(address(attestation), 0, upgradeCall, bytes32(0), bytes32(0));

        assertTrue(timelock.isOperationPending(opId));
        assertTrue(attestation.isAttested(runHash));
    }

    function testUpgradeViaTimelockPreservesState() public {
        vm.prank(runner);
        bytes32 runHash = attestation.attestRun(keccak256("r2"), 2500, 900);
        (uint256 total,,,,,) = attestation.runnerStats(runner);
        assertEq(total, 2500);

        MovrChainAttestationV2 v2 = new MovrChainAttestationV2();
        _scheduleUpgrade(address(v2));

        bytes memory upgradeCall = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(v2), "");
        vm.warp(block.timestamp + DELAY + 1);
        timelock.execute(address(attestation), 0, upgradeCall, bytes32(0), bytes32(0));

        // State preserved
        assertTrue(attestation.isAttested(runHash));
        (uint256 totalAfter,,,,,) = attestation.runnerStats(runner);
        assertEq(totalAfter, 2500);

        // New logic live
        assertEq(MovrChainAttestationV2(address(attestation)).version(), "v2");
    }

    function testDirectUpgradeByNonOwnerReverts() public {
        MovrChainAttestationV2 v2 = new MovrChainAttestationV2();
        (bool ok,) =
            address(attestation).call(abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(v2), ""));
        assertFalse(ok);
    }
}
