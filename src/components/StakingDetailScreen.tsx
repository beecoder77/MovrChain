import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatUnits, zeroAddress } from "viem";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monadTestnet } from "viem/chains";
import {
  APPROVE_GAS,
  CLAIM_REWARD_GAS,
  ERC20_ABI,
  formatBoostBps,
  formatMovr,
  MOVR_TOKEN,
  parseMovrInput,
  projectStakingRewards,
  STAKE_GAS,
  STAKING_ABI,
  STAKING_CONTRACT,
  UNSTAKE_GAS,
} from "../lib/achievements";
import {
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  formatDonateBps,
  MAX_DONATE_BPS,
  MIN_DONATE_BPS,
  SET_DONATE_BPS_GAS,
} from "../lib/clubs";
import { formatWalletError } from "../lib/errors";
import { refetchAfterTx } from "../lib/refetchAfterTx";
import { useAfterConfirmedTx } from "../lib/useAfterConfirmedTx";
import { Alert, Button } from "../design-system/components";

type StakingDetailScreenProps = {
  /** Stake subject — writes only when equal to viewerAddress */
  address: `0x${string}`;
  viewerAddress: `0x${string}`;
  onBack?: () => void;
};

function parseDonatePreviewBps(
  input: string,
  fallbackBps: number,
): number {
  const pct = Number(input);
  if (!Number.isFinite(pct) || pct < 0) return fallbackBps;
  if (pct === 0) return 0;
  const bps = Math.round(pct * 100);
  if (bps < MIN_DONATE_BPS || bps > MAX_DONATE_BPS) return fallbackBps;
  return bps;
}

function stakeAmountFromRaw(stakeRaw: unknown): bigint {
  if (stakeRaw && Array.isArray(stakeRaw)) return stakeRaw[0] as bigint;
  if (stakeRaw && typeof stakeRaw === "object" && "amount" in stakeRaw) {
    return (stakeRaw as { amount: bigint }).amount;
  }
  return 0n;
}

export function StakingDetailScreen({
  address,
  viewerAddress,
  onBack,
}: StakingDetailScreenProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("10");
  const [donateInput, setDonateInput] = useState("2.5");
  const [warning, setWarning] = useState<string | null>(null);
  const canAct = viewerAddress.toLowerCase() === address.toLowerCase();
  const clubsLive = CLUB_REGISTRY !== zeroAddress;

  const { data: stakeRaw, refetch: refetchStake } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "stakes",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: pending, refetch: refetchPending } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "pendingReward",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: boostBps } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "boostBpsOf",
    args: [address],
    chainId: monadTestnet.id,
  });

  const { data: baseRateRaw } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "rewardPerTokenPerSecond",
    chainId: monadTestnet.id,
  });

  const { data: walletBalance, refetch: refetchBal } = useReadContract({
    address: MOVR_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: MOVR_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address, STAKING_CONTRACT],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: donateBpsRaw, refetch: refetchDonate } = useReadContract({
    address: STAKING_CONTRACT,
    abi: STAKING_ABI,
    functionName: "donateBps",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const { data: clubIdRaw } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: clubsLive },
  });

  const donateBps = Number(donateBpsRaw ?? 0);
  const inClub = Boolean(clubIdRaw && (clubIdRaw as bigint) > 0n);

  const staked = stakeAmountFromRaw(stakeRaw);
  const pendingWei = (pending as bigint | undefined) ?? 0n;
  const boost = Number(boostBps ?? 0n);
  const baseRate = (baseRateRaw as bigint | undefined) ?? 0n;
  const balance = (walletBalance as bigint | undefined) ?? 0n;
  const allow = (allowance as bigint | undefined) ?? 0n;

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
    pollingInterval: 1_000,
  });

  const receiptReverted = receipt?.status === "reverted";

  const syncing = useAfterConfirmedTx(
    txHash,
    isSuccess,
    receiptReverted,
    async () => {
      await refetchAfterTx(
        [
          () => refetchStake(),
          () => refetchPending(),
          () => refetchBal(),
          () => refetchAllowance(),
          () => refetchDonate(),
        ],
        { queryClient },
      );
      setWarning(null);
    },
  );

  const busy = isPending || confirming || syncing;

  useEffect(() => {
    if (writeError) setWarning(formatWalletError(writeError));
    else if (receiptFailed || receiptReverted)
      setWarning(
        formatWalletError(receiptError ?? new Error("Transaction reverted on Monad")),
      );
  }, [writeError, receiptFailed, receiptError, receiptReverted]);

  const run = (fn: () => void) => {
    setWarning(null);
    reset();
    fn();
  };

  const parsed = parseMovrInput(amount);
  const needsApprove = parsed !== null && parsed > 0n && allow < parsed;

  /** Project on current stake; if none, use the amount field as a what-if. */
  const projectionPrincipal = staked > 0n ? staked : (parsed ?? 0n);
  const projectionIsPreview = staked === 0n && projectionPrincipal > 0n;
  const previewDonateBps = parseDonatePreviewBps(donateInput, donateBps);

  const projection = useMemo(
    () =>
      projectStakingRewards({
        amount: projectionPrincipal,
        rewardPerTokenPerSecond: baseRate,
        boostBps: boost,
        donateBps: previewDonateBps,
      }),
    [projectionPrincipal, baseRate, boost, previewDonateBps],
  );

  const handleApprove = () => {
    if (!canAct) {
      setWarning("You can only stake from your own wallet.");
      return;
    }
    if (!parsed || parsed === 0n) {
      setWarning("Enter a valid MOVR amount.");
      return;
    }
    run(() =>
      writeContract({
        address: MOVR_TOKEN,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [STAKING_CONTRACT, parsed],
        chainId: monadTestnet.id,
        gas: APPROVE_GAS,
      }),
    );
  };

  const handleStake = () => {
    if (!canAct) {
      setWarning("You can only stake from your own wallet.");
      return;
    }
    if (!parsed || parsed === 0n) {
      setWarning("Enter a valid MOVR amount.");
      return;
    }
    if (parsed > balance) {
      setWarning("Not enough MOVR in your wallet.");
      return;
    }
    if (allow < parsed) {
      setWarning("Approve MOVR for staking first.");
      return;
    }
    run(() =>
      writeContract({
        address: STAKING_CONTRACT,
        abi: STAKING_ABI,
        functionName: "stake",
        args: [parsed],
        chainId: monadTestnet.id,
        gas: STAKE_GAS,
      }),
    );
  };

  const handleUnstake = () => {
    if (!canAct) {
      setWarning("You can only unstake from your own wallet.");
      return;
    }
    if (!parsed || parsed === 0n) {
      setWarning("Enter a valid MOVR amount.");
      return;
    }
    if (parsed > staked) {
      setWarning("You can't unstake more than you've staked.");
      return;
    }
    run(() =>
      writeContract({
        address: STAKING_CONTRACT,
        abi: STAKING_ABI,
        functionName: "unstake",
        args: [parsed],
        chainId: monadTestnet.id,
        gas: UNSTAKE_GAS,
      }),
    );
  };

  const handleSetDonate = () => {
    if (!canAct) {
      setWarning("You can only set donate from your wallet.");
      return;
    }
    const pct = Number(donateInput);
    if (!Number.isFinite(pct)) {
      setWarning("Enter a percent between 2 and 5, or 0 to turn off.");
      return;
    }
    let bps = Math.round(pct * 100);
    if (pct === 0) bps = 0;
    else if (bps < MIN_DONATE_BPS || bps > MAX_DONATE_BPS) {
      setWarning("Donate must be 2–5% (200–500 bps), or 0 to disable.");
      return;
    }
    if (bps > 0 && !inClub) {
      setWarning("Join a club before enabling yield donate.");
      return;
    }
    run(() =>
      writeContract({
        address: STAKING_CONTRACT,
        abi: STAKING_ABI,
        functionName: "setDonateBps",
        args: [bps],
        chainId: monadTestnet.id,
        gas: SET_DONATE_BPS_GAS,
      }),
    );
  };

  const handleClaim = () => {
    if (!canAct) {
      setWarning("You can only claim rewards for your own wallet.");
      return;
    }
    if (pendingWei === 0n) {
      setWarning("No rewards to claim yet.");
      return;
    }
    run(() =>
      writeContract({
        address: STAKING_CONTRACT,
        abi: STAKING_ABI,
        functionName: "claim",
        chainId: monadTestnet.id,
        gas: CLAIM_REWARD_GAS,
      }),
    );
  };

  const showClubSplit = previewDonateBps > 0;

  let projectionMeta = "Stake or enter an amount to project yield.";
  if (projectionPrincipal > 0n) {
    const basis = projectionIsPreview
      ? `If you stake ${formatMovr(projectionPrincipal)} MOVR`
      : `On ${formatMovr(projectionPrincipal)} MOVR staked`;
    const donateLabel = showClubSplit
      ? ` · ${formatDonateBps(previewDonateBps)} to club`
      : " · no club donate";
    projectionMeta = `${basis} · ${formatBoostBps(boost)} boost${donateLabel}`;
  }

  let primaryAction: ReactNode = null;
  if (canAct && needsApprove) {
    primaryAction = (
      <Button block loading={busy} disabled={busy} onClick={handleApprove}>
        {busy ? "Approving…" : "Approve MOVR"}
      </Button>
    );
  } else if (canAct) {
    primaryAction = (
      <Button block loading={busy} disabled={busy} onClick={handleStake}>
        {busy ? "Staking…" : "Stake MOVR"}
      </Button>
    );
  }

  return (
    <section className="stack-detail" aria-labelledby="staking-heading">
      <header className="stack-detail__header">
        <h1 id="staking-heading" className="stack-detail__title">
          Staking
        </h1>
        <p className="stack-detail__sub">
          Stake MOVR for boost and rewards. Optionally donate 2–5% of claim
          yield to your club treasury — top donors earn 3× voting power.
        </p>
      </header>

      <div className="stack-detail__stats" aria-label="Stake summary">
        <div className="stack-detail__stat">
          <span className="stack-detail__stat-value">
            {formatMovr(staked)}
          </span>
          <span className="stack-detail__stat-label">Staked MOVR</span>
        </div>
        <div className="stack-detail__stat">
          <span className="stack-detail__stat-value">
            {formatMovr(pendingWei)}
          </span>
          <span className="stack-detail__stat-label">Pending rewards</span>
        </div>
        <div className="stack-detail__stat">
          <span className="stack-detail__stat-value">
            {formatBoostBps(boost)}
          </span>
          <span className="stack-detail__stat-label">NFT + club boost</span>
        </div>
        <div className="stack-detail__stat">
          <span className="stack-detail__stat-value">
            {formatMovr(balance)}
          </span>
          <span className="stack-detail__stat-label">Wallet MOVR</span>
        </div>
      </div>

      <div
        className="stack-detail__projection"
        aria-label="Expected rewards"
      >
        <div className="stack-detail__projection-head">
          <h2 className="stack-detail__projection-title">Expected rewards</h2>
          <p className="stack-detail__projection-meta">{projectionMeta}</p>
        </div>

        {projectionPrincipal === 0n ? (
          <p className="stack-detail__projection-empty">
            Projections use your live rate (base + achievement & club-badge
            boost) and optional club yield donate on claim.
          </p>
        ) : (
          <table className="stack-detail__proj-table">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">You keep</th>
                {showClubSplit && <th scope="col">Club yield</th>}
                <th scope="col">Gross</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Day", projection.day],
                  ["Month", projection.month],
                  ["Year", projection.year],
                ] as const
              ).map(([label, row]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{formatMovr(row.kept, 6)} MOVR</td>
                  {showClubSplit && (
                    <td>{formatMovr(row.club, 6)} MOVR</td>
                  )}
                  <td>{formatMovr(row.gross, 6)} MOVR</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <label className="stack-detail__field">
        <span className="stack-detail__field-label">Amount (MOVR)</span>
        <input
          className="stack-detail__input"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10"
          disabled={busy || !canAct}
        />
        <button
          type="button"
          className="stack-detail__max"
          onClick={() =>
            setAmount(formatUnits(balance > 0n ? balance : 0n, 18))
          }
          disabled={busy || !canAct || balance === 0n}
        >
          Max wallet
        </button>
      </label>

      <div className="stack-detail__donate">
        <p className="stack-detail__field-label">
          Club treasury donate (now{" "}
          {donateBps > 0 ? formatDonateBps(donateBps) : "off"})
        </p>
        <p className="stack-detail__donate-copy">
          On each claim, this % of rewards goes to your club treasury. Members:
          1× vote · Club NFT: 2× · Top 3 donors: 3×. Projections above update
          as you edit this %.
        </p>
        <div className="stack-detail__donate-row">
          <input
            className="stack-detail__input"
            type="text"
            inputMode="decimal"
            value={donateInput}
            onChange={(e) => setDonateInput(e.target.value)}
            placeholder="2.5"
            disabled={busy || !canAct}
            aria-label="Donate percent"
          />
          <span className="stack-detail__donate-unit">%</span>
        </div>
        {canAct && (
          <Button
            variant="secondary"
            block
            loading={busy}
            disabled={busy}
            onClick={handleSetDonate}
          >
            Save donate %
          </Button>
        )}
      </div>

      {!canAct && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          View only — staking actions are locked to your connected wallet.
        </Alert>
      )}

      {warning && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          {warning}
        </Alert>
      )}

      {isSuccess && !warning && canAct && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          Transaction confirmed on Monad.
        </Alert>
      )}

      <div className="stack-detail__actions">
        {primaryAction}
        {canAct && (
          <>
            <Button
              variant="secondary"
              block
              loading={busy}
              disabled={busy || staked === 0n}
              onClick={handleUnstake}
            >
              Unstake
            </Button>
            <Button
              variant="secondary"
              block
              loading={busy}
              disabled={busy || pendingWei === 0n}
              onClick={handleClaim}
            >
              Claim rewards
            </Button>
          </>
        )}
        {onBack && (
          <Button variant="ghost" block onClick={onBack} disabled={busy && canAct}>
            Back
          </Button>
        )}
      </div>
    </section>
  );
}
