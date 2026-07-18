import { useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { monadTestnet } from "viem/chains";
import { Button, Alert } from "../design-system/components";
import { formatWalletError } from "../lib/errors";

function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function hasInjectedProvider(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { ethereum?: unknown }).ethereum)
  );
}

function connectorKind(connector: Connector): "walletConnect" | "injected" | "other" {
  const id = connector.id.toLowerCase();
  const name = connector.name.toLowerCase();
  if (id.includes("walletconnect") || name.includes("walletconnect")) {
    return "walletConnect";
  }
  if (id === "injected" || name.includes("injected")) return "injected";
  return "other";
}

function connectorLabel(connector: Connector): string {
  switch (connectorKind(connector)) {
    case "walletConnect":
      return "Wallet app (MetaMask, Trust, …)";
    case "injected":
      return hasInjectedProvider()
        ? `Browser wallet${connector.name && connector.name !== "Injected" ? ` (${connector.name})` : ""}`
        : "Browser wallet extension";
    default:
      return connector.name || "Wallet";
  }
}

function connectorHint(connector: Connector): string | null {
  switch (connectorKind(connector)) {
    case "walletConnect":
      return "Opens your mobile wallet app, or a QR code on desktop.";
    case "injected":
      return hasInjectedProvider()
        ? null
        : "Needs MetaMask (or similar) installed in this browser — or use a wallet app below.";
    default:
      return null;
  }
}

export function ConnectScreen() {
  const { connect, connectors, isPending } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const mobile = useMemo(() => isMobileUa(), []);
  const injectedReady = useMemo(() => hasInjectedProvider(), []);

  const orderedConnectors = useMemo(() => {
    const list = [...connectors];
    list.sort((a, b) => {
      const rank = (c: Connector) => {
        const kind = connectorKind(c);
        if (mobile && !injectedReady) {
          if (kind === "walletConnect") return 0;
          if (kind === "injected") return 2;
          return 1;
        }
        if (kind === "injected" && injectedReady) return 0;
        if (kind === "walletConnect") return 1;
        return 2;
      };
      return rank(a) - rank(b);
    });
    return list;
  }, [connectors, mobile, injectedReady]);

  const handleConnect = (connector: Connector) => {
    setConnectError(null);
    setPendingId(connector.id);

    if (connectorKind(connector) === "injected" && !hasInjectedProvider()) {
      setPendingId(null);
      setConnectError(
        mobile
          ? "This browser has no wallet extension. Use “Wallet app” to open MetaMask or another mobile wallet."
          : "No wallet extension detected. Install MetaMask (or similar), or use WalletConnect with a mobile wallet.",
      );
      return;
    }

    connect(
      { connector, chainId: monadTestnet.id },
      {
        onError: (err) => {
          setPendingId(null);
          setConnectError(formatWalletError(err) ?? "Could not connect wallet.");
        },
        onSuccess: () => {
          setPendingId(null);
          void switchChainAsync({ chainId: monadTestnet.id }).catch(() => {
            /* already on Monad or user rejected — NetworkGate handles it */
          });
        },
        onSettled: () => {
          setPendingId(null);
        },
      },
    );
  };

  return (
    <div className="connect-screen">
      <div className="connect-screen__content">
        <img
          className="connect-screen__logo"
          src="/brand/movr-logo.svg"
          alt="MOVR"
          width={72}
          height={72}
        />
        <p className="connect-screen__eyebrow">Monad-native running</p>
        <h1 className="connect-screen__title">Prove you ran. Earn on-chain.</h1>
        <p className="connect-screen__lead">
          Connect your wallet to log runs, verify activity on Monad, and share
          proof with your timeline.
        </p>
        <ul className="connect-screen__features">
          <li>Import GPX from Strava, Garmin, or Apple Watch</li>
          <li>Replay your route and lock stats before posting</li>
          <li>Hit milestones and track achievements on your profile</li>
        </ul>

        {connectError && (
          <Alert className="connect-screen__alert">{connectError}</Alert>
        )}

        <div className="connect-screen__actions">
          {orderedConnectors.map((connector, index) => {
            const pendingThis = isPending && pendingId === connector.id;
            const primary = index === 0;
            const hint = connectorHint(connector);
            return (
              <div key={connector.id} className="connect-screen__action">
                <Button
                  block
                  variant={primary ? "primary" : "secondary"}
                  loading={pendingThis}
                  disabled={isPending}
                  onClick={() => handleConnect(connector)}
                >
                  {pendingThis ? "Connecting…" : connectorLabel(connector)}
                </Button>
                {hint && (
                  <p className="connect-screen__action-hint">{hint}</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="connect-screen__footnote">
          {mobile
            ? "On phone, use Wallet app to open MetaMask or another wallet. Sample runs still work without connecting."
            : "You can Import → Load Sample Run without a wallet. Connect when you’re ready to verify on Monad and claim rewards."}
        </p>
      </div>
    </div>
  );
}

/** Soft gate when connected wallet is not on Monad testnet. */
export function MonadNetworkGate({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  const wrong = isConnected && chainId !== undefined && chainId !== monadTestnet.id;

  if (!wrong) return <>{children}</>;

  return (
    <div className="connect-screen">
      <div className="connect-screen__content">
        <h1 className="connect-screen__title">Switch to Monad Testnet</h1>
        <p className="connect-screen__lead">
          MovrChain reads and writes on Monad testnet (chain {monadTestnet.id}).
          Your wallet is on another network.
        </p>
        {error && (
          <Alert className="connect-screen__alert">
            {formatWalletError(error) ?? "Could not switch network."}
          </Alert>
        )}
        <Button
          block
          loading={isPending}
          disabled={isPending}
          onClick={() => switchChain({ chainId: monadTestnet.id })}
        >
          {isPending ? "Switching…" : "Switch to Monad Testnet"}
        </Button>
      </div>
    </div>
  );
}
