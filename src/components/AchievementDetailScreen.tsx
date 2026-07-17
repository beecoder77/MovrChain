import { useEffect, useRef, useState } from "react";
import { zeroAddress } from "viem";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monadTestnet } from "viem/chains";
import type { AchievementDef } from "../lib/posts";
import {
  ACHIEVEMENT_NFT_ABI,
  CLAIM_NFT_GAS,
  claimStatus,
  formatBoostBps,
  formatProgressValue,
  isClubAchievement,
  NFT_CONTRACT,
  parseRunnerStats,
  progressForAchievement,
} from "../lib/achievements";
import {
  CLAIM_BADGE_GAS,
  CLUB_BADGE_ABI,
  CLUB_BADGE_NFT,
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
} from "../lib/clubs";
import { CONTRACT_ADDRESS, MOVR_CHAIN_ABI } from "../lib/chain";
import { formatWalletError } from "../lib/errors";
import { refetchAfterTx } from "../lib/refetchAfterTx";
import { Alert, Button } from "../design-system/components";

type AchievementDetailScreenProps = {
  address: `0x${string}`;
  viewerAddress: `0x${string}`;
  achievement: AchievementDef;
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
  const queryClient = useQueryClient();
  const handledTx = useRef<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const isClub = isClubAchievement(achievement);
  const badgeId = achievement.clubBadgeId ?? 0;
  const chainId = BigInt(achievement.chainId);
  const canClaim =
    !viewOnly && viewerAddress.toLowerCase() === address.toLowerCase();
  const badgesLive = CLUB_BADGE_NFT !== zeroAddress;

  const { data: statsRaw, refetch: refetchStats } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MOVR_CHAIN_ABI,
    functionName: "runnerStats",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: !isClub, staleTime: 0, refetchOnMount: "always" },
  });

  const { data: joined } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "hasEverJoined",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isClub },
  });
  const { data: donated } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "lifetimeDonatedAllClubs",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isClub },
  });
  const { data: passed } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "proposalsPassedCount",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isClub },
  });
  const { data: votes } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "votesCastCount",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isClub },
  });
  const { data: clubSize } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubMemberCountFor",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isClub },
  });

  const clubProgressValue = (() => {
    if (!isClub) return 0;
    if (achievement.criterion === "club_join") return joined ? 1 : 0;
    if (achievement.criterion === "club_donate")
      return (donated as bigint | undefined) && (donated as bigint) > 0n ? 1 : 0;
    if (achievement.criterion === "club_pass_proposal")
      return Number(passed ?? 0n) > 0 ? 1 : 0;
    if (achievement.criterion === "club_votes") return Number(votes ?? 0n);
    if (achievement.criterion === "club_size") return Number(clubSize ?? 0n);
    return 0;
  })();

  const { data: claimedRun, refetch: refetchClaimedRun } = useReadContract({
    address: NFT_CONTRACT,
    abi: ACHIEVEMENT_NFT_ABI,
    functionName: "hasClaimed",
    args: [address, chainId],
    chainId: monadTestnet.id,
    query: { enabled: !isClub, staleTime: 0, refetchOnMount: "always" },
  });

  const { data: eligibleRun, refetch: refetchEligibleRun } = useReadContract({
    address: NFT_CONTRACT,
    abi: ACHIEVEMENT_NFT_ABI,
    functionName: "eligible",
    args: [address, chainId],
    chainId: monadTestnet.id,
    query: { enabled: !isClub, staleTime: 0, refetchOnMount: "always" },
  });

  const { data: claimedClub, refetch: refetchClaimedClub } = useReadContract({
    address: CLUB_BADGE_NFT,
    abi: CLUB_BADGE_ABI,
    functionName: "hasClaimed",
    args: [address, badgeId],
    chainId: monadTestnet.id,
    query: {
      enabled: isClub && badgesLive,
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const { data: eligibleClub, refetch: refetchEligibleClub } = useReadContract({
    address: CLUB_BADGE_NFT,
    abi: CLUB_BADGE_ABI,
    functionName: "eligible",
    args: [address, badgeId],
    chainId: monadTestnet.id,
    query: {
      enabled: isClub && badgesLive,
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const claimed = isClub ? claimedClub : claimedRun;
  const eligible = isClub ? eligibleClub : eligibleRun;
  const stats = parseRunnerStats(statsRaw);
  const progress = progressForAchievement(
    achievement,
    stats,
    clubProgressValue,
  );
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
    confirmations: 2,
    pollingInterval: 1_000,
  });

  const busy = isPending || confirming || syncing;
  const receiptReverted = receipt?.status === "reverted";

  useEffect(() => {
    if (writeError) setWarning(formatWalletError(writeError));
    else if (receiptFailed || receiptReverted)
      setWarning(
        formatWalletError(receiptError ?? new Error("Claim failed on Monad")),
      );
  }, [writeError, receiptFailed, receiptError, receiptReverted]);

  useEffect(() => {
    if (!isSuccess || receiptReverted || !txHash) return;
    if (handledTx.current === txHash) return;
    handledTx.current = txHash;

    let cancelled = false;
    void (async () => {
      setSyncing(true);
      try {
        const fns = isClub
          ? [() => refetchClaimedClub(), () => refetchEligibleClub()]
          : [
              () => refetchClaimedRun(),
              () => refetchEligibleRun(),
              () => refetchStats(),
            ];
        await refetchAfterTx(fns, {
          queryClient,
          until: async () => {
            if (isClub) {
              const r = await refetchClaimedClub();
              return Boolean(r.data);
            }
            const r = await refetchClaimedRun();
            return Boolean(r.data);
          },
        });
        if (!cancelled) setWarning(null);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isSuccess,
    receiptReverted,
    txHash,
    isClub,
    queryClient,
    refetchClaimedClub,
    refetchEligibleClub,
    refetchClaimedRun,
    refetchEligibleRun,
    refetchStats,
  ]);

  const handleClaim = () => {
    if (!canClaim) {
      setWarning("You can only claim achievements for your own wallet.");
      return;
    }
    setWarning(null);
    reset();
    if (isClub) {
      if (!badgesLive) {
        setWarning("Club badge contract not configured.");
        return;
      }
      writeContract({
        address: CLUB_BADGE_NFT,
        abi: CLUB_BADGE_ABI,
        functionName: "claim",
        args: [badgeId],
        chainId: monadTestnet.id,
        gas: CLAIM_BADGE_GAS,
      });
      return;
    }
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
        : "Locked — keep going";

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
            <dt>{isClub ? "Club badge" : "On-chain ID"}</dt>
            <dd>#{isClub ? badgeId : achievement.chainId}</dd>
          </div>
        </dl>
        <p className="achieve-detail__hint">
          {canClaim
            ? isClub
              ? "Club badges unlock from membership, donations, votes, and roster size."
              : "Eligibility uses attested Monad stats — import and verify runs so the claim unlocks."
            : "View only — badges can only be claimed by this runner’s wallet."}
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
        <Button
          variant="ghost"
          block
          onClick={onBack}
          disabled={busy && canClaim}
        >
          Back to profile
        </Button>
      </div>
    </section>
  );
}
