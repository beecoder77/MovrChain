// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MovrProfile — on-chain runner identity (name, bio, athletic avatar)
/// @notice Free to set (gas only). Avatars are off-chain assets keyed by avatarId 0–19.
contract MovrProfile {
    uint8 public constant AVATAR_COUNT = 20;
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_BIO_BYTES = 160;

    struct Profile {
        string name;
        string bio;
        uint8 avatarId;
        uint64 updatedAt;
    }

    mapping(address => Profile) private _profiles;

    event ProfileUpdated(
        address indexed account, string name, uint8 avatarId, uint64 updatedAt
    );

    function setProfile(string calldata name, string calldata bio, uint8 avatarId) external {
        require(avatarId < AVATAR_COUNT, "avatar");
        bytes memory nameBytes = bytes(name);
        bytes memory bioBytes = bytes(bio);
        require(nameBytes.length > 0 && nameBytes.length <= MAX_NAME_BYTES, "name");
        require(bioBytes.length <= MAX_BIO_BYTES, "bio");

        uint64 ts = uint64(block.timestamp);
        _profiles[msg.sender] = Profile({
            name: name,
            bio: bio,
            avatarId: avatarId,
            updatedAt: ts
        });

        emit ProfileUpdated(msg.sender, name, avatarId, ts);
    }

    function getProfile(address account)
        external
        view
        returns (string memory name, string memory bio, uint8 avatarId, uint64 updatedAt, bool exists)
    {
        Profile memory p = _profiles[account];
        return (p.name, p.bio, p.avatarId, p.updatedAt, p.updatedAt != 0);
    }

    function avatarOf(address account) external view returns (uint8) {
        return _profiles[account].avatarId;
    }
}
