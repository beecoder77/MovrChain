import { createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import { monadTransport } from "./monadClient";

/** WalletConnect Cloud Project ID (public; baked into the client bundle). */
const DEFAULT_WALLETCONNECT_PROJECT_ID = "e0f9f648cd92eea6a5b469d048bb6f4e";

const walletConnectProjectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() ||
  DEFAULT_WALLETCONNECT_PROJECT_ID;

const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://movr.muhsalmanabid.com";

const connectors = [
  injected({ shimDisconnect: true }),
  walletConnect({
    projectId: walletConnectProjectId,
    showQrModal: true,
    metadata: {
      name: "MovrChain",
      description: "Prove you ran — attest GPX runs and earn on Monad.",
      url: appUrl,
      icons: [`${appUrl}/brand/movr-logo.svg`],
    },
  }),
];

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors,
  transports: {
    [monadTestnet.id]: monadTransport,
  },
  multiInjectedProviderDiscovery: true,
});

export const EXPLORER_URL = "https://testnet.monadvision.com";
