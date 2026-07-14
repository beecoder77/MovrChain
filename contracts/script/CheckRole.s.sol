// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice Read-only check: whether an address is DEFAULT_ADMIN and/or ADMIN on Movr contracts.
///
/// Env:
///   CHECK_ADDRESS   — wallet to inspect (required)
///   MOVR_TOKEN      — MovrToken address (optional)
///   ACHIEVEMENT_NFT — AchievementNFT address (optional)
///   STAKING         — MovrStaking address (optional)
///
/// Example:
///   CHECK_ADDRESS=0x... MOVR_TOKEN=0x... forge script script/CheckRole.s.sol -vvv
contract CheckRole is Script {
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    function run() external view {
        address account = vm.envAddress("CHECK_ADDRESS");

        console2.log("================================================");
        console2.log("Role check for:", account);
        console2.log("================================================");

        bool anyContract = false;
        bool isAdminAnywhere = false;
        bool isOwnerAnywhere = false;

        if (_hasEnv("MOVR_TOKEN")) {
            anyContract = true;
            (bool owner, bool admin) = _check("MovrToken", vm.envAddress("MOVR_TOKEN"), account);
            isOwnerAnywhere = isOwnerAnywhere || owner;
            isAdminAnywhere = isAdminAnywhere || admin;
        }

        if (_hasEnv("ACHIEVEMENT_NFT")) {
            anyContract = true;
            (bool owner, bool admin) = _check("AchievementNFT", vm.envAddress("ACHIEVEMENT_NFT"), account);
            isOwnerAnywhere = isOwnerAnywhere || owner;
            isAdminAnywhere = isAdminAnywhere || admin;
        }

        if (_hasEnv("STAKING")) {
            anyContract = true;
            (bool owner, bool admin) = _check("MovrStaking", vm.envAddress("STAKING"), account);
            isOwnerAnywhere = isOwnerAnywhere || owner;
            isAdminAnywhere = isAdminAnywhere || admin;
        }

        if (!anyContract) {
            console2.log("No contract addresses set.");
            console2.log("Set MOVR_TOKEN / ACHIEVEMENT_NFT / STAKING in .env");
            return;
        }

        console2.log("------------------------------------------------");
        console2.log("Summary");
        console2.log("  is DEFAULT_ADMIN (owner) anywhere:", isOwnerAnywhere);
        console2.log("  is ADMIN_ROLE anywhere:           ", isAdminAnywhere);
        if (isOwnerAnywhere) {
            console2.log("  => OWNER (pembuat kontrak / super-admin)");
        } else if (isAdminAnywhere) {
            console2.log("  => ADMIN");
        } else {
            console2.log("  => neither owner nor admin (regular wallet)");
        }
        console2.log("================================================");
    }

    function _check(string memory label, address target, address account)
        internal
        view
        returns (bool isOwner, bool isAdmin)
    {
        IAccessControl ac = IAccessControl(target);
        isOwner = ac.hasRole(DEFAULT_ADMIN_ROLE, account);
        isAdmin = ac.hasRole(ADMIN_ROLE, account);

        console2.log("");
        console2.log(label);
        console2.log("  contract:", target);
        console2.log("  DEFAULT_ADMIN_ROLE:", isOwner);
        console2.log("  ADMIN_ROLE:        ", isAdmin);

        if (isOwner) {
            console2.log("  status: OWNER");
        } else if (isAdmin) {
            console2.log("  status: ADMIN");
        } else {
            console2.log("  status: neither");
        }
    }

    function _hasEnv(string memory key) internal view returns (bool) {
        try vm.envAddress(key) returns (address addr) {
            return addr != address(0);
        } catch {
            return false;
        }
    }
}
