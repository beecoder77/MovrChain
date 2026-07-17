// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MOVR — MovrChain ecosystem token
/// @notice Mintable ERC-20 with a hard max supply (1B MOVR).
contract MovrToken is ERC20, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Hard cap: 1_000_000_000 MOVR (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address owner_) ERC20("MovrChain", "MOVR") {
        require(owner_ != address(0), "owner=0");
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(ADMIN_ROLE, owner_);
    }

    /// @notice Mint MOVR — owner only, cannot exceed MAX_SUPPLY
    function mint(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "cap");
        _mint(to, amount);
    }

    function setAdmin(address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled) {
            _grantRole(ADMIN_ROLE, account);
        } else {
            _revokeRole(ADMIN_ROLE, account);
        }
    }
}
