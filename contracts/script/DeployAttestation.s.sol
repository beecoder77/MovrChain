// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MovrChainAttestation} from "../src/MovrChainAttestation.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";

/// @dev Partial UUPS deploy. Prefer `DeployUpgradeableStack` for full governance wiring.
contract DeployAttestation is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        vm.startBroadcast(pk);
        MovrChainAttestation attestation = MovrChainAttestation(
            address(
                new ERC1967Proxy(
                    address(new MovrChainAttestation()), abi.encodeCall(MovrChainAttestation.initialize, (deployer))
                )
            )
        );
        AchievementNFT nfts = AchievementNFT(
            address(
                new ERC1967Proxy(
                    address(new AchievementNFT()),
                    abi.encodeCall(AchievementNFT.initialize, (deployer, address(attestation)))
                )
            )
        );
        if (admin != deployer) nfts.setAdmin(admin, true);
        vm.stopBroadcast();

        console2.log("ATTESTATION=", address(attestation));
        console2.log("ACHIEVEMENT_NFT=", address(nfts));
        console2.log("NOTE: use DeployUpgradeableStack for Timelock/Multisig ownership.");
    }
}
