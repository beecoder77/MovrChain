// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrMultisig} from "../src/MovrMultisig.sol";

contract CallTarget {
    uint256 public value;

    function setValue(uint256 v) external {
        value = v;
    }
}

contract MovrMultisigTest is Test {
    address s1 = address(0x1);
    address s2 = address(0x2);
    address s3 = address(0x3);
    address outsider = address(0x9);

    MovrMultisig multisig;
    CallTarget target;

    function setUp() public {
        multisig = new MovrMultisig(s1, s2, s3);
        target = new CallTarget();
    }

    function testRejectsInvalidConstructorSigners() public {
        vm.expectRevert(MovrMultisig.InvalidSigner.selector);
        new MovrMultisig(s1, s1, s3);

        vm.expectRevert(MovrMultisig.InvalidSigner.selector);
        new MovrMultisig(address(0), s2, s3);
    }

    function testOneOfThreeCannotExecute() public {
        bytes memory data = abi.encodeCall(CallTarget.setValue, (42));
        vm.prank(s1);
        uint256 txId = multisig.submitTransaction(address(target), 0, data);

        vm.prank(s1);
        vm.expectRevert(MovrMultisig.NotEnoughConfirmations.selector);
        multisig.executeTransaction(txId);
    }

    function testTwoOfThreeCanExecute() public {
        bytes memory data = abi.encodeCall(CallTarget.setValue, (7));
        vm.prank(s1);
        uint256 txId = multisig.submitTransaction(address(target), 0, data);

        vm.prank(s2);
        multisig.confirmTransaction(txId);

        vm.prank(s3);
        multisig.executeTransaction(txId);

        assertEq(target.value(), 7);
    }

    function testNonSignerCannotSubmit() public {
        vm.prank(outsider);
        vm.expectRevert(MovrMultisig.NotSigner.selector);
        multisig.submitTransaction(address(target), 0, abi.encodeCall(CallTarget.setValue, (1)));
    }

    function testReplaceSignerViaSelfCall() public {
        address s4 = address(0x4);
        bytes memory rotate = abi.encodeCall(MovrMultisig.replaceSigner, (s3, s4));

        vm.prank(s1);
        uint256 txId = multisig.submitTransaction(address(multisig), 0, rotate);
        vm.prank(s2);
        multisig.confirmTransaction(txId);
        vm.prank(s1);
        multisig.executeTransaction(txId);

        assertFalse(multisig.isSigner(s3));
        assertTrue(multisig.isSigner(s4));

        // Direct replaceSigner must fail
        vm.expectRevert(MovrMultisig.NotSelf.selector);
        multisig.replaceSigner(s1, address(0x5));
    }
}
