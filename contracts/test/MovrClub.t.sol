// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";

contract MovrClubTest is Test {
    MovrToken movr;
    ClubMemberNFT memberNft;
    MovrClubRegistry registry;
    ClubBadgeNFT badges;

    address creator = address(0xC1);
    address alice = address(0xA1);
    address bob = address(0xB0);

    function setUp() public {
        movr = new MovrToken(address(this));
        memberNft = new ClubMemberNFT(address(this));
        registry = new MovrClubRegistry(address(movr), address(memberNft));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        badges = new ClubBadgeNFT(address(this), address(registry));
    }

    function testCreateClubMintsMemberNftAndJoinBadge() public {
        vm.prank(creator);
        (uint256 clubId, address treasury) = registry.createClub("Dawn Pack");
        assertTrue(treasury != address(0));
        assertEq(registry.memberCount(clubId), 1);
        assertTrue(memberNft.holdsMemberNFT(creator, clubId));
        assertTrue(badges.eligible(creator, uint8(ClubBadgeNFT.Badge.JoinClub)));

        vm.prank(creator);
        badges.claim(uint8(ClubBadgeNFT.Badge.JoinClub));
        assertTrue(badges.hasClaimed(creator, uint8(ClubBadgeNFT.Badge.JoinClub)));
    }

    function testMaxTenMembersAndVotingPower() public {
        vm.prank(creator);
        (uint256 clubId, address treasury) = registry.createClub("Ten");

        for (uint256 i = 1; i < 10; i++) {
            address m = address(uint160(0x1000 + i));
            vm.prank(creator);
            registry.addMember(clubId, m);
        }
        assertEq(registry.memberCount(clubId), 10);

        address overflow = address(0xDEAD);
        vm.prank(creator);
        vm.expectRevert(bytes("full"));
        registry.addMember(clubId, overflow);

        ClubTreasury t = ClubTreasury(treasury);
        assertEq(t.votingPower(creator), 2); // NFT holder
    }

    function testDonateAndTopDonorWeight() public {
        vm.prank(creator);
        (uint256 clubId, address treasury) = registry.createClub("Donors");
        vm.prank(creator);
        registry.addMember(clubId, alice);
        vm.prank(creator);
        registry.addMember(clubId, bob);

        movr.mint(alice, 100 ether);
        movr.mint(bob, 100 ether);
        movr.mint(creator, 100 ether);

        ClubTreasury t = ClubTreasury(treasury);

        vm.startPrank(alice);
        movr.approve(treasury, 50 ether);
        t.donate(50 ether);
        vm.stopPrank();

        vm.startPrank(bob);
        movr.approve(treasury, 30 ether);
        t.donate(30 ether);
        vm.stopPrank();

        vm.startPrank(creator);
        movr.approve(treasury, 10 ether);
        t.donate(10 ether);
        vm.stopPrank();

        assertEq(t.votingPower(alice), 3); // top donor
        assertEq(t.votingPower(bob), 3);
        assertEq(t.votingPower(creator), 3);
        assertTrue(badges.eligible(alice, uint8(ClubBadgeNFT.Badge.ClubDonatur)));
    }

    function testProposalVoteExecute() public {
        vm.prank(creator);
        (uint256 clubId, address treasury) = registry.createClub("Spend");
        vm.prank(creator);
        registry.addMember(clubId, alice);

        movr.mint(alice, 20 ether);
        ClubTreasury t = ClubTreasury(treasury);
        vm.startPrank(alice);
        movr.approve(treasury, 20 ether);
        t.donate(20 ether);
        uint256 pid = t.propose("Jerseys", "Team kit", 5 ether);
        t.vote(pid, true);
        vm.stopPrank();

        vm.prank(creator);
        t.vote(pid, true);

        // Both members voted → quorum met
        assertTrue(t.votingClosed(pid));
        assertTrue(t.canExecute(pid));

        uint256 before = movr.balanceOf(alice);
        vm.prank(alice);
        t.execute(pid);
        assertEq(movr.balanceOf(alice), before + 5 ether);
        assertTrue(badges.eligible(alice, uint8(ClubBadgeNFT.Badge.PulsePayer)));
    }

    function testExecuteRequiresAllVotesOr24h() public {
        vm.prank(creator);
        (uint256 clubId, address treasury) = registry.createClub("Wait");
        vm.prank(creator);
        registry.addMember(clubId, alice);

        movr.mint(alice, 20 ether);
        ClubTreasury t = ClubTreasury(treasury);
        vm.startPrank(alice);
        movr.approve(treasury, 20 ether);
        t.donate(20 ether);
        uint256 pid = t.propose("Snacks", "Post-run", 2 ether);
        t.vote(pid, true);
        vm.stopPrank();

        // Only 1 of 2 members voted — cannot execute yet
        assertFalse(t.votingClosed(pid));
        vm.expectRevert(bytes("voting open"));
        t.execute(pid);

        // After 24h, voting closes even if not everyone voted
        vm.warp(block.timestamp + 24 hours);
        assertTrue(t.votingClosed(pid));
        assertTrue(t.canExecute(pid));
        t.execute(pid);
    }
}
