type WalletChipProps = {
  address: string;
  connected?: boolean;
};

export function WalletChip({ address, connected = false }: WalletChipProps) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <span
      className={`ds-wallet-chip${connected ? " ds-wallet-chip--connected" : ""}`}
    >
      {short}
    </span>
  );
}
