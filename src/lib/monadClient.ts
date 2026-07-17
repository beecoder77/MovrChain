import { createPublicClient, fallback, http } from "viem";
import { monadTestnet } from "viem/chains";

/**
 * Shared Monad testnet HTTP stack for reads.
 * Sequential fallback (no rank race) — public RPCs flake under parallel probes.
 * Batch stays off (some endpoints disallow JSON-RPC batching).
 */
export const monadTransport = fallback(
  [
    http("https://testnet-rpc.monad.xyz", { batch: false, retryCount: 2, timeout: 20_000 }),
    http("https://rpc-testnet.monadinfra.com", { batch: false, retryCount: 2, timeout: 20_000 }),
    http("https://rpc.ankr.com/monad_testnet", { batch: false, retryCount: 2, timeout: 20_000 }),
    http("https://10143.rpc.thirdweb.com", { batch: false, retryCount: 2, timeout: 20_000 }),
  ],
  { rank: false },
);

/** Dedicated public client — profile / feed reads should not depend on wallet RPC. */
export const monadPublicClient = createPublicClient({
  chain: monadTestnet,
  transport: monadTransport,
});
