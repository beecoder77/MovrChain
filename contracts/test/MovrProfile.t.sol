// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrProfile} from "../src/MovrProfile.sol";

contract MovrProfileTest is Test {
    MovrProfile profile;
    address runner = address(0xB0B);
    address other = address(0xA11CE);

    function setUp() public {
        profile = new MovrProfile();
    }

    function testSetAndGetProfile() public {
        vm.prank(runner);
        profile.setProfile("AlexRunner", "Alex", "Morning miles on Monad", 3);

        (
            string memory handle,
            string memory name,
            string memory bio,
            uint8 avatarId,
            uint64 updatedAt,
            bool exists
        ) = profile.getProfile(runner);

        assertTrue(exists);
        assertEq(handle, "alexrunner");
        assertEq(name, "Alex");
        assertEq(bio, "Morning miles on Monad");
        assertEq(avatarId, 3);
        assertGt(updatedAt, 0);
        assertEq(profile.resolveHandle("AlexRunner"), runner);
        assertEq(profile.resolveHandle("ALEXRUNNER"), runner);
    }

    function testHandleUniqueness() public {
        vm.prank(runner);
        profile.setProfile("stride", "A", "", 0);

        vm.prank(other);
        vm.expectRevert(bytes("handle taken"));
        profile.setProfile("Stride", "B", "", 1);
    }

    function testCannotWriteOtherProfile() public {
        vm.prank(runner);
        profile.setProfile("alice", "Alice", "", 0);

        vm.prank(other);
        profile.setProfile("bob", "Bob", "imposter", 2);

        (string memory handle,,,,,) = profile.getProfile(runner);
        assertEq(handle, "alice");
        assertEq(profile.resolveHandle("alice"), runner);
        assertEq(profile.resolveHandle("bob"), other);
    }

    function testHandleReleaseOnChange() public {
        vm.startPrank(runner);
        profile.setProfile("oldhandle", "Alex", "", 0);
        profile.setProfile("newhandle", "Alex", "", 0);
        vm.stopPrank();

        assertEq(profile.resolveHandle("oldhandle"), address(0));
        assertEq(profile.resolveHandle("newhandle"), runner);
        assertTrue(profile.isHandleAvailable("oldhandle"));
        assertFalse(profile.isHandleAvailable("newhandle"));
    }

    function testRejectsBadHandleAvatarEmptyName() public {
        vm.startPrank(runner);
        vm.expectRevert(bytes("avatar"));
        profile.setProfile("valid", "Alex", "", 20);

        vm.expectRevert(bytes("name"));
        profile.setProfile("valid", "", "bio", 0);

        vm.expectRevert(bytes("handle"));
        profile.setProfile("ab", "Alex", "", 0);

        vm.expectRevert(bytes("handle"));
        profile.setProfile("1bad", "Alex", "", 0);

        vm.expectRevert(bytes("handle"));
        profile.setProfile("bad-name", "Alex", "", 0);
        vm.stopPrank();
    }
}
