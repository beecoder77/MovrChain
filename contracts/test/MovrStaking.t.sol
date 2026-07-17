// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

contract MovrStakingTest is Test {
    MovrToken movr;
    MovrChainAttestation attestation;
    AchievementNFT nfts;
    MovrStaking staking;
    ClubMemberNFT memberNft;
    ClubBadgeNFT clubBadges;
    MovrClubRegistry registry;

    address owner = address(0xA11CE);
    address runner = address(0xB0B);

    function setUp() public {
        vm.startPrank(owner);
        movr = new MovrToken(owner);
        attestation = ProxyDeploy.attestation(owner);
        nfts = ProxyDeploy.achievementNft(owner, address(attestation));
        staking = ProxyDeploy.staking(owner, address(movr), address(nfts));
        (memberNft,, registry) = ProxyDeploy.clubStack(owner, address(movr));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        clubBadges = ProxyDeploy.badgeNft(owner, address(registry));
        registry.setStaking(address(staking));
        staking.setClubRegistry(address(registry));
        staking.setClubBadges(address(clubBadges));

        nfts.createAchievement(
            "First Kilometer", "1km", AchievementNFT.Criterion.SingleRunMeters, 1000, 500, "ipfs://1k"
        );

        movr.mint(owner, 100_000 ether);
        movr.approve(address(staking), 50_000 ether);
        staking.fundRewards(50_000 ether);
        movr.mint(runner, 1_000 ether);
        vm.stopPrank();
    }

    function testUnstakePartialAndFull() public {
        vm.startPrank(runner);
        movr.approve(address(staking), 100 ether);
        staking.stake(100 ether);

        staking.unstake(40 ether);
        (uint256 amount,,,) = staking.stakes(runner);
        assertEq(amount, 60 ether);
        assertEq(movr.balanceOf(runner), 940 ether);

        staking.unstake(60 ether);
        (amount,,,) = staking.stakes(runner);
        assertEq(amount, 0);
        assertEq(staking.totalStaked(), 0);
        vm.stopPrank();
    }

    function testDonateBpsBoundsRequireClub() public {
        vm.prank(runner);
        vm.expectRevert(bytes("bps"));
        staking.setDonateBps(100);

        vm.prank(runner);
        vm.expectRevert(bytes("no club"));
        staking.setDonateBps(300);

        vm.prank(runner);
        registry.createClub("Stake Club", true);

        vm.prank(runner);
        staking.setDonateBps(300);
        assertEq(staking.donateBps(runner), 300);

        vm.prank(runner);
        staking.setDonateBps(0);
        assertEq(staking.donateBps(runner), 0);
    }

    function testClaimDonatesToClubTreasury() public {
        vm.prank(runner);
        (, address treasury) = registry.createClub("Yield", true);

        vm.startPrank(runner);
        attestation.attestRun(keccak256("boost"), 1500, 600);
        nfts.claimAchievement(1);
        staking.setDonateBps(500); // 5%
        movr.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.warp(block.timestamp + 1 days);
        uint256 pending = staking.pendingReward(runner);
        assertGt(pending, 0);
        uint256 expectedDonate = (pending * 500) / 10_000;
        uint256 treasuryBefore = movr.balanceOf(treasury);
        staking.claim();
        assertEq(movr.balanceOf(treasury), treasuryBefore + expectedDonate);
        assertEq(ClubTreasury(treasury).lifetimeDonated(runner), expectedDonate);
        vm.stopPrank();
    }

    function testConfigureRates() public {
        vm.prank(owner);
        staking.configureRates(1e9, 5_000, 100, false);
        assertEq(staking.rewardPerTokenPerSecond(), 1e9);
        assertEq(staking.maxBoostBps(), 5_000);
        assertEq(staking.baseAchievementBoostBps(), 100);
        assertFalse(staking.useDefBoost());
    }

    function testConfigureRatesNotRetroactive() public {
        vm.startPrank(runner);
        movr.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        // Accrue 1 day at default rate
        vm.warp(block.timestamp + 1 days);
        uint256 pendingBefore = staking.pendingReward(runner);

        // Slash rate to near-zero — pending for the elapsed window must stay the same
        vm.prank(owner);
        staking.configureRates(1, 5_000, 100, true);
        assertEq(staking.pendingReward(runner), pendingBefore);

        // After harvest, new rate applies to next interval only
        vm.prank(runner);
        staking.claim();
        vm.warp(block.timestamp + 1 days);
        assertLt(staking.pendingReward(runner), pendingBefore / 100);
    }

    function testClubBadgeBoostIsIncluded() public {
        vm.prank(runner);
        registry.createClub("Badge Club", true);

        vm.prank(runner);
        clubBadges.claim(uint8(ClubBadgeNFT.Badge.JoinClub));

        assertEq(clubBadges.accountBoostBps(runner), 200);
        assertEq(staking.boostBpsOf(runner), 200);
    }

    function testClaimRevertsWhenRewardReserveEmpty() public {
        vm.startPrank(owner);
        MovrStaking emptyStaking = ProxyDeploy.staking(owner, address(movr), address(nfts));
        vm.stopPrank();

        vm.startPrank(runner);
        movr.approve(address(emptyStaking), 50 ether);
        emptyStaking.stake(50 ether);
        vm.warp(block.timestamp + 1 days);
        assertGt(emptyStaking.pendingReward(runner), 0);
        vm.expectRevert(bytes("insufficient rewards"));
        emptyStaking.claim();
        vm.stopPrank();
    }
}
