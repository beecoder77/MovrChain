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
  /** Soft-invalidate wagmi reads after local refetches (non-blocking). */
  queryClient?: QueryClient;
};

/**
 * After a confirmed write on Monad, eth_call can briefly return pre-tx state.
 * Delay + targeted refetch (optional until) updates the screen without a refresh.
 *
 * Important: do NOT invalidate the entire read cache before refetching — that
 * reshuffles hook identities mid-flight and can leave busy/syncing stuck true.
 */
export async function refetchAfterTx(
  fns: Array<() => unknown>,
  opts: RefetchAfterTxOptions = {},
): Promise<void> {
  const delayMs = opts.delayMs ?? 600;
  const gapMs = opts.gapMs ?? 900;
  const attempts = opts.attempts ?? (opts.until ? 4 : 1);

  await sleep(delayMs);

  for (let i = 0; i < attempts; i++) {
    await Promise.all(
      fns.map((fn) => Promise.resolve(fn()).catch(() => undefined)),
    );
    if (opts.until && (await opts.until())) break;
    if (i < attempts - 1) await sleep(gapMs);
  }

  if (opts.queryClient) {
    void opts.queryClient.invalidateQueries({
      predicate: (q) => {
        const head = q.queryKey[0];
        return head === "readContract" || head === "readContracts";
      },
    });
  }

  // Non-blocking safety pass for lagging replicas — does not hold the UI.
  if (!opts.until) {
    void sleep(gapMs).then(() =>
      Promise.all(
        fns.map((fn) => Promise.resolve(fn()).catch(() => undefined)),
      ),
    );
  }
}
