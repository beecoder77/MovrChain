import { useEffect, useRef, useState } from "react";
import { zeroAddress } from "viem";
import type { ParsedRun } from "../lib/gpx";
import { formatDistance } from "../lib/gpx";
import {
  computeRouteCommit,
  computeRunHash,
  CONTRACT_ADDRESS,
  clubRewardLabelForDistance,
  meetsMilestone,
  MILESTONE_METERS,
  MILESTONE_REWARD_ABI,
  MOVR_CHAIN_ABI,
  REWARD_CONTRACT_ADDRESS,
  rewardLabelForDistance,
} from "../lib/chain";
import { FEED_ABI, FEED_CONTRACT_ADDRESS, publishRunName } from "../lib/feed";
import { CLUB_REGISTRY, CLUB_REGISTRY_ABI } from "../lib/clubs";
import { downsamplePoints } from "../lib/gpx";
import { saveRouteFromRun } from "../lib/routes";
import { RouteMap } from "./RouteMap";
import { EXPLORER_URL } from "../lib/wagmi";
import { formatAttestationFailure, isAlreadyAttestedError } from "../lib/errors";
import {
  Alert,
  Button,
  LinkButton,
  Pipeline,
  type PipelineStep,
  RewardBanner,
  WalletChip,
} from "../design-system/components";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
} from "wagmi";
import { monadTestnet } from "viem/chains";

type VerifyClaimProps = {
  run: ParsedRun;
  onBack: () => void;
  onVerified: (txHash?: string) => boolean;
};

type PipelineStepId = "parsed" | "attested" | "published" | "reward";

/**
 * Gas LIMIT is a ceiling: you pay for gas USED, unused units are refunded.
 * Monad eth_estimateGas often undercounts heavy storage (feed string + array push),
 * so we estimate then multiply, with floors so cold SSTORE never OOGs.
 */
const GAS_BUFFER_BPS = 200n; // 2.00× estimate
const ATTEST_GAS_FLOOR = 350_000n;
const PUBLISH_GAS_FLOOR = 800_000n;
const CLAIM_GAS_FLOOR = 550_000n;

function bufferedGas(estimate: bigint, floor: bigint): bigint {
  const bumped = (estimate * GAS_BUFFER_BPS) / 100n;
  return bumped > floor ? bumped : floor;
}

export function VerifyClaim({ run, onBack, onVerified }: VerifyClaimProps) {
  const { address } = useAccount();
  const routeCommit = computeRouteCommit(run);
  const runHash = address
    ? computeRunHash(address, run)
    : (`0x${"00".repeat(32)}` as `0x${string}`);
  const runName = publishRunName(run.name);
  const milestone = meetsMilestone(run.totalDistanceMeters);
  const rewardLabel = rewardLabelForDistance(run.totalDistanceMeters);
  const clubRewardLabel = clubRewardLabelForDistance(run.totalDistanceMeters);
  const mapPoints = downsamplePoints(run.points, 200);
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const clubsLive = CLUB_REGISTRY !== zeroAddress;

  const { data: clubIdRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: address ? [address] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: clubsLive && Boolean(address), staleTime: 12_000 },
  });
  const myClubId = (clubIdRaw as bigint | undefined) ?? 0n;
  const inClub = myClubId > 0n;

  // Keep map available for feed detail after attest
  useEffect(() => {
    saveRouteFromRun(run, runHash);
  }, [run, runHash]);

  const {
    writeContract: writeAttest,
    data: attestTxHash,
    isPending: attestPending,
    error: attestWriteError,
    reset: resetAttest,
  } = useWriteContract();
  const {
    isLoading: attestConfirming,
    isSuccess: attestSuccess,
    isError: attestReceiptWaitFailed,
    error: attestReceiptError,
    data: attestReceipt,
  } = useWaitForTransactionReceipt({
    hash: attestTxHash,
    chainId: monadTestnet.id,
  });

  const {
    writeContract: writePublish,
    data: publishTxHash,
    isPending: publishPending,
    error: publishWriteError,
    reset: resetPublish,
  } = useWriteContract();
  const {
    isLoading: publishConfirming,
    isSuccess: publishSuccess,
    isError: publishReceiptWaitFailed,
    error: publishReceiptError,
    data: publishReceipt,
  } = useWaitForTransactionReceipt({
    hash: publishTxHash,
    chainId: monadTestnet.id,
  });

  const {
    writeContract: writeClaim,
    data: claimTxHash,
    isPending: claimPending,
    error: claimWriteError,
    reset: resetClaim,
  } = useWriteContract();
  const {
    isLoading: claimConfirming,
    isSuccess: claimSuccess,
    isError: claimReceiptWaitFailed,
    error: claimReceiptError,
    data: claimReceipt,
  } = useWaitForTransactionReceipt({
    hash: claimTxHash,
    chainId: monadTestnet.id,
  });

  const [localVerified, setLocalVerified] = useState(false);
  const [localPublished, setLocalPublished] = useState(false);
  const [localClaimed, setLocalClaimed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const autoPublishTried = useRef(false);
  const autoClaimTried = useRef(false);
  const finishTried = useRef(false);

  const attestReverted = attestReceipt?.status === "reverted";
  const attestFailed =
    Boolean(attestWriteError) || attestReverted || attestReceiptWaitFailed;

  const publishReverted = publishReceipt?.status === "reverted";
  const publishFailed =
    Boolean(publishWriteError) || publishReverted || publishReceiptWaitFailed;

  const claimReverted = claimReceipt?.status === "reverted";
  const claimFailed =
    Boolean(claimWriteError) || claimReverted || claimReceiptWaitFailed;

  const { data: existingAttestation } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MOVR_CHAIN_ABI,
    functionName: "attestations",
    args: [runHash],
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(CONTRACT_ADDRESS),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const existingRunner =
    existingAttestation && Array.isArray(existingAttestation)
      ? (existingAttestation[0] as `0x${string}` | undefined)
      : existingAttestation &&
          typeof existingAttestation === "object" &&
          "runner" in existingAttestation
        ? (existingAttestation as { runner: `0x${string}` }).runner
        : undefined;

  const hashAlreadyOnChain =
    Boolean(existingRunner) &&
    existingRunner!.toLowerCase() !== zeroAddress.toLowerCase();

  const verified =
    (attestSuccess && !attestReverted) ||
    localVerified ||
    hashAlreadyOnChain ||
    isAlreadyAttestedError(attestWriteError) ||
    isAlreadyAttestedError(attestReceiptError);

  const { data: alreadyPublishedOnChain, refetch: refetchPublished } =
    useReadContract({
      address: FEED_CONTRACT_ADDRESS,
      abi: FEED_ABI,
      functionName: "published",
      args: [runHash],
      chainId: monadTestnet.id,
      query: {
        enabled: Boolean(FEED_CONTRACT_ADDRESS) && verified,
        staleTime: 0,
        refetchOnMount: "always",
      },
    });

  const published =
    localPublished ||
    (publishSuccess && !publishReverted) ||
    Boolean(alreadyPublishedOnChain);

  const { data: alreadyClaimedOnChain } = useReadContract({
    address: REWARD_CONTRACT_ADDRESS,
    abi: MILESTONE_REWARD_ABI,
    functionName: "claimed",
    args: [runHash],
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(REWARD_CONTRACT_ADDRESS) && verified && milestone,
      staleTime: 0,
    },
  });

  const movrClaimed =
    localClaimed ||
    (claimSuccess && !claimReverted) ||
    Boolean(alreadyClaimedOnChain);

  const attestBusy = attestPending || attestConfirming;
  const publishBusy = publishPending || publishConfirming;
  const claimBusy = claimPending || claimConfirming;

  useEffect(() => {
    if (!attestFailed) return;
    if (
      hashAlreadyOnChain ||
      isAlreadyAttestedError(attestWriteError) ||
      isAlreadyAttestedError(attestReceiptError)
    ) {
      setWarning(
        "Already verified on Monad — publishing to Your runs and Community…",
      );
      return;
    }
    const message = formatAttestationFailure({
      writeError: attestWriteError,
      receiptError: attestReceiptError,
      receiptStatus: attestReceipt?.status,
    });
    if (message) setWarning(message);
  }, [
    attestFailed,
    hashAlreadyOnChain,
    attestWriteError,
    attestReceiptError,
    attestReceipt?.status,
  ]);

  useEffect(() => {
    if (!publishFailed) return;
    const msg =
      publishWriteError?.message ||
      publishReceiptError?.message ||
      "Feed publish failed.";
    if (/already published/i.test(msg)) {
      setLocalPublished(true);
      setWarning(null);
      void refetchPublished();
      return;
    }
    if (/user rejected/i.test(msg)) {
      setWarning("Publish cancelled in wallet.");
      return;
    }
    setWarning(msg.slice(0, 180));
  }, [publishFailed, publishWriteError, publishReceiptError, refetchPublished]);

  useEffect(() => {
    if (!claimFailed) return;
    const msg =
      claimWriteError?.message ||
      claimReceiptError?.message ||
      "MOVR claim failed.";
    if (/user rejected/i.test(msg)) {
      setWarning("MOVR claim cancelled — your run is still on the feed.");
      return;
    }
    if (/not claimable|empty pool/i.test(msg)) {
      setWarning(
        "Feed published. MOVR claim skipped (already claimed or pool empty).",
      );
      return;
    }
    setWarning(msg.slice(0, 180));
  }, [claimFailed, claimWriteError, claimReceiptError]);

  const startPublish = async () => {
    if (!FEED_CONTRACT_ADDRESS || !address) return;
    setWarning(null);
    let gas = PUBLISH_GAS_FLOOR;
    try {
      if (publicClient) {
        const estimated = await publicClient.estimateContractGas({
          address: FEED_CONTRACT_ADDRESS,
          abi: FEED_ABI,
          functionName: "publish",
          args: [runHash, runName],
          account: address,
        });
        gas = bufferedGas(estimated, PUBLISH_GAS_FLOOR);
      }
    } catch {
      // Fall back to floor when estimate fails (common on flaky RPC)
      gas = PUBLISH_GAS_FLOOR;
    }
    writePublish({
      address: FEED_CONTRACT_ADDRESS,
      abi: FEED_ABI,
      functionName: "publish",
      args: [runHash, runName],
      chainId: monadTestnet.id,
      gas,
    });
  };

  // Auto-publish after fresh attest or when already attested
  useEffect(() => {
    if (autoPublishTried.current) return;
    if (!verified || published || publishBusy) return;
    if (!FEED_CONTRACT_ADDRESS || !address) {
      if (verified && !FEED_CONTRACT_ADDRESS) {
        setLocalPublished(true);
      }
      return;
    }
    // Wait until we know on-chain publish status when possible
    if (alreadyPublishedOnChain === undefined && !attestSuccess && !hashAlreadyOnChain) {
      return;
    }
    if (alreadyPublishedOnChain) {
      setLocalPublished(true);
      return;
    }
    autoPublishTried.current = true;
    void startPublish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once
  }, [
    verified,
    published,
    publishBusy,
    address,
    alreadyPublishedOnChain,
    attestSuccess,
    hashAlreadyOnChain,
  ]);

  // Auto-claim MOVR after publish when milestone
  useEffect(() => {
    if (autoClaimTried.current) return;
    if (!published || !milestone || movrClaimed || claimBusy) return;
    if (!REWARD_CONTRACT_ADDRESS || !address) {
      if (published && !milestone) return;
      if (published && !REWARD_CONTRACT_ADDRESS) setLocalClaimed(true);
      return;
    }
    autoClaimTried.current = true;
    void (async () => {
      let gas = CLAIM_GAS_FLOOR;
      try {
        if (publicClient && REWARD_CONTRACT_ADDRESS) {
          const estimated = await publicClient.estimateContractGas({
            address: REWARD_CONTRACT_ADDRESS,
            abi: MILESTONE_REWARD_ABI,
            functionName: "claim",
            args: [runHash],
            account: address,
          });
          gas = bufferedGas(estimated, CLAIM_GAS_FLOOR);
        }
      } catch {
        gas = CLAIM_GAS_FLOOR;
      }
      writeClaim({
        address: REWARD_CONTRACT_ADDRESS,
        abi: MILESTONE_REWARD_ABI,
        functionName: "claim",
        args: [runHash],
        chainId: monadTestnet.id,
        gas,
      });
    })();
  }, [
    published,
    milestone,
    movrClaimed,
    claimBusy,
    address,
    runHash,
    writeClaim,
    publicClient,
  ]);

  // Finish → save local cache + go to Your Run Feed
  useEffect(() => {
    if (finishTried.current || finished) return;
    if (!published) return;
    const rewardDone = !milestone || movrClaimed || claimFailed;
    if (!rewardDone) return;
    finishTried.current = true;
    const tx = publishTxHash ?? claimTxHash ?? attestTxHash;
    const ok = onVerified(tx);
    if (ok) {
      setFinished(true);
    } else {
      setWarning("Published on-chain, but could not save a local copy.");
      setFinished(true);
    }
  }, [
    published,
    milestone,
    movrClaimed,
    claimFailed,
    finished,
    onVerified,
    publishTxHash,
    claimTxHash,
    attestTxHash,
  ]);

  const handleVerify = () => {
    setWarning(null);
    autoPublishTried.current = false;
    autoClaimTried.current = false;
    finishTried.current = false;
    resetAttest();
    resetPublish();
    resetClaim();

    if (!CONTRACT_ADDRESS) {
      setLocalVerified(true);
      setLocalPublished(true);
      if (milestone) setLocalClaimed(true);
      return;
    }

    if (hashAlreadyOnChain) {
      setLocalVerified(true);
      return;
    }

    void (async () => {
      let gas = ATTEST_GAS_FLOOR;
      try {
        if (publicClient) {
          const estimated = await publicClient.estimateContractGas({
            address: CONTRACT_ADDRESS,
            abi: MOVR_CHAIN_ABI,
            functionName: "attestRun",
            args: [
              routeCommit,
              BigInt(Math.round(run.totalDistanceMeters)),
              BigInt(run.durationSeconds),
            ],
            account: address,
          });
          gas = bufferedGas(estimated, ATTEST_GAS_FLOOR);
        }
      } catch {
        gas = ATTEST_GAS_FLOOR;
      }
      writeAttest({
        address: CONTRACT_ADDRESS,
        abi: MOVR_CHAIN_ABI,
        functionName: "attestRun",
        args: [
          routeCommit,
          BigInt(Math.round(run.totalDistanceMeters)),
          BigInt(run.durationSeconds),
        ],
        chainId: monadTestnet.id,
        gas,
      });
    })();
  };

  let activeStep: PipelineStepId = "parsed";
  if (finished || (published && (!milestone || movrClaimed))) {
    activeStep = "reward";
  } else if (published || publishBusy) {
    activeStep = milestone ? "reward" : "published";
  } else if (verified || attestBusy) {
    activeStep = published ? "published" : "attested";
  }

  const pipelineDefs: { id: PipelineStepId; label: string }[] = [
    { id: "parsed", label: "Run parsed from GPX" },
    { id: "attested", label: "Attestation on Monad" },
    { id: "published", label: "Posted to Your runs + Community" },
    {
      id: "reward",
      label: milestone
        ? inClub
          ? `Claim ${rewardLabel.replace("+", "")} + ${clubRewardLabel.replace("+", "")} to club`
          : `Claim ${rewardLabel.replace("+", "")} (1 MOVR/km)`
        : "Done",
    },
  ];

  const stepIndex = pipelineDefs.findIndex((s) => s.id === activeStep);
  const pipelineSteps: PipelineStep[] = pipelineDefs.map((step, i) => {
    let state: PipelineStep["state"] = "pending";
    if (i < stepIndex) state = "done";
    else if (i === stepIndex) {
      state =
        finished || (step.id === "reward" && (!milestone || movrClaimed))
          ? "done"
          : "active";
    }
    return { id: step.id, label: step.label, state };
  });

  const explorerTx = claimTxHash ?? publishTxHash ?? attestTxHash;
  const busy = attestBusy || publishBusy || claimBusy;

  let primaryLabel = "Verify & publish";
  if (attestBusy) primaryLabel = "Submitting attestation…";
  else if (publishBusy) primaryLabel = "Publishing to feed…";
  else if (claimBusy) primaryLabel = "Claiming MOVR…";
  else if (finished) primaryLabel = "On your feed";
  else if (warning) primaryLabel = "Try again";
  else if (hashAlreadyOnChain && !published) primaryLabel = "Publish to feed";

  return (
    <section className="verify-screen" aria-label="Verify and publish">
      <div className="verify-map" aria-label="Route preview">
        <RouteMap points={mapPoints} progress={1} interactive={false} />
      </div>

      <div className="verify-status">
        <h2 className="verify-heading">
          {finished
            ? "Run on Your feed"
            : published
              ? "Published on-chain"
              : "Verify your run"}
        </h2>
        <p className="verify-subtitle">
          {formatDistance(run.totalDistanceMeters)} km · {run.name}
        </p>

        <Pipeline steps={pipelineSteps} />

        <div className="verify-hash">
          <strong>Run hash</strong>
          <br />
          {runHash}
        </div>
      </div>

      {published && milestone && (
        <>
          <RewardBanner
            amount={rewardLabel}
            label={
              movrClaimed
                ? "1 MOVR per km — claimed"
                : "1 MOVR per km — claiming…"
            }
          />
          {inClub && (
            <RewardBanner
              amount={clubRewardLabel}
              label={
                movrClaimed
                  ? "1 MOVR / 10 km to club treasury — credited toward top-donor vote power"
                  : "1 MOVR / 10 km to your club treasury (additive)"
              }
            />
          )}
        </>
      )}

      {published && !milestone && (
        <div className="verify-status verify-notice">
          <p>
            Published to Community. Under {MILESTONE_METERS / 1000} km — no MOVR
            this time.
          </p>
        </div>
      )}

      {warning && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          {warning}
        </Alert>
      )}

      <div className="verify-footer">
        {address && (
          <div className="verify-wallet-row">
            <WalletChip address={address} connected />
          </div>
        )}

        {!finished && (
          <Button
            block
            loading={busy}
            disabled={busy || (verified && published && claimBusy)}
            onClick={() => {
              if (!verified) handleVerify();
              else if (!published) {
                autoPublishTried.current = false;
                startPublish();
              } else if (milestone && !movrClaimed && REWARD_CONTRACT_ADDRESS) {
                autoClaimTried.current = false;
                void (async () => {
                  let gas = CLAIM_GAS_FLOOR;
                  try {
                    if (publicClient) {
                      const estimated = await publicClient.estimateContractGas({
                        address: REWARD_CONTRACT_ADDRESS,
                        abi: MILESTONE_REWARD_ABI,
                        functionName: "claim",
                        args: [runHash],
                        account: address,
                      });
                      gas = bufferedGas(estimated, CLAIM_GAS_FLOOR);
                    }
                  } catch {
                    gas = CLAIM_GAS_FLOOR;
                  }
                  writeClaim({
                    address: REWARD_CONTRACT_ADDRESS,
                    abi: MILESTONE_REWARD_ABI,
                    functionName: "claim",
                    args: [runHash],
                    chainId: monadTestnet.id,
                    gas,
                  });
                })();
              }
            }}
          >
            {primaryLabel}
          </Button>
        )}

        {explorerTx && (
          <LinkButton
            block
            href={`${EXPLORER_URL}/tx/${explorerTx}`}
            target="_blank"
            rel="noreferrer"
          >
            View on MonadVision
          </LinkButton>
        )}

        <Button variant="ghost" block onClick={onBack} disabled={busy}>
          Back to summary
        </Button>
      </div>
    </section>
  );
}
