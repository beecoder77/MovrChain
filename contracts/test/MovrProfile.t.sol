// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrProfile} from "../src/MovrProfile.sol";

contract MovrProfileTest is Test {
    MovrProfile profile;
    address runner = address(0xB0B);

    function setUp() public {
        profile = new MovrProfile();
    }

    function testSetAndGetProfile() public {
        vm.prank(runner);
        profile.setProfile("Alex", "Morning miles on Monad", 3);

        (string memory name, string memory bio, uint8 avatarId, uint64 updatedAt, bool exists) =
            profile.getProfile(runner);

        assertTrue(exists);
        assertEq(name, "Alex");
        assertEq(bio, "Morning miles on Monad");
        assertEq(avatarId, 3);
        assertGt(updatedAt, 0);
    }

    function testRejectsBadAvatarAndEmptyName() public {
        vm.startPrank(runner);
        vm.expectRevert(bytes("avatar"));
        profile.setProfile("Alex", "", 20);

        vm.expectRevert(bytes("name"));
        profile.setProfile("", "bio", 0);
        vm.stopPrank();
    }
}
