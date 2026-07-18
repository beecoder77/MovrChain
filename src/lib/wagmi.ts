import { createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { monadTestnet } from "viem/chains";
import { monadTransport } from "./monadClient";

const walletConnectProjectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() ??
  "";

const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://movr.muhsalmanabid.com";

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "MovrChain",
            description:
              "Prove you ran — attest GPX runs and earn on Monad.",
            url: appUrl,
            icons: [`${appUrl}/brand/movr-logo.svg`],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors,
  transports: {
    [monadTestnet.id]: monadTransport,
  },
  multiInjectedProviderDiscovery: true,
});

/** True when WalletConnect (mobile wallet apps / QR) is configured. */
export const walletConnectEnabled = Boolean(walletConnectProjectId);

export const EXPLORER_URL = "https://testnet.monadvision.com";
