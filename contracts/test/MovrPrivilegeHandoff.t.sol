// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {PrivilegeHandoff} from "../src/PrivilegeHandoff.sol";
import {MovrToken} from "../src/MovrToken.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {ClubBadgeNFT} from "../src/ClubBadgeNFT.sol";
import {MovrStaking} from "../src/MovrStaking.sol";
import {MovrFeed} from "../src/MovrFeed.sol";
import {MovrMilestoneReward} from "../src/MovrMilestoneReward.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {MovrClubChallenges} from "../src/MovrClubChallenges.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

/// @notice Covers Jul 18 reaudit: post-deploy privilege drain must leave Timelock as sole admin.
contract MovrPrivilegeHandoffTest is Test {
    address deployer = address(this);
    address timelockAddr;

    MovrChainAttestation attestation;
    AchievementNFT nfts;
    ClubMemberNFT memberNft;
    ClubBadgeNFT badges;
    MovrStaking staking;
    MovrFeed feed;
    MovrMilestoneReward milestone;
    MovrClubRegistry registry;
    MovrClubChallenges challenges;
    MovrToken movr;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = address(0x55);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock = new TimelockController(1 days, proposers, executors, deployer);
        timelockAddr = address(timelock);

        movr = new MovrToken(deployer);
        attestation = ProxyDeploy.attestation(deployer);
        nfts = ProxyDeploy.achievementNft(deployer, address(attestation));
        (memberNft,, registry) = ProxyDeploy.clubStack(deployer, address(movr));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));
        badges = ProxyDeploy.badgeNft(deployer, address(registry));
        staking = ProxyDeploy.staking(deployer, address(movr), address(nfts));
        feed = ProxyDeploy.feed(deployer, address(attestation));
        milestone = ProxyDeploy.milestoneReward(deployer, address(movr), address(attestation));
        challenges = ProxyDeploy.challenges(deployer, address(movr), address(registry));
    }

    function testHandoffDrainsDeployerKeepsAttesterAndRegistryMinter() public {
        assertTrue(attestation.hasRole(0x00, deployer));
        assertTrue(attestation.hasRole(attestation.ATTESTER_ROLE(), deployer));
        assertTrue(nfts.hasRole(nfts.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(nfts.hasRole(nfts.ADMIN_ROLE(), deployer));
        assertTrue(memberNft.hasRole(memberNft.MINTER_ROLE(), address(registry)));

        PrivilegeHandoff.transferOwnable(address(attestation), timelockAddr);
        PrivilegeHandoff.transferOwnable(address(feed), timelockAddr);
        PrivilegeHandoff.transferOwnable(address(registry), timelockAddr);
        PrivilegeHandoff.transferOwnable(address(challenges), timelockAddr);

        PrivilegeHandoff.handAccessAdmin(address(attestation), deployer, timelockAddr);
        PrivilegeHandoff.handAccessAdmin(address(nfts), deployer, timelockAddr);
        PrivilegeHandoff.handAccessAdmin(address(memberNft), deployer, timelockAddr);
        PrivilegeHandoff.handAccessAdmin(address(badges), deployer, timelockAddr);
        PrivilegeHandoff.handAccessAdmin(address(staking), deployer, timelockAddr);
        PrivilegeHandoff.handAccessAdmin(address(milestone), deployer, timelockAddr);

        assertEq(attestation.owner(), timelockAddr);
        assertEq(feed.owner(), timelockAddr);
        assertEq(registry.owner(), timelockAddr);
        assertEq(challenges.owner(), timelockAddr);

        assertFalse(attestation.hasRole(0x00, deployer));
        assertTrue(attestation.hasRole(0x00, timelockAddr));
        assertTrue(attestation.hasRole(attestation.ATTESTER_ROLE(), deployer));

        assertFalse(nfts.hasRole(nfts.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(nfts.hasRole(nfts.ADMIN_ROLE(), deployer));
        assertTrue(nfts.hasRole(nfts.DEFAULT_ADMIN_ROLE(), timelockAddr));
        assertTrue(nfts.hasRole(nfts.ADMIN_ROLE(), timelockAddr));

        assertFalse(memberNft.hasRole(memberNft.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(memberNft.hasRole(memberNft.MINTER_ROLE(), deployer));
        assertTrue(memberNft.hasRole(memberNft.MINTER_ROLE(), address(registry)));
        assertTrue(memberNft.hasRole(memberNft.MINTER_ROLE(), timelockAddr));

        assertFalse(badges.hasRole(badges.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(badges.hasRole(badges.ADMIN_ROLE(), deployer));
        assertTrue(badges.hasRole(badges.DEFAULT_ADMIN_ROLE(), timelockAddr));
        assertTrue(badges.hasRole(badges.ADMIN_ROLE(), timelockAddr));

        assertFalse(staking.hasRole(staking.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(staking.hasRole(staking.ADMIN_ROLE(), deployer));
        assertTrue(staking.hasRole(staking.DEFAULT_ADMIN_ROLE(), timelockAddr));

        assertFalse(milestone.hasRole(milestone.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(milestone.hasRole(milestone.ADMIN_ROLE(), deployer));
        assertTrue(milestone.hasRole(milestone.DEFAULT_ADMIN_ROLE(), timelockAddr));
    }

    function testDeployerCannotGrantRolesAfterHandoff() public {
        PrivilegeHandoff.handAccessAdmin(address(nfts), deployer, timelockAddr);

        assertFalse(nfts.hasRole(nfts.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(nfts.hasRole(nfts.ADMIN_ROLE(), deployer));

        bytes32 adminRole = nfts.ADMIN_ROLE();
        address stranger = address(0xBAD);
        vm.expectRevert();
        nfts.grantRole(adminRole, stranger);

        // Admin-gated writes must also fail for drained deployer.
        vm.expectRevert();
        nfts.createAchievement("x", "y", AchievementNFT.Criterion.SingleRunMeters, 1, 1, "ipfs://x");
    }
}
