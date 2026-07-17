// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

contract MovrChainTest is Test {
    MovrToken movr;
    MovrChainAttestation attestation;
    AchievementNFT nfts;
    MovrStaking staking;

    address owner = address(0xA11CE);
    address runner = address(0xB0B);

    function setUp() public {
        vm.startPrank(owner);
        movr = new MovrToken(owner);
        attestation = ProxyDeploy.attestation(owner);
        nfts = ProxyDeploy.achievementNft(owner, address(attestation));
        staking = ProxyDeploy.staking(owner, address(movr), address(nfts));

        nfts.createAchievement(
            "First Kilometer", "1km single run", AchievementNFT.Criterion.SingleRunMeters, 1000, 500, "ipfs://1k"
        );

        movr.mint(owner, 100_000 ether);
        movr.approve(address(staking), 50_000 ether);
        staking.fundRewards(50_000 ether);
        movr.mint(runner, 1_000 ether);
        vm.stopPrank();
    }

    function testAttestAndClaim() public {
        vm.startPrank(runner);
        bytes32 route = keccak256("route-1");
        bytes32 hash = attestation.attestRun(route, 5200, 1800);
        assertEq(hash, attestation.computeRunHash(runner, 5200, 1800, route));
        assertTrue(nfts.eligible(runner, 1));
        uint256 tokenId = nfts.claimAchievement(1);
        assertEq(nfts.ownerOf(tokenId), runner);
        assertEq(nfts.accountBoostBps(runner), 500);
        assertEq(nfts.tokenURI(tokenId), "ipfs://1k");
        vm.stopPrank();

        vm.startPrank(owner);
        nfts.setAchievementURI(1, "data:application/json,{\"name\":\"1K\"}");
        assertEq(nfts.achievementURI(1), "data:application/json,{\"name\":\"1K\"}");
        nfts.setTokenURI(tokenId, "data:application/json,{\"name\":\"1K\"}");
        assertEq(nfts.tokenURI(tokenId), "data:application/json,{\"name\":\"1K\"}");
        vm.stopPrank();
    }

    function testStakingBoostedByAchievement() public {
        vm.startPrank(runner);
        attestation.attestRun(keccak256("route-2"), 1500, 600);
        nfts.claimAchievement(1);

        movr.approve(address(staking), 100 ether);
        staking.stake(100 ether);

        vm.warp(block.timestamp + 1 days);
        uint256 pending = staking.pendingReward(runner);
        assertGt(pending, 0);
        staking.claim();
        vm.stopPrank();
    }

    function testRejectsUnrealisticPace() public {
        vm.prank(runner);
        vm.expectRevert(MovrChainAttestation.PaceUnrealistic.selector);
        // 50 km in 10 seconds
        attestation.attestRun(keccak256("fast"), 50_000, 10);
    }

    function testRejectsDistanceTooHigh() public {
        vm.prank(runner);
        vm.expectRevert(MovrChainAttestation.DistanceTooHigh.selector);
        attestation.attestRun(keccak256("ultra"), 250_000, 50_000);
    }

    function testPauseBlocksAttest() public {
        vm.prank(owner);
        attestation.pause();
        vm.prank(runner);
        vm.expectRevert();
        attestation.attestRun(keccak256("p"), 1500, 600);
    }

    function testHashBoundToCaller() public {
        bytes32 route = keccak256("shared-route");
        vm.prank(runner);
        bytes32 a = attestation.attestRun(route, 2000, 800);
        address other = address(0xC0C);
        vm.prank(other);
        bytes32 b = attestation.attestRun(route, 2000, 800);
        assertTrue(a != b);
        (address runnerA,,,,,) = attestation.attestations(a);
        (address runnerB,,,,,) = attestation.attestations(b);
        assertEq(runnerA, runner);
        assertEq(runnerB, other);
    }

    function testRejectsZeroDistanceAndDuration() public {
        vm.startPrank(runner);
        vm.expectRevert(MovrChainAttestation.InvalidDistance.selector);
        attestation.attestRun(keccak256("zd"), 0, 600);
        vm.expectRevert(MovrChainAttestation.InvalidDuration.selector);
        attestation.attestRun(keccak256("zt"), 1500, 0);
        vm.stopPrank();
    }

    function testRejectsDurationTooHigh() public {
        vm.prank(runner);
        vm.expectRevert(MovrChainAttestation.DurationTooHigh.selector);
        // 201 km would also fail distance; use valid distance with >48h duration
        attestation.attestRun(keccak256("long"), 10_000, 200_000);
    }

    function testRejectsDuplicateRunHash() public {
        bytes32 route = keccak256("dup");
        vm.prank(runner);
        attestation.attestRun(route, 2000, 800);
        vm.prank(runner);
        vm.expectRevert(MovrChainAttestation.AlreadyAttested.selector);
        attestation.attestRun(route, 2000, 800);
    }

    function testDailyLimit() public {
        vm.startPrank(runner);
        for (uint256 i = 0; i < 24; i++) {
            attestation.attestRun(keccak256(abi.encode("day", i)), 1100, 500);
        }
        vm.expectRevert(MovrChainAttestation.DailyLimit.selector);
        attestation.attestRun(keccak256("day-overflow"), 1100, 500);
        vm.stopPrank();
    }

    function testStreakMilestoneAndBreak() public {
        // Absolute warps avoid via_ir CSE quirks around block.timestamp locals.
        vm.warp(1_700_000_000);
        vm.startPrank(runner);
        // Sub-1km: no streak
        attestation.attestRun(keccak256("short"), 500, 200);
        (,,, uint256 streak,,) = attestation.runnerStats(runner);
        assertEq(streak, 0);

        attestation.attestRun(keccak256("d1"), 1500, 600);
        (,,, streak,,) = attestation.runnerStats(runner);
        assertEq(streak, 1);

        vm.warp(1_700_000_000 + 1 days);
        attestation.attestRun(keccak256("d2"), 1500, 600);
        (,,, streak,,) = attestation.runnerStats(runner);
        assertEq(streak, 2);

        // Miss a day → streak resets
        vm.warp(1_700_000_000 + 3 days);
        attestation.attestRun(keccak256("d3"), 1500, 600);
        uint256 longest;
        (,,, streak, longest,) = attestation.runnerStats(runner);
        assertEq(streak, 1);
        assertEq(longest, 2);
        vm.stopPrank();
    }

    function testSubKmRunDecaysStaleStreak() public {
        vm.warp(1_700_000_000);
        vm.startPrank(runner);
        attestation.attestRun(keccak256("s1"), 1500, 600);
        (,,, uint256 streak,,) = attestation.runnerStats(runner);
        assertEq(streak, 1);
        assertEq(attestation.effectiveCurrentStreakDays(runner), 1);

        // Idle 3 days — view decays even before next attest
        vm.warp(1_700_000_000 + 3 days);
        assertEq(attestation.effectiveCurrentStreakDays(runner), 0);

        // Sub-1 km attestation also clears stored currentStreakDays
        attestation.attestRun(keccak256("short-idle"), 500, 200);
        (,,, streak,,) = attestation.runnerStats(runner);
        assertEq(streak, 0);
        vm.stopPrank();
    }

    function testSelfAttestCanBeDisabledForTrustedAttesterMode() public {
        vm.prank(owner);
        attestation.setSelfAttestEnabled(false);

        vm.prank(runner);
        vm.expectRevert(MovrChainAttestation.SelfAttestDisabled.selector);
        attestation.attestRun(keccak256("blocked"), 1500, 600);

        vm.prank(owner);
        bytes32 hash = attestation.attestRunFor(runner, keccak256("trusted"), 1500, 600);
        (address recordedRunner,,,,,) = attestation.attestations(hash);
        assertEq(recordedRunner, runner);
    }
}
