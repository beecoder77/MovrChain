import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import { monadTransport } from "./monadClient";

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: monadTransport,
  },
  multiInjectedProviderDiscovery: true,
});

export const EXPLORER_URL = "https://testnet.monadvision.com";
