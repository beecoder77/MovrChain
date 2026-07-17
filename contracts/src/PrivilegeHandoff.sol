// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared Ownable / AccessControl handoff used by deploy scripts and Foundry tests.
/// @dev Does not touch ATTESTER_ROLE — operational attesters stay on the deploy key until
///      Timelock rotates them via `setAttester`.
library PrivilegeHandoff {
    function transferOwnable(address target, address newOwner) internal {
        (bool ok,) = target.call(abi.encodeWithSignature("transferOwnership(address)", newOwner));
        require(ok, "ownable");
    }

    /// @dev Grant `to` DEFAULT_ADMIN (+ ADMIN / MINTER when present), then renounce those from `from`.
    ///      Caller must be `from` (AccessControl.renounceRole requires msg.sender == account).
    function handAccessAdmin(address target, address from, address to) internal {
        bytes32 defaultAdmin = 0x00;
        (bool ok1,) = target.call(abi.encodeWithSignature("grantRole(bytes32,address)", defaultAdmin, to));
        require(ok1, "grant admin");

        bytes32 adminRole = keccak256("ADMIN_ROLE");
        bytes32 minterRole = keccak256("MINTER_ROLE");

        (bool gAdmin,) = target.call(abi.encodeWithSignature("grantRole(bytes32,address)", adminRole, to));
        (bool gMinter,) = target.call(abi.encodeWithSignature("grantRole(bytes32,address)", minterRole, to));
        gAdmin;
        gMinter;

        (bool rAdmin,) = target.call(abi.encodeWithSignature("renounceRole(bytes32,address)", adminRole, from));
        (bool rMinter,) = target.call(abi.encodeWithSignature("renounceRole(bytes32,address)", minterRole, from));
        rAdmin;
        rMinter;

        (bool ok2,) = target.call(abi.encodeWithSignature("renounceRole(bytes32,address)", defaultAdmin, from));
        require(ok2, "renounce");
    }
}
