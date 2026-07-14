// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {MovrFeed} from "../src/MovrFeed.sol";

contract MovrFeedTest is Test {
    MovrChainAttestation attestation;
    MovrFeed feed;

    address runner = address(0xB0B);
    address other = address(0xC0C);

    function setUp() public {
        attestation = new MovrChainAttestation();
        feed = new MovrFeed(address(attestation));
    }

    function testPublishAddsCommunityAndPersonal() public {
        bytes32 hash = keccak256("run-1");
        vm.prank(runner);
        attestation.attestRun(hash, 2500, 800);

        vm.prank(runner);
        uint256 id = feed.publish(hash, "Morning Loop");
        assertEq(id, 0);
        assertTrue(feed.published(hash));
        assertEq(feed.postCount(), 1);
        assertEq(feed.runnerPostCount(runner), 1);

        (
            bytes32 rh,
            address r,
            uint256 dist,
            ,
            ,
            string memory name
        ) = feed.getPost(0);
        assertEq(rh, hash);
        assertEq(r, runner);
        assertEq(dist, 2500);
        assertEq(name, "Morning Loop");

        uint256[] memory latest = feed.latestPostIds(5);
        assertEq(latest.length, 1);
        assertEq(latest[0], 0);

        uint256[] memory mine = feed.getRunnerPostIds(runner);
        assertEq(mine.length, 1);
        assertEq(mine[0], 0);
    }

    function testCannotPublishTwiceOrOthersRun() public {
        bytes32 hash = keccak256("run-2");
        vm.prank(runner);
        attestation.attestRun(hash, 1200, 400);

        vm.prank(other);
        vm.expectRevert(bytes("not runner"));
        feed.publish(hash, "Stolen");

        vm.prank(runner);
        feed.publish(hash, "Mine");
        vm.prank(runner);
        vm.expectRevert(bytes("already published"));
        feed.publish(hash, "Again");
    }
}
