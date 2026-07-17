// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

import {MovrChainAttestation} from "../../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../../src/AchievementNFT.sol";
import {MovrStaking} from "../../src/MovrStaking.sol";
import {MovrFeed} from "../../src/MovrFeed.sol";
import {MovrMilestoneReward} from "../../src/MovrMilestoneReward.sol";
import {ClubMemberNFT} from "../../src/ClubMemberNFT.sol";
import {ClubBadgeNFT} from "../../src/ClubBadgeNFT.sol";
import {ClubTreasury} from "../../src/ClubTreasury.sol";
import {MovrClubRegistry} from "../../src/MovrClubRegistry.sol";
import {MovrClubChallenges} from "../../src/MovrClubChallenges.sol";

/// @dev Shared proxy deploy helpers for Foundry tests.
library ProxyDeploy {
    function deployUUPS(address impl, bytes memory initData) internal returns (address proxy) {
        proxy = address(new ERC1967Proxy(impl, initData));
    }

    function attestation(address owner_) internal returns (MovrChainAttestation) {
        MovrChainAttestation impl = new MovrChainAttestation();
        return
            MovrChainAttestation(deployUUPS(address(impl), abi.encodeCall(MovrChainAttestation.initialize, (owner_))));
    }

    function achievementNft(address owner_, address attestation_) internal returns (AchievementNFT) {
        AchievementNFT impl = new AchievementNFT();
        return
            AchievementNFT(deployUUPS(address(impl), abi.encodeCall(AchievementNFT.initialize, (owner_, attestation_))));
    }

    function staking(address owner_, address movr_, address achievements_) internal returns (MovrStaking) {
        MovrStaking impl = new MovrStaking();
        return MovrStaking(
            deployUUPS(address(impl), abi.encodeCall(MovrStaking.initialize, (owner_, movr_, achievements_)))
        );
    }

    function feed(address owner_, address attestation_) internal returns (MovrFeed) {
        MovrFeed impl = new MovrFeed();
        return MovrFeed(deployUUPS(address(impl), abi.encodeCall(MovrFeed.initialize, (owner_, attestation_))));
    }

    function milestoneReward(address owner_, address movr_, address attestation_)
        internal
        returns (MovrMilestoneReward)
    {
        MovrMilestoneReward impl = new MovrMilestoneReward();
        return MovrMilestoneReward(
            deployUUPS(address(impl), abi.encodeCall(MovrMilestoneReward.initialize, (owner_, movr_, attestation_)))
        );
    }

    function memberNft(address admin_) internal returns (ClubMemberNFT) {
        ClubMemberNFT impl = new ClubMemberNFT();
        return ClubMemberNFT(deployUUPS(address(impl), abi.encodeCall(ClubMemberNFT.initialize, (admin_))));
    }

    function badgeNft(address admin_, address registry_) internal returns (ClubBadgeNFT) {
        ClubBadgeNFT impl = new ClubBadgeNFT();
        return ClubBadgeNFT(deployUUPS(address(impl), abi.encodeCall(ClubBadgeNFT.initialize, (admin_, registry_))));
    }

    function challenges(address owner_, address movr_, address registry_) internal returns (MovrClubChallenges) {
        MovrClubChallenges impl = new MovrClubChallenges();
        return MovrClubChallenges(
            deployUUPS(address(impl), abi.encodeCall(MovrClubChallenges.initialize, (owner_, movr_, registry_)))
        );
    }

    /// @notice Deploy treasury impl + beacon + registry proxy. Caller must grant MINTER_ROLE to registry.
    function clubStack(address owner_, address movr_)
        internal
        returns (ClubMemberNFT member, UpgradeableBeacon beacon, MovrClubRegistry registry)
    {
        member = memberNft(owner_);
        ClubTreasury treasuryImpl = new ClubTreasury();
        beacon = new UpgradeableBeacon(address(treasuryImpl), owner_);
        MovrClubRegistry regImpl = new MovrClubRegistry();
        registry = MovrClubRegistry(
            deployUUPS(
                address(regImpl),
                abi.encodeCall(MovrClubRegistry.initialize, (owner_, movr_, address(member), address(beacon)))
            )
        );
    }
}
