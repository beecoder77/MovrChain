// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

import {MovrToken} from "../src/MovrToken.sol";
import {ClubMemberNFT} from "../src/ClubMemberNFT.sol";
import {MovrClubRegistry} from "../src/MovrClubRegistry.sol";
import {ClubTreasury} from "../src/ClubTreasury.sol";
import {ProxyDeploy} from "./helpers/ProxyDeploy.sol";

/// @dev Adds a version marker used to prove beacon upgrades hit all club treasuries.
contract ClubTreasuryV2 is ClubTreasury {
    function version() external pure returns (string memory) {
        return "treasury-v2";
    }
}

contract ClubTreasuryBeaconTest is Test {
    MovrToken movr;
    ClubMemberNFT memberNft;
    UpgradeableBeacon beacon;
    MovrClubRegistry registry;

    address creator1 = address(0xC1);
    address creator2 = address(0xC2);
    address alice = address(0xA1);

    function setUp() public {
        movr = new MovrToken(address(this));
        (memberNft, beacon, registry) = ProxyDeploy.clubStack(address(this), address(movr));
        memberNft.grantRole(memberNft.MINTER_ROLE(), address(registry));

        movr.mint(alice, 1_000 ether);
    }

    function testTwoClubsShareBeaconAndUpgradeTogether() public {
        vm.prank(creator1);
        (uint256 club1, address treasury1) = registry.createClub("Alpha", true);
        vm.prank(creator2);
        (uint256 club2, address treasury2) = registry.createClub("Beta", true);

        assertTrue(treasury1 != treasury2);
        assertEq(club1, 1);
        assertEq(club2, 2);

        // Fund both treasuries via donate
        vm.startPrank(creator1);
        registry.addMember(club1, alice);
        vm.stopPrank();

        vm.startPrank(alice);
        movr.approve(treasury1, 100 ether);
        ClubTreasury(treasury1).donate(100 ether);
        // Alice can only be in one club — leave and join club2
        registry.leaveClub(club1);
        vm.stopPrank();

        vm.prank(creator2);
        registry.addMember(club2, alice);

        vm.startPrank(alice);
        movr.approve(treasury2, 50 ether);
        ClubTreasury(treasury2).donate(50 ether);
        vm.stopPrank();

        assertEq(ClubTreasury(treasury1).balance(), 100 ether);
        assertEq(ClubTreasury(treasury2).balance(), 50 ether);

        // Upgrade beacon once
        ClubTreasuryV2 v2 = new ClubTreasuryV2();
        beacon.upgradeTo(address(v2));

        // Both treasuries pick up new logic; balances intact
        assertEq(ClubTreasuryV2(treasury1).version(), "treasury-v2");
        assertEq(ClubTreasuryV2(treasury2).version(), "treasury-v2");
        assertEq(ClubTreasury(treasury1).balance(), 100 ether);
        assertEq(ClubTreasury(treasury2).balance(), 50 ether);
    }

    function testNonOwnerCannotUpgradeBeacon() public {
        ClubTreasuryV2 v2 = new ClubTreasuryV2();
        vm.prank(alice);
        vm.expectRevert();
        beacon.upgradeTo(address(v2));
    }
}
