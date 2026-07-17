/**
 * Monad gas helpers.
 *
 * Monad charges primarily on gas_limit (not just gas_used), so limits must be
 * tight enough to avoid overpaying, but eth_estimateGas often undercounts cold
 * storage / long string writes. Pattern: estimate → ×1.5 → max(floor).
 */
export const MONAD_GAS_BUFFER_BPS = 150n; // 1.50× estimate

/** Achievement NFT mint stores a long data: URI — observed ~3.1M on testnet. */
export const CLAIM_NFT_GAS_FLOOR = 3_500_000n;
export const CLAIM_BADGE_GAS_FLOOR = 400_000n;
export const ATTEST_GAS_FLOOR = 350_000n;
export const PUBLISH_GAS_FLOOR = 800_000n;
export const MILESTONE_CLAIM_GAS_FLOOR = 550_000n;

export function bufferedMonadGas(estimate: bigint, floor: bigint): bigint {
  const bumped = (estimate * MONAD_GAS_BUFFER_BPS) / 100n;
  return bumped > floor ? bumped : floor;
}
