// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AchievementNFT} from "../src/AchievementNFT.sol";

/// @notice Sets achievement metadata URIs from contracts/metadata/<slug>.uri.txt
/// Env: PRIVATE_KEY, ACHIEVEMENT_NFT
contract UpdateAchievementURIs is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        AchievementNFT nfts = AchievementNFT(vm.envAddress("ACHIEVEMENT_NFT"));

        string[10] memory slugs = [
            "1k",
            "5k",
            "10k",
            "half",
            "marathon",
            "streak-7",
            "streak-14",
            "streak-30",
            "total-10k",
            "century"
        ];

        console2.log("Updating URIs on", address(nfts));

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < slugs.length; i++) {
            uint256 id = i + 1;
            string memory uri = vm.readFile(string.concat("metadata/", slugs[i], ".uri.txt"));
            // trim trailing newline if present
            bytes memory b = bytes(uri);
            if (b.length > 0 && b[b.length - 1] == 0x0a) {
                assembly {
                    mstore(uri, sub(mload(uri), 1))
                }
            }
            nfts.setAchievementURI(id, uri);
            console2.log("Set achievement", id);
        }
        vm.stopBroadcast();
        console2.log("Done.");
    }
}
