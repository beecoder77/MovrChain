import { useEffect, useState } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { monadTestnet } from "viem/chains";
import type { AchievementDef } from "../lib/posts";
import {
  ACHIEVEMENT_NFT_ABI,
  CLAIM_NFT_GAS,
  claimStatus,
  formatBoostBps,
  formatProgressValue,
  NFT_CONTRACT,
  parseRunnerStats,
  progressForAchievement,
} from "../lib/achievements";
import { CONTRACT_ADDRESS, MOVR_CHAIN_ABI } from "../lib/chain";
import { formatWalletError } from "../lib/errors";
import { Alert, Button } from "../design-system/components";

type AchievementDetailScreenProps = {
  /** Subject whose achievement we display (read-only when viewOnly) */
  address: `0x${string}`;
  /** Connected wallet — claims only when it matches address */
  viewerAddress: `0x${string}`;
  achievement: AchievementDef;
  /** Force read-only (public profile). Also enforced when viewer ≠ subject. */
  viewOnly?: boolean;
  onBack: () => void;
};

export function AchievementDetailScreen({
  address,
  viewerAddress,
  achievement,
  viewOnly = false,
  onBack,
}: AchievementDetailScreenProps) {
  const [warning, setWarning] = useState<string | null>(null);
  const chainId = BigInt(achievement.chainId);
  const canClaim =
    !viewOnly &&
    viewerAddress.toLowerCase() === address.toLowerCase();

  const { data: statsRaw, refetch: refetchStats } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MOVR_CHAIN_ABI,
    functionName: "runnerStats",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: claimed, refetch: refetchClaimed } = useReadContract({
    address: NFT_CONTRACT,
    abi: ACHIEVEMENT_NFT_ABI,
    functionName: "hasClaimed",
    args: [address, chainId],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: eligible, refetch: refetchEligible } = useReadContract({
    address: NFT_CONTRACT,
    abi: ACHIEVEMENT_NFT_ABI,
    functionName: "eligible",
    args: [address, chainId],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const stats = parseRunnerStats(statsRaw);
  const progress = progressForAchievement(achievement, stats);
  const status = claimStatus(Boolean(claimed), Boolean(eligible));

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptFailed,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: monadTestnet.id,
  });

  const busy = isPending || confirming;
  const receiptReverted = receipt?.status === "reverted";

  useEffect(() => {
    if (writeError) setWarning(formatWalletError(writeError));
    else if (receiptFailed || receiptReverted)
      setWarning(
        formatWalletError(receiptError ?? new Error("Claim failed on Monad")),
      );
  }, [writeError, receiptFailed, receiptError, receiptReverted]);

  useEffect(() => {
    if (!isSuccess || receiptReverted) return;
    void refetchClaimed();
    void refetchEligible();
    void refetchStats();
    setWarning(null);
  }, [
    isSuccess,
    receiptReverted,
    refetchClaimed,
    refetchEligible,
    refetchStats,
  ]);

  const handleClaim = () => {
    if (!canClaim) {
      setWarning("You can only claim achievements for your own wallet.");
      return;
    }
    setWarning(null);
    reset();
    writeContract({
      address: NFT_CONTRACT,
      abi: ACHIEVEMENT_NFT_ABI,
      functionName: "claimAchievement",
      args: [chainId],
      chainId: monadTestnet.id,
      gas: CLAIM_NFT_GAS,
    });
  };

  const statusLabel =
    status === "claimed"
      ? "NFT claimed"
      : status === "claimable"
        ? canClaim
          ? "Ready to claim NFT"
          : "Eligible (owner can claim)"
        : "Locked — keep running";

  return (
    <section className="achieve-detail" aria-label="Achievement detail">
      <div className="achieve-detail__hero">
        <img
          className="achieve-detail__art"
          src={achievement.image}
          alt=""
          width={96}
          height={96}
        />
        <p className="achieve-detail__status">{statusLabel}</p>
        <h1 className="achieve-detail__title">{achievement.title}</h1>
        <p className="achieve-detail__desc">{achievement.description}</p>
      </div>

      <div className="achieve-detail__panel">
        <div className="achieve-detail__progress-head">
          <span>Progress</span>
          <span>
            {formatProgressValue(achievement, progress.current)} /{" "}
            {formatProgressValue(achievement, progress.threshold)}
          </span>
        </div>
        <div
          className="achieve-detail__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.ratio * 100)}
        >
          <div
            className="achieve-detail__bar-fill"
            style={{ width: `${Math.round(progress.ratio * 100)}%` }}
          />
        </div>
        <dl className="achieve-detail__meta">
          <div className="achieve-detail__meta-row">
            <dt>Staking boost</dt>
            <dd>{formatBoostBps(achievement.stakingBoostBps)}</dd>
          </div>
          <div className="achieve-detail__meta-row">
            <dt>On-chain ID</dt>
            <dd>#{achievement.chainId}</dd>
          </div>
        </dl>
        <p className="achieve-detail__hint">
          {canClaim
            ? "Eligibility uses attested Monad stats — import and verify runs so the claim unlocks."
            : "View only — achievement NFTs can only be claimed by this runner’s connected wallet."}
        </p>
      </div>

      {warning && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          {warning}
        </Alert>
      )}

      {isSuccess && !receiptReverted && status === "claimed" && canClaim && (
        <Alert className="ds-alert--footer-spaced">
          Achievement NFT minted to your wallet.
        </Alert>
      )}

      <div className="achieve-detail__actions">
        {canClaim && status === "claimable" && (
          <Button block loading={busy} disabled={busy} onClick={handleClaim}>
            {busy ? "Claiming NFT…" : "Claim achievement NFT"}
          </Button>
        )}
        {status === "claimed" && (
          <Button block disabled>
            NFT owned
          </Button>
        )}
        {canClaim && status === "locked" && (
          <Button block disabled>
            Not eligible yet
          </Button>
        )}
        {!canClaim && status !== "claimed" && (
          <Button block disabled>
            View only
          </Button>
        )}
        <Button variant="ghost" block onClick={onBack} disabled={busy && canClaim}>
          Back to profile
        </Button>
      </div>
    </section>
  );
}
