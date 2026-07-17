// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MovrProfile — on-chain runner identity (unique handle, name, bio, avatar)
/// @notice Free to set (gas only). Only msg.sender can write their own profile.
/// @dev Handles are unique case-insensitively; stored lowercase [a-z0-9_], 3–16 chars.
contract MovrProfile {
    uint8 public constant AVATAR_COUNT = 20;
    uint256 public constant MAX_NAME_BYTES = 32;
    uint256 public constant MAX_BIO_BYTES = 160;
    uint256 public constant MIN_HANDLE_BYTES = 3;
    uint256 public constant MAX_HANDLE_BYTES = 16;

    struct Profile {
        string handle;
        string name;
        string bio;
        uint8 avatarId;
        uint64 updatedAt;
    }

    mapping(address => Profile) private _profiles;
    /// @dev keccak256(bytes(lowercaseHandle)) => owner
    mapping(bytes32 => address) private _handleOwner;

    event ProfileUpdated(address indexed account, string handle, string name, uint8 avatarId, uint64 updatedAt);

    /// @notice Create or update the caller's profile. Handle must be unique.
    function setProfile(string calldata handle, string calldata name, string calldata bio, uint8 avatarId) external {
        require(avatarId < AVATAR_COUNT, "avatar");
        bytes memory nameBytes = bytes(name);
        bytes memory bioBytes = bytes(bio);
        require(nameBytes.length > 0 && nameBytes.length <= MAX_NAME_BYTES, "name");
        require(bioBytes.length <= MAX_BIO_BYTES, "bio");

        string memory normalized = _normalizeHandle(handle);
        bytes32 key = keccak256(bytes(normalized));

        address owner = _handleOwner[key];
        require(owner == address(0) || owner == msg.sender, "handle taken");

        Profile storage p = _profiles[msg.sender];
        if (bytes(p.handle).length > 0) {
            bytes32 oldKey = keccak256(bytes(p.handle));
            if (oldKey != key) {
                delete _handleOwner[oldKey];
            }
        }

        _handleOwner[key] = msg.sender;
        uint64 ts = uint64(block.timestamp);
        p.handle = normalized;
        p.name = name;
        p.bio = bio;
        p.avatarId = avatarId;
        p.updatedAt = ts;

        emit ProfileUpdated(msg.sender, normalized, name, avatarId, ts);
    }

    function getProfile(address account)
        external
        view
        returns (
            string memory handle,
            string memory name,
            string memory bio,
            uint8 avatarId,
            uint64 updatedAt,
            bool exists
        )
    {
        Profile memory p = _profiles[account];
        return (p.handle, p.name, p.bio, p.avatarId, p.updatedAt, p.updatedAt != 0);
    }

    /// @notice Resolve a handle (any casing) to its owning wallet, or address(0).
    function resolveHandle(string calldata handle) external view returns (address) {
        (bool ok, string memory normalized) = _tryNormalizeHandle(handle);
        if (!ok) return address(0);
        return _handleOwner[keccak256(bytes(normalized))];
    }

    function handleOf(address account) external view returns (string memory) {
        return _profiles[account].handle;
    }

    /// @notice True if no one owns this handle (invalid handles return false).
    function isHandleAvailable(string calldata handle) external view returns (bool) {
        (bool ok, string memory normalized) = _tryNormalizeHandle(handle);
        if (!ok) return false;
        return _handleOwner[keccak256(bytes(normalized))] == address(0);
    }

    function avatarOf(address account) external view returns (uint8) {
        return _profiles[account].avatarId;
    }

    function _normalizeHandle(string calldata handle) private pure returns (string memory) {
        (bool ok, string memory normalized) = _tryNormalizeHandle(handle);
        require(ok, "handle");
        return normalized;
    }

    function _tryNormalizeHandle(string calldata handle) private pure returns (bool ok, string memory normalized) {
        bytes memory raw = bytes(handle);
        uint256 len = raw.length;
        if (len < MIN_HANDLE_BYTES || len > MAX_HANDLE_BYTES) {
            return (false, "");
        }

        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = raw[i];
            if (c >= 0x41 && c <= 0x5A) {
                // A-Z → a-z
                out[i] = bytes1(uint8(c) + 32);
            } else if ((c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) || c == 0x5F) {
                // a-z, 0-9, _
                out[i] = c;
            } else {
                return (false, "");
            }
        }

        // First character must be a letter after lowercasing
        bytes1 first = out[0];
        if (first < 0x61 || first > 0x7A) {
            return (false, "");
        }

        return (true, string(out));
    }
}
