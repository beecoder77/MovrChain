// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";

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
        attestation = new MovrChainAttestation();
        nfts = new AchievementNFT(owner, address(attestation));
        staking = new MovrStaking(owner, address(movr), address(nfts));

        nfts.createAchievement(
            "First Kilometer",
            "1km single run",
            AchievementNFT.Criterion.SingleRunMeters,
            1000,
            500,
            "ipfs://1k"
        );

        movr.mint(owner, 100_000 ether);
        movr.approve(address(staking), 50_000 ether);
        staking.fundRewards(50_000 ether);
        movr.mint(runner, 1_000 ether);
        vm.stopPrank();
    }

    function testAttestAndClaim() public {
        vm.startPrank(runner);
        bytes32 hash = keccak256("run-1");
        attestation.attestRun(hash, 5200, 1800);
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
        attestation.attestRun(keccak256("run-2"), 1500, 600);
        nfts.claimAchievement(1);

        movr.approve(address(staking), 100 ether);
        staking.stake(100 ether);

        vm.warp(block.timestamp + 1 days);
        uint256 pending = staking.pendingReward(runner);
        assertGt(pending, 0);
        staking.claim();
        vm.stopPrank();
    }
}
