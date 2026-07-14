import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz", {
      batch: true,
      retryCount: 3,
    }),
  },
  // Persist + reconnect wallet so getProfile runs again after refresh
  multiInjectedProviderDiscovery: true,
});

export const EXPLORER_URL = "https://testnet.monadvision.com";
