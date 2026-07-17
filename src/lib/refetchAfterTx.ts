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
  /**
   * Optional query client — only used for a narrow, deferred soft-touch.
   * Never wipe the entire read cache synchronously (that stalled profile loads).
   */
  queryClient?: QueryClient;
};

/**
 * After a confirmed write on Monad, eth_call can briefly return pre-tx state.
 * Delay + targeted refetch updates the current screen without a hard refresh.
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

  // Non-blocking safety pass for lagging replicas — does not hold the UI.
  if (!opts.until) {
    void sleep(gapMs).then(() =>
      Promise.all(
        fns.map((fn) => Promise.resolve(fn()).catch(() => undefined)),
      ),
    );
  }
}
