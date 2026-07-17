// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

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
        (memberNft,, registry) = ProxyDeploy.clubStack(address(this), address(movr));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        challenges = ProxyDeploy.challenges(address(this), address(movr), address(registry));
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

    function _create(uint32 days_, uint256 reward) internal returns (uint256 id) {
        vm.prank(captain);
        id = challenges.createChallenge(clubId, "Challenge", MovrClubChallenges.DurationUnit.Days, days_, reward);
    }

    function testCreateSubmitApproveSettle() public {
        uint256 id = _create(7, 10 ether);

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

    function testNonManagerCannotCreate() public {
        vm.prank(alice);
        vm.expectRevert(bytes("manager"));
        challenges.createChallenge(clubId, "Nope", MovrClubChallenges.DurationUnit.Days, 7, 1 ether);
    }

    function testNonManagerCannotApprove() public {
        uint256 id = _create(1, 1 ether);

        vm.prank(alice);
        challenges.submitCompletion(id);

        vm.prank(alice);
        vm.expectRevert(bytes("manager"));
        challenges.approveCompletion(id, alice);
    }

    function testRejectThenResubmit() public {
        uint256 id = _create(3, 2 ether);

        vm.prank(alice);
        challenges.submitCompletion(id);

        vm.prank(admin);
        challenges.rejectCompletion(id, alice);
        assertEq(uint8(challenges.completionStatus(id, alice)), uint8(MovrClubChallenges.CompletionStatus.Rejected));

        vm.prank(alice);
        challenges.submitCompletion(id);
        assertEq(uint8(challenges.completionStatus(id, alice)), uint8(MovrClubChallenges.CompletionStatus.Pending));
    }

    function testRevokeApproval() public {
        uint256 id = _create(3, 2 ether);
        vm.prank(alice);
        challenges.submitCompletion(id);
        vm.prank(admin);
        challenges.approveCompletion(id, alice);

        (,,,,,,,,, uint256 approved) = challenges.getChallenge(id);
        assertEq(approved, 1);

        vm.prank(admin);
        challenges.revokeApproval(id, alice);
        assertEq(uint8(challenges.completionStatus(id, alice)), uint8(MovrClubChallenges.CompletionStatus.Rejected));
        (,,,,,,,,, approved) = challenges.getChallenge(id);
        assertEq(approved, 0);
    }

    function testCancelRefundsTreasury() public {
        uint256 treasuryBefore = movr.balanceOf(treasury);
        uint256 id = _create(7, 5 ether);
        assertEq(movr.balanceOf(treasury), treasuryBefore - 5 ether);

        vm.prank(captain);
        challenges.cancelChallenge(id);

        assertEq(movr.balanceOf(treasury), treasuryBefore);
        (,,,,,,,, MovrClubChallenges.ChallengeState state,) = challenges.getChallenge(id);
        assertEq(uint8(state), uint8(MovrClubChallenges.ChallengeState.Cancelled));
    }

    function testSettleZeroWinnersRefundsTreasury() public {
        uint256 treasuryBefore = movr.balanceOf(treasury);
        uint256 id = _create(1, 5 ether);
        assertEq(movr.balanceOf(treasury), treasuryBefore - 5 ether);

        vm.warp(block.timestamp + 2 days);
        vm.prank(captain);
        challenges.settle(id);

        assertEq(movr.balanceOf(treasury), treasuryBefore);
        assertFalse(challenges.isActive(id));
    }

    function testSettleDustRefundsTreasury() public {
        // 2 wei pool with 3 approved winners → each==0; must refund not lock
        uint256 id = _create(1, 2);
        vm.prank(alice);
        challenges.submitCompletion(id);
        vm.prank(admin);
        challenges.submitCompletion(id);
        vm.prank(captain);
        challenges.submitCompletion(id);

        vm.prank(captain);
        challenges.approveCompletion(id, alice);
        vm.prank(captain);
        challenges.approveCompletion(id, admin);
        vm.prank(captain);
        challenges.approveCompletion(id, captain);

        uint256 treasuryBefore = movr.balanceOf(treasury);
        vm.warp(block.timestamp + 2 days);
        vm.prank(captain);
        challenges.settle(id);

        assertEq(movr.balanceOf(treasury), treasuryBefore + 2);
    }

    function testMultipleWinnersSplitRemainder() public {
        uint256 id = _create(2, 10 ether);

        vm.prank(alice);
        challenges.submitCompletion(id);
        vm.prank(admin);
        challenges.submitCompletion(id);

        vm.prank(captain);
        challenges.approveCompletion(id, alice);
        vm.prank(captain);
        challenges.approveCompletion(id, admin);

        vm.warp(block.timestamp + 3 days);
        uint256 treasuryBefore = movr.balanceOf(treasury);
        vm.prank(captain);
        challenges.settle(id);

        assertEq(movr.balanceOf(alice), 5 ether);
        assertEq(movr.balanceOf(admin), 5 ether);
        assertEq(movr.balanceOf(treasury), treasuryBefore);
    }

    /// @notice Approved member who leaves before settle forfeits; remaining winners split full pool.
    function testApprovedLeaverForfeitsOnSettle() public {
        address bob = address(0xB2);
        vm.prank(captain);
        registry.addMember(clubId, bob);

        uint256 id = _create(7, 10 ether);

        vm.prank(alice);
        challenges.submitCompletion(id);
        vm.prank(bob);
        challenges.submitCompletion(id);

        vm.prank(admin);
        challenges.approveCompletion(id, alice);
        vm.prank(admin);
        challenges.approveCompletion(id, bob);

        (,,,,,,,,, uint256 approvedStored) = challenges.getChallenge(id);
        assertEq(approvedStored, 2);

        vm.prank(alice);
        registry.leaveClub(clubId);

        vm.warp(block.timestamp + 8 days);
        vm.prank(captain);
        challenges.settle(id);

        assertEq(movr.balanceOf(bob), 10 ether);
        assertEq(movr.balanceOf(alice), 0);
    }

    function testNonMemberCannotSubmit() public {
        uint256 id = _create(1, 1 ether);

        address outsider = address(0x0F);
        vm.prank(outsider);
        vm.expectRevert(bytes("member"));
        challenges.submitCompletion(id);
    }

    function testRejectsOverlongDuration() public {
        vm.prank(captain);
        vm.expectRevert(bytes("duration"));
        challenges.createChallenge(clubId, "Too long", MovrClubChallenges.DurationUnit.Days, 91, 1 ether);

        vm.prank(captain);
        vm.expectRevert(bytes("duration"));
        challenges.createChallenge(clubId, "Too many months", MovrClubChallenges.DurationUnit.Months, 4, 1 ether);
    }
}
