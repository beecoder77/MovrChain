import type { QueryClient } from "@tanstack/react-query";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RefetchAfterTxOptions = {
  /** Initial wait before first read (Monad can finalize receipt before state is queryable). */
  delayMs?: number;
  /** Extra waits between attempts. */
  gapMs?: number;
  /** How many refetch rounds. */
  attempts?: number;
  /** Stop early when this returns true (after a refetch round). */
  until?: () => boolean | Promise<boolean>;
  /** Invalidate wagmi read caches so other screens pick up new state. */
  queryClient?: QueryClient;
};

/**
 * After a confirmed write on Monad, eth_call can still return pre-tx state for
 * a short window (async execution). One immediate refetch often looks "stuck"
 * until a hard refresh. Delay + retry (and optional until) fixes that.
 */
export async function refetchAfterTx(
  fns: Array<() => unknown>,
  opts: RefetchAfterTxOptions = {},
): Promise<void> {
  const delayMs = opts.delayMs ?? 900;
  const gapMs = opts.gapMs ?? 1_100;
  const attempts = opts.attempts ?? (opts.until ? 5 : 1);

  if (opts.queryClient) {
    await opts.queryClient.invalidateQueries({
      predicate: (q) => {
        const head = q.queryKey[0];
        return head === "readContract" || head === "readContracts";
      },
    });
  }

  await sleep(delayMs);

  for (let i = 0; i < attempts; i++) {
    await Promise.all(
      fns.map((fn) => Promise.resolve(fn()).catch(() => undefined)),
    );
    if (opts.until && (await opts.until())) return;
    if (i < attempts - 1) await sleep(gapMs);
  }

  // Most writes need only one delayed round. Keep a non-blocking safety pass
  // for RPC replicas that were still behind, without holding the UI disabled.
  if (!opts.until) {
    void sleep(gapMs).then(() =>
      Promise.all(
        fns.map((fn) => Promise.resolve(fn()).catch(() => undefined)),
      ),
    );
  }
}
