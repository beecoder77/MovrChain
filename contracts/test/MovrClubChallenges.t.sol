// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";

contract MovrClubChallengesTest is Test {
    MovrToken movr;
    ClubMemberNFT memberNft;
    MovrClubRegistry registry;
    MovrClubChallenges challenges;

    address captain = address(0xC1);
    address admin = address(0xAD);
    address alice = address(0xA1);

    uint256 clubId;
    address treasury;

    function setUp() public {
        movr = new MovrToken(address(this));
        memberNft = new ClubMemberNFT(address(this));
        registry = new MovrClubRegistry(address(movr), address(memberNft));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        challenges = new MovrClubChallenges(address(movr), address(registry));
        registry.setChallenges(address(challenges));

        vm.prank(captain);
        (clubId, treasury) = registry.createClub("Pack", true);
        vm.prank(captain);
        registry.addMember(clubId, admin);
        vm.prank(captain);
        registry.addMember(clubId, alice);
        vm.prank(captain);
        registry.setClubAdmin(clubId, admin, true);

        movr.mint(captain, 100 ether);
        ClubTreasury t = ClubTreasury(treasury);
        vm.startPrank(captain);
        movr.approve(treasury, 50 ether);
        t.donate(50 ether);
        vm.stopPrank();
    }

    function testCreateSubmitApproveSettle() public {
        vm.prank(alice);
        uint256 id = challenges.createChallenge(
            clubId,
            "Run every morning before work",
            MovrClubChallenges.DurationUnit.Days,
            7,
            10 ether
        );
        assertEq(id, 1);

        vm.prank(alice);
        challenges.submitCompletion(id);

        vm.prank(admin);
        challenges.approveCompletion(id, alice);

        vm.warp(block.timestamp + 8 days);

        vm.prank(captain);
        challenges.settle(id);

        assertEq(movr.balanceOf(alice), 10 ether);
        assertFalse(challenges.isActive(id));
    }

    function testNonManagerCannotApprove() public {
        vm.prank(alice);
        uint256 id = challenges.createChallenge(
            clubId, "Sprint week", MovrClubChallenges.DurationUnit.Hours, 24, 1 ether
        );

        vm.prank(alice);
        challenges.submitCompletion(id);

        vm.prank(alice);
        vm.expectRevert(bytes("manager"));
        challenges.approveCompletion(id, alice);
    }
}
