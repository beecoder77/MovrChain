// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MovrChainAttestation} from "./MovrChainAttestation.sol";

/// @title MovrFeed — community + per-wallet run timeline
/// @notice Runner publishes after attestRun. Community is global; personal list is keyed by address.
contract MovrFeed {
    uint256 public constant MAX_NAME_BYTES = 64;

    struct Post {
        bytes32 runHash;
        address runner;
        uint256 distanceMeters;
        uint256 durationSeconds;
        uint64 postedAt;
        string runName;
    }

    MovrChainAttestation public immutable attestation;

    Post[] private _posts;
    mapping(bytes32 => bool) public published;
    mapping(address => uint256[]) private _runnerPostIds;

    event RunPublished(
        uint256 indexed postId,
        bytes32 indexed runHash,
        address indexed runner,
        uint256 distanceMeters,
        string runName
    );

    constructor(address attestation_) {
        require(attestation_ != address(0), "zero");
        attestation = MovrChainAttestation(attestation_);
    }

    /// @notice Publish an attested run to community + your address feed
    function publish(bytes32 runHash, string calldata runName) external returns (uint256 postId) {
        require(!published[runHash], "already published");
        require(bytes(runName).length > 0 && bytes(runName).length <= MAX_NAME_BYTES, "name");

        (
            address runner,
            uint256 distanceMeters,
            uint256 durationSeconds,
            ,
            ,
        ) = attestation.attestations(runHash);

        require(runner == msg.sender, "not runner");
        require(distanceMeters > 0, "no attestation");

        postId = _posts.length;
        _posts.push(
            Post({
                runHash: runHash,
                runner: msg.sender,
                distanceMeters: distanceMeters,
                durationSeconds: durationSeconds,
                postedAt: uint64(block.timestamp),
                runName: runName
            })
        );
        published[runHash] = true;
        _runnerPostIds[msg.sender].push(postId);

        emit RunPublished(postId, runHash, msg.sender, distanceMeters, runName);
    }

    function postCount() external view returns (uint256) {
        return _posts.length;
    }

    function getPost(uint256 postId)
        external
        view
        returns (
            bytes32 runHash,
            address runner,
            uint256 distanceMeters,
            uint256 durationSeconds,
            uint64 postedAt,
            string memory runName
        )
    {
        require(postId < _posts.length, "id");
        Post storage p = _posts[postId];
        return (p.runHash, p.runner, p.distanceMeters, p.durationSeconds, p.postedAt, p.runName);
    }

    function runnerPostCount(address account) external view returns (uint256) {
        return _runnerPostIds[account].length;
    }

    function getRunnerPostId(address account, uint256 index) external view returns (uint256) {
        require(index < _runnerPostIds[account].length, "index");
        return _runnerPostIds[account][index];
    }

    function getRunnerPostIds(address account) external view returns (uint256[] memory) {
        return _runnerPostIds[account];
    }

    /// @notice Newest-first community post ids, up to `limit`
    function latestPostIds(uint256 limit) external view returns (uint256[] memory ids) {
        uint256 n = _posts.length;
        if (limit > n) limit = n;
        ids = new uint256[](limit);
        for (uint256 i = 0; i < limit; i++) {
            ids[i] = n - 1 - i;
        }
    }
}
