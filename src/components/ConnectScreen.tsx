import { useState } from "react";
import { useConnect } from "wagmi";
import { Button, Alert } from "../design-system/components";
import { formatWalletError } from "../lib/errors";

export function ConnectScreen() {
  const { connect, connectors, isPending } = useConnect();
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = () => {
    setConnectError(null);
    const connector = connectors[0];
    if (!connector) {
      setConnectError(
        "No wallet found. Install MetaMask or another Web3 wallet, then reload.",
      );
      return;
    }

    connect(
      { connector },
      {
        onError: (err) => {
          setConnectError(formatWalletError(err) ?? "Could not connect wallet.");
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

        <Button
          block
          loading={isPending}
          disabled={isPending}
          onClick={handleConnect}
        >
          {isPending ? "Connecting…" : "Connect wallet to start"}
        </Button>
        <p className="connect-screen__footnote">
          Fitness product first — wallet unlocks verify &amp; rewards, not speculation.
        </p>
      </div>
    </div>
  );
}
