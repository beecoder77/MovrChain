import { useEffect, useRef, useState } from "react";

/**
 * Runs a post-receipt sync once per tx hash. Always clears the syncing flag —
 * never leave the UI disabled if the effect re-runs mid-flight (common after
 * query invalidation changes refetch identities).
 */
export function useAfterConfirmedTx(
  txHash: `0x${string}` | undefined,
  isSuccess: boolean,
  reverted: boolean,
  onConfirmed: () => Promise<void> | void,
): boolean {
  const [syncing, setSyncing] = useState(false);
  const handledTx = useRef<string | null>(null);
  const syncId = useRef(0);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  useEffect(() => {
    if (!isSuccess || !txHash || reverted) return;
    if (handledTx.current === txHash) return;
    handledTx.current = txHash;

    const id = ++syncId.current;
    setSyncing(true);
    void (async () => {
      try {
        await onConfirmedRef.current();
      } finally {
        if (syncId.current === id) setSyncing(false);
      }
    })();
  }, [isSuccess, txHash, reverted]);

  return syncing;
}
