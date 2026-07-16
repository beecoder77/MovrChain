// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";

contract MovrMilestoneRewardTest is Test {
    MovrToken movr;
    MovrChainAttestation attestation;
    MovrMilestoneReward rewards;
    ClubMemberNFT memberNft;
    MovrClubRegistry registry;

    address owner = address(0xA11CE);
    address runner = address(0xB0B);

    function setUp() public {
        vm.startPrank(owner);
        movr = new MovrToken(owner);
        attestation = new MovrChainAttestation();
        rewards = new MovrMilestoneReward(owner, address(movr), address(attestation));
        memberNft = new ClubMemberNFT(owner);
        registry = new MovrClubRegistry(address(movr), address(memberNft));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        rewards.setClubRegistry(address(registry));
        registry.setMilestoneReward(address(rewards));
        movr.mint(owner, 100_000 ether);
        movr.approve(address(rewards), 10_000 ether);
        rewards.fund(10_000 ether);
        vm.stopPrank();
    }

    function testClaimPaysOneMovrPerKm() public {
        bytes32 hash = keccak256("run-1");
        vm.prank(runner);
        attestation.attestRun(hash, 1500, 600); // 1.5 km → 1.5 MOVR

        uint256 before = movr.balanceOf(runner);
        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 1.5 ether);
        assertEq(movr.balanceOf(runner), before + 1.5 ether);
        assertTrue(rewards.claimed(hash));
    }

    function testExactKmPaysInteger() public {
        bytes32 hash = keccak256("5k");
        vm.prank(runner);
        attestation.attestRun(hash, 5000, 1800);

        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 5 ether);
    }

    function testCannotClaimTwiceOrWithoutMilestone() public {
        bytes32 shortHash = keccak256("short");
        vm.prank(runner);
        attestation.attestRun(shortHash, 500, 200);
        vm.prank(runner);
        vm.expectRevert(bytes("not claimable"));
        rewards.claim(shortHash);

        bytes32 okHash = keccak256("ok");
        vm.prank(runner);
        attestation.attestRun(okHash, 2000, 700);
        vm.prank(runner);
        rewards.claim(okHash);
        vm.prank(runner);
        vm.expectRevert(bytes("not claimable"));
        rewards.claim(okHash);
    }

    function testClubMemberGetsTreasuryCutAndTopDonorCredit() public {
        vm.prank(runner);
        (uint256 clubId, address treasury) = registry.createClub("Pulse", true);
        assertEq(clubId, 1);

        bytes32 hash = keccak256("club-run");
        vm.prank(runner);
        attestation.attestRun(hash, 10_000, 3600); // 10 km → 10 MOVR runner + 1 MOVR club

        uint256 runnerBefore = movr.balanceOf(runner);
        uint256 treasuryBefore = movr.balanceOf(treasury);

        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 10 ether);
        assertEq(movr.balanceOf(runner), runnerBefore + 10 ether);
        assertEq(movr.balanceOf(treasury), treasuryBefore + 1 ether);
        assertEq(ClubTreasury(treasury).lifetimeDonated(runner), 1 ether);
        assertEq(ClubTreasury(treasury).votingPower(runner), 3); // sole top donor → 3×
        assertEq(rewards.previewClubReward(hash, runner), 0); // already claimed
    }

    function testClubCutProportional() public {
        vm.prank(runner);
        (, address treasury) = registry.createClub("Split", true);

        bytes32 hash = keccak256("5k-club");
        vm.prank(runner);
        attestation.attestRun(hash, 5000, 1800); // 0.5 MOVR to club

        vm.prank(runner);
        rewards.claim(hash);
        assertEq(movr.balanceOf(treasury), 0.5 ether);
        assertEq(ClubTreasury(treasury).lifetimeDonated(runner), 0.5 ether);
    }
}
