// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

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
        attestation = ProxyDeploy.attestation(owner);
        rewards = ProxyDeploy.milestoneReward(owner, address(movr), address(attestation));
        (memberNft,, registry) = ProxyDeploy.clubStack(owner, address(movr));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        rewards.setClubRegistry(address(registry));
        attestation.setClubRegistry(address(registry));
        registry.setMilestoneReward(address(rewards));
        movr.mint(owner, 100_000 ether);
        movr.approve(address(rewards), 10_000 ether);
        rewards.fund(10_000 ether);
        vm.stopPrank();
    }

    function testClaimPaysOneMovrPerKm() public {
        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("run-1"), 1500, 600); // 1.5 km

        uint256 before = movr.balanceOf(runner);
        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 1.5 ether);
        assertEq(movr.balanceOf(runner), before + 1.5 ether);
        assertTrue(rewards.claimed(hash));
    }

    function testExactKmPaysInteger() public {
        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("5k"), 5000, 1800);

        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 5 ether);
    }

    function testCannotClaimTwiceOrWithoutMilestone() public {
        vm.prank(runner);
        bytes32 shortHash = attestation.attestRun(keccak256("short"), 500, 200);
        vm.prank(runner);
        vm.expectRevert(bytes("not claimable"));
        rewards.claim(shortHash);

        vm.prank(runner);
        bytes32 okHash = attestation.attestRun(keccak256("ok"), 2000, 700);
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

        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("club-run"), 10_000, 3600);

        uint256 runnerBefore = movr.balanceOf(runner);
        uint256 treasuryBefore = movr.balanceOf(treasury);

        vm.prank(runner);
        uint256 paid = rewards.claim(hash);
        assertEq(paid, 10 ether);
        assertEq(movr.balanceOf(runner), runnerBefore + 10 ether);
        assertEq(movr.balanceOf(treasury), treasuryBefore + 1 ether);
        assertEq(ClubTreasury(treasury).lifetimeDonated(runner), 1 ether);
        assertEq(ClubTreasury(treasury).votingPower(runner), 3);
        assertEq(rewards.previewClubReward(hash, runner), 0);
    }

    function testClubCutProportional() public {
        vm.prank(runner);
        (, address treasury) = registry.createClub("Split", true);

        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("5k-club"), 5000, 1800);

        vm.prank(runner);
        rewards.claim(hash);
        assertEq(movr.balanceOf(treasury), 0.5 ether);
        assertEq(ClubTreasury(treasury).lifetimeDonated(runner), 0.5 ether);
    }

    function testEmptyPoolReverts() public {
        // Fresh reward contract with no funding
        vm.prank(owner);
        MovrMilestoneReward empty = ProxyDeploy.milestoneReward(owner, address(movr), address(attestation));

        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("empty"), 2000, 700);
        vm.prank(runner);
        vm.expectRevert(bytes("empty pool"));
        empty.claim(hash);
    }

    function testNonRunnerCannotClaim() public {
        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("mine"), 2000, 700);

        address thief = address(0xDEAD);
        vm.prank(thief);
        vm.expectRevert(bytes("not claimable"));
        rewards.claim(hash);
    }

    function testJoinAfterAttestDoesNotGetClubCut() public {
        // Attest while solo — club snapshot is 0
        vm.prank(runner);
        bytes32 hash = attestation.attestRun(keccak256("solo-then-join"), 10_000, 3600);

        vm.prank(runner);
        (, address treasury) = registry.createClub("Late", true);

        uint256 treasuryBefore = movr.balanceOf(treasury);
        vm.prank(runner);
        rewards.claim(hash);

        // Runner paid; no club cut (snapshot was 0 at attest)
        assertEq(movr.balanceOf(treasury), treasuryBefore);
        assertEq(attestation.clubIdAtAttest(hash), 0);
    }

    function testWithdrawExcess() public {
        uint256 before = movr.balanceOf(owner);
        vm.prank(owner);
        rewards.withdrawExcess(owner, 100 ether);
        assertEq(movr.balanceOf(owner), before + 100 ether);
    }
}
