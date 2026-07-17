// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

contract AchievementNFTTest is Test {
    MovrChainAttestation attestation;
    AchievementNFT nfts;

    address owner = address(0xA11CE);
    address runner = address(0xB0B);
    address buyer = address(0xC0C);

    uint256 singleId;
    uint256 totalId;
    uint256 streakId;

    function setUp() public {
        vm.startPrank(owner);
        attestation = ProxyDeploy.attestation(owner);
        nfts = ProxyDeploy.achievementNft(owner, address(attestation));
        singleId =
            nfts.createAchievement("1K", "single", AchievementNFT.Criterion.SingleRunMeters, 1000, 500, "ipfs://1k");
        totalId = nfts.createAchievement(
            "10K Total", "sum", AchievementNFT.Criterion.TotalDistanceMeters, 10_000, 300, "ipfs://10k"
        );
        streakId =
            nfts.createAchievement("3-Day", "streak", AchievementNFT.Criterion.StreakDays, 3, 200, "ipfs://streak");
        vm.stopPrank();
    }

    function testDoubleClaimRejected() public {
        vm.prank(runner);
        attestation.attestRun(keccak256("a"), 1500, 600);
        vm.prank(runner);
        nfts.claimAchievement(singleId);
        vm.prank(runner);
        vm.expectRevert(bytes("not eligible"));
        nfts.claimAchievement(singleId);
    }

    function testTotalDistanceCriterion() public {
        vm.startPrank(runner);
        attestation.attestRun(keccak256("t1"), 6000, 2000);
        attestation.attestRun(keccak256("t2"), 5000, 1800);
        assertTrue(nfts.eligible(runner, totalId));
        nfts.claimAchievement(totalId);
        vm.stopPrank();
    }

    function testStreakCriterion() public {
        // Absolute warps avoid via_ir CSE quirks around block.timestamp locals.
        vm.warp(1_700_000_000);
        vm.startPrank(runner);
        attestation.attestRun(keccak256("d1"), 1500, 600);
        vm.warp(1_700_000_000 + 1 days);
        attestation.attestRun(keccak256("d2"), 1500, 600);
        vm.warp(1_700_000_000 + 2 days);
        attestation.attestRun(keccak256("d3"), 1500, 600);
        (,,, uint256 streak, uint256 longest,) = attestation.runnerStats(runner);
        assertEq(streak, 3);
        assertEq(longest, 3);
        assertTrue(nfts.eligible(runner, streakId));
        nfts.claimAchievement(streakId);
        vm.stopPrank();
    }

    /// @notice Idle decay zeros effective streak — NFT must not stay claimable on storage/longest alone.
    function testStreakIneligibleAfterIdleDecay() public {
        vm.warp(1_700_000_000);
        vm.startPrank(runner);
        attestation.attestRun(keccak256("s1"), 1500, 600);
        vm.warp(1_700_000_000 + 1 days);
        attestation.attestRun(keccak256("s2"), 1500, 600);
        vm.warp(1_700_000_000 + 2 days);
        attestation.attestRun(keccak256("s3"), 1500, 600);
        assertTrue(nfts.eligible(runner, streakId));
        vm.stopPrank();

        // Skip >1 day without a qualifying run → effective streak decays to 0.
        vm.warp(1_700_000_000 + 5 days);
        assertEq(attestation.effectiveCurrentStreakDays(runner), 0);
        (,,, uint256 stored, uint256 longest,) = attestation.runnerStats(runner);
        assertEq(stored, 3); // storage unchanged until next attest
        assertEq(longest, 3);
        assertFalse(nfts.eligible(runner, streakId));

        vm.prank(runner);
        vm.expectRevert(bytes("not eligible"));
        nfts.claimAchievement(streakId);
    }

    function testBoostSnapshottedAgainstAdminEdit() public {
        vm.prank(runner);
        attestation.attestRun(keccak256("boost"), 1500, 600);
        vm.prank(runner);
        uint256 tokenId = nfts.claimAchievement(singleId);
        assertEq(nfts.accountBoostBps(runner), 500);
        assertEq(nfts.tokenBoostBps(tokenId), 500);

        // Admin raises definition boost — minted token keeps snapshot.
        vm.prank(owner);
        nfts.setAchievementBoost(singleId, 2_000);
        assertEq(nfts.tokenBoostBps(tokenId), 500);
        assertEq(nfts.accountBoostBps(runner), 500);

        // Transfer still uses snapshot (no underflow if definition rose).
        vm.prank(runner);
        nfts.transferFrom(runner, buyer, tokenId);
        assertEq(nfts.accountBoostBps(runner), 0);
        assertEq(nfts.accountBoostBps(buyer), 500);
    }

    function testMarketplaceListBuyUnlist() public {
        vm.prank(runner);
        attestation.attestRun(keccak256("m"), 1500, 600);
        vm.prank(runner);
        uint256 tokenId = nfts.claimAchievement(singleId);

        vm.prank(runner);
        nfts.listNFT(tokenId, 1 ether);

        vm.prank(runner);
        nfts.unlistNFT(tokenId);

        vm.prank(runner);
        nfts.listNFT(tokenId, 1 ether);

        uint256 sellerBefore = runner.balance;
        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        nfts.buyNFT{value: 1.5 ether}(tokenId);

        assertEq(nfts.ownerOf(tokenId), buyer);
        assertEq(runner.balance, sellerBefore + 1 ether);
        // Buyer started with 2 ether, paid 1 ether net (1.5 sent, 0.5 refunded) → 1 ether left.
        assertEq(buyer.balance, 1 ether);
    }

    function testInactiveNotClaimable() public {
        vm.prank(runner);
        attestation.attestRun(keccak256("x"), 1500, 600);
        vm.prank(owner);
        nfts.setAchievementActive(singleId, false);
        vm.prank(runner);
        vm.expectRevert(bytes("not eligible"));
        nfts.claimAchievement(singleId);
    }

    function testBuyNFTReentrancyGuard() public {
        vm.prank(runner);
        attestation.attestRun(keccak256("re"), 1500, 600);
        vm.prank(runner);
        uint256 tokenId = nfts.claimAchievement(singleId);

        MaliciousSeller seller = new MaliciousSeller(nfts);
        vm.prank(runner);
        nfts.transferFrom(runner, address(seller), tokenId);

        vm.prank(address(seller));
        nfts.listNFT(tokenId, 1 ether);
        seller.arm(tokenId);

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        vm.expectRevert();
        nfts.buyNFT{value: 1 ether}(tokenId);
    }
}

/// @dev Reenters `buyNFT` from `receive` when paid as listing seller.
contract MaliciousSeller {
    AchievementNFT public immutable nfts;
    uint256 public tokenId;
    bool public armed;

    constructor(AchievementNFT nfts_) {
        nfts = nfts_;
    }

    function arm(uint256 tokenId_) external {
        tokenId = tokenId_;
        armed = true;
    }

    receive() external payable {
        if (armed) {
            armed = false;
            nfts.buyNFT{value: 0}(tokenId);
        }
    }
}
