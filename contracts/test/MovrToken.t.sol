// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";

contract MovrTokenTest is Test {
    MovrToken movr;
    address owner = address(0xA11CE);
    address stranger = address(0xB0B);

    function setUp() public {
        movr = new MovrToken(owner);
    }

    function testOwnerCanMint() public {
        vm.prank(owner);
        movr.mint(stranger, 100 ether);
        assertEq(movr.balanceOf(stranger), 100 ether);
        assertEq(movr.symbol(), "MOVR");
    }

    function testNonOwnerCannotMint() public {
        vm.prank(stranger);
        vm.expectRevert();
        movr.mint(stranger, 1 ether);
    }

    function testSetAdmin() public {
        vm.prank(owner);
        movr.setAdmin(stranger, true);
        assertTrue(movr.hasRole(movr.ADMIN_ROLE(), stranger));

        vm.prank(owner);
        movr.setAdmin(stranger, false);
        assertFalse(movr.hasRole(movr.ADMIN_ROLE(), stranger));
    }

    function testZeroOwnerRejected() public {
        vm.expectRevert(bytes("owner=0"));
        new MovrToken(address(0));
    }

    function testMintRespectsMaxSupply() public {
        vm.startPrank(owner);
        movr.mint(owner, movr.MAX_SUPPLY());
        vm.expectRevert(bytes("cap"));
        movr.mint(owner, 1);
        vm.stopPrank();
    }
}
