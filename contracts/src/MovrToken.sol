// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MOVR — MovrChain ecosystem token
/// @notice Mintable ERC-20. Contract owner (DEFAULT_ADMIN) can mint and assign ADMIN_ROLE.
contract MovrToken is ERC20, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    constructor(address owner_) ERC20("MovrChain", "MOVR") {
        require(owner_ != address(0), "owner=0");
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
    }

    /// @notice Mint MOVR — owner only
    function mint(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mint(to, amount);
    }

    /// @notice Assign or revoke ADMIN_ROLE
    function setAdmin(address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled) {
            _grantRole(ADMIN_ROLE, account);
        } else {
            _revokeRole(ADMIN_ROLE, account);
        }
    }
}
