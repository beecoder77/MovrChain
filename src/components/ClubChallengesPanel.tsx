import { useEffect, useRef, useState } from "react";
import { useReadContract, useReadContracts, type UseWriteContractReturnType } from "wagmi";
import { monadTestnet } from "viem/chains";
import { zeroAddress, type PublicClient } from "viem";
import {
  APPROVE_CHALLENGE_GAS,
  CANCEL_CHALLENGE_GAS,
  challengesLive,
  CLUB_CHALLENGES,
  CLUB_CHALLENGES_ABI,
  CompletionStatus,
  CREATE_CHALLENGE_GAS,
  durationLabel,
  DurationUnit,
  formatTimeLeft,
  completionLabel,
  SETTLE_CHALLENGE_GAS,
  SUBMIT_CHALLENGE_GAS,
  type ParsedChallenge,
} from "../lib/clubChallenges";
import { bufferedClubGas, CLUB_TREASURY_ABI } from "../lib/clubs";
import { formatMovr, parseMovrInput } from "../lib/achievements";
import {
  memberDisplayLabel,
  parseProfile,
  PROFILE_ABI,
  PROFILE_ADDRESS,
} from "../lib/profile";
import { formatWalletError } from "../lib/errors";
import { Alert, Button } from "../design-system/components";

type ClubChallengesPanelProps = {
  clubId: bigint;
  address: `0x${string}`;
  treasury: `0x${string}` | undefined;
  members: readonly `0x${string}`[];
  isMember: boolean;
  isManager: boolean;
  busy: boolean;
  /** True when the last write was rejected or the receipt reverted — unlock local pending. */
  txFailed: boolean;
  /** Parent wallet / receipt warning — shown inline when the create form is open. */
  parentWarning?: string | null;
  challenges: ParsedChallenge[];
  onRefresh: () => void;
  onWrite: (fn: () => void) => void;
  onWarn: (message: string) => void;
  writeContract: UseWriteContractReturnType["writeContract"];
  publicClient: PublicClient | undefined;
};

export function ClubChallengesPanel({
  clubId,
  address,
  treasury,
  members,
  isMember,
  isManager,
  busy,
  txFailed,
  parentWarning = null,
  challenges,
  onWrite,
  onWarn,
  writeContract,
  publicClient,
}: ClubChallengesPanelProps) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState("");
  const [duration, setDuration] = useState("7");
  const [unit, setUnit] = useState(String(DurationUnit.Days));
  const [reward, setReward] = useState("5");
  /** Inline form errors — footer alerts are below the fold on long club pages. */
  const [formError, setFormError] = useState<string | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  /** Locks the form during async gas estimate before wagmi `isPending` flips. */
  const [creating, setCreating] = useState(false);
  /** Challenge ids optimistically marked pending so Mark complete cannot be spam-clicked. */
  const [optimisticPending, setOptimisticPending] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [actionPending, setActionPending] = useState(false);
  /** Sync guard — setState alone can miss a double-click in the same tick. */
  const submitGuardRef = useRef<string | null>(null);
  const locked = busy || creating || actionPending;

  const showFormError = (message: string) => {
    setFormError(message);
    onWarn(message);
    requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const dropOptimistic = (key: string) => {
    setOptimisticPending((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // Unlock on wallet reject / on-chain revert — only drop the submit that failed.
  useEffect(() => {
    if (txFailed) {
      setCreating(false);
      setActionPending(false);
      const key = submitGuardRef.current;
      if (key) {
        dropOptimistic(key);
        submitGuardRef.current = null;
      }
    }
  }, [txFailed]);

  useEffect(() => {
    if (!busy) {
      setCreating(false);
      setActionPending(false);
      // Keep optimistic Pending until chain status catches up; clear sync guard so
      // other challenges remain actionable.
      if (!txFailed) {
        submitGuardRef.current = null;
      }
    }
  }, [busy, txFailed]);

  const { data: availableRaw, refetch: refetchAvailable } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "available",
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(treasury) && treasury !== zeroAddress,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
    },
  });
  const available = (availableRaw as bigint | undefined) ?? 0n;

  // After donate / any club tx settles, pull a fresh available balance.
  useEffect(() => {
    if (!busy && treasury && treasury !== zeroAddress) {
      void refetchAvailable();
    }
  }, [busy, treasury, refetchAvailable]);

  // Drop stale "not enough treasury" copy once the live balance covers the reward.
  useEffect(() => {
    const rewardWei = parseMovrInput(reward);
    if (
      formError?.includes("available") &&
      rewardWei !== null &&
      rewardWei > 0n &&
      available >= rewardWei
    ) {
      setFormError(null);
    }
  }, [available, reward, formError]);

  const statusReads = useReadContracts({
    contracts: challenges.flatMap((c) =>
      members.map((m) => ({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "completionStatus" as const,
        args: [c.id, m] as const,
        chainId: monadTestnet.id,
      })),
    ),
    query: {
      enabled: challengesLive() && challenges.length > 0 && members.length > 0,
      staleTime: 0,
      refetchOnMount: "always",
      // Poll until optimistic Pending is confirmed on-chain (avoids minutes-old cache).
      refetchInterval: optimisticPending.size > 0 ? 2_000 : false,
    },
  });

  // After any write settles, refresh completion statuses immediately (avoid minutes-old cache).
  useEffect(() => {
    if (!busy) {
      void statusReads.refetch();
    }
  }, [busy, statusReads.refetch]);

  // If a submit write failed/reverted, re-read chain status — a prior success may already be Pending.
  useEffect(() => {
    if (txFailed) {
      void statusReads.refetch();
    }
  }, [txFailed, statusReads.refetch]);

  // Once chain confirms Pending/Approved/Rejected, drop matching optimistic entries.
  useEffect(() => {
    if (!statusReads.data || optimisticPending.size === 0) return;
    setOptimisticPending((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const key of prev) {
        const challengeId = BigInt(key);
        const idx = challenges.findIndex((c) => c.id === challengeId);
        if (idx < 0) continue;
        const mi = members.findIndex(
          (m) => m.toLowerCase() === address.toLowerCase(),
        );
        if (mi < 0) continue;
        const row = statusReads.data?.[idx * members.length + mi];
        if (row?.status === "success" && Number(row.result) > CompletionStatus.None) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [statusReads.data, optimisticPending, challenges, members, address]);

  const profileReads = useReadContracts({
    contracts: members.map((m) => ({
      address: PROFILE_ADDRESS,
      abi: PROFILE_ABI,
      functionName: "getProfile" as const,
      args: [m] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: members.length > 0, staleTime: 15_000 },
  });

  const statusFor = (challengeId: bigint, member: string): number => {
    const idx = challenges.findIndex((c) => c.id === challengeId);
    if (idx < 0) return CompletionStatus.None;
    const mi = members.findIndex((m) => m.toLowerCase() === member.toLowerCase());
    if (mi < 0) return CompletionStatus.None;
    const row = statusReads.data?.[idx * members.length + mi];
    if (row?.status === "success") {
      const onChain = Number(row.result);
      if (onChain > CompletionStatus.None) return onChain;
    }
    // Optimistic: hide Mark complete immediately after a successful submit click.
    if (
      member.toLowerCase() === address.toLowerCase() &&
      optimisticPending.has(challengeId.toString())
    ) {
      return CompletionStatus.Pending;
    }
    return CompletionStatus.None;
  };

  const memberLabel = (m: `0x${string}`, i: number) => {
    const row = profileReads.data?.[i];
    const profile =
      row?.status === "success" ? parseProfile(row.result) : undefined;
    return memberDisplayLabel(profile, m);
  };

  const handleCreate = () => {
    if (locked) return;
    setFormError(null);
    if (!isManager) {
      showFormError("Only the club Captain or Admins can create challenges.");
      return;
    }
    const dur = Number(duration);
    const rewardWei = parseMovrInput(reward);
    const unitNum = Number(unit);
    const maxDur = unitNum === DurationUnit.Months ? 3 : 90;
    if (!rule.trim() || !Number.isFinite(dur) || dur <= 0 || dur > maxDur) {
      showFormError("Add a rule and a valid duration (max 90 days / 3 months).");
      return;
    }
    if (!rewardWei || rewardWei === 0n) {
      showFormError("Enter a reward greater than zero.");
      return;
    }

    setCreating(true);
    void (async () => {
      // Always read live available — cached value goes stale after donate.
      const fresh = await refetchAvailable();
      const liveAvailable =
        (fresh.data as bigint | undefined) ??
        (availableRaw as bigint | undefined) ??
        0n;

      if (rewardWei > liveAvailable) {
        setCreating(false);
        showFormError(
          `Treasury only has ${formatMovr(liveAvailable)} MOVR available (unreserved). Lower the reward or free reserved proposal funds.`,
        );
        return;
      }

      const args = [clubId, rule.trim(), unitNum, dur, rewardWei] as const;
      let gas = CREATE_CHALLENGE_GAS;
      try {
        if (publicClient) {
          const est = await publicClient.estimateContractGas({
            address: CLUB_CHALLENGES,
            abi: CLUB_CHALLENGES_ABI,
            functionName: "createChallenge",
            args,
            account: address,
          });
          gas = bufferedClubGas(est, CREATE_CHALLENGE_GAS);
        }
      } catch (e) {
        setCreating(false);
        void refetchAvailable();
        showFormError(
          formatWalletError(e instanceof Error ? e : new Error(String(e))) ??
            "Cannot create this challenge. Check manager role and treasury balance.",
        );
        return;
      }
      onWrite(() => {
        try {
          writeContract({
            address: CLUB_CHALLENGES,
            abi: CLUB_CHALLENGES_ABI,
            functionName: "createChallenge",
            args,
            chainId: monadTestnet.id,
            gas,
          });
        } catch (e) {
          setCreating(false);
          showFormError(
            formatWalletError(e instanceof Error ? e : new Error(String(e))) ??
              "Could not open wallet to create the challenge.",
          );
        }
      });
    })();
  };

  const handleSubmit = (challengeId: bigint) => {
    const key = challengeId.toString();
    if (locked || submitGuardRef.current) return;
    if (optimisticPending.has(key)) return;
    if (statusFor(challengeId, address) !== CompletionStatus.None) return;

    submitGuardRef.current = key;
    setActionPending(true);
    setOptimisticPending((prev) => new Set(prev).add(key));
    setFormError(null);

    onWrite(() => {
      try {
        writeContract({
          address: CLUB_CHALLENGES,
          abi: CLUB_CHALLENGES_ABI,
          functionName: "submitCompletion",
          args: [challengeId],
          chainId: monadTestnet.id,
          gas: SUBMIT_CHALLENGE_GAS,
        });
      } catch (e) {
        submitGuardRef.current = null;
        setActionPending(false);
        dropOptimistic(key);
        showFormError(
          formatWalletError(e instanceof Error ? e : new Error(String(e))) ??
            "Could not submit completion.",
        );
      }
    });
  };

  const handleApprove = (challengeId: bigint, member: `0x${string}`) => {
    if (locked) return;
    setActionPending(true);
    onWrite(() =>
      writeContract({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "approveCompletion",
        args: [challengeId, member],
        chainId: monadTestnet.id,
        gas: APPROVE_CHALLENGE_GAS,
      }),
    );
  };

  const handleReject = (challengeId: bigint, member: `0x${string}`) => {
    if (locked) return;
    setActionPending(true);
    onWrite(() =>
      writeContract({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "rejectCompletion",
        args: [challengeId, member],
        chainId: monadTestnet.id,
        gas: APPROVE_CHALLENGE_GAS,
      }),
    );
  };

  const handleSettle = (challengeId: bigint) => {
    if (locked) return;
    setActionPending(true);
    onWrite(() =>
      writeContract({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "settle",
        args: [challengeId],
        chainId: monadTestnet.id,
        gas: SETTLE_CHALLENGE_GAS,
      }),
    );
  };

  const handleCancelChallenge = (challengeId: bigint) => {
    if (locked) return;
    setActionPending(true);
    onWrite(() =>
      writeContract({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "cancelChallenge",
        args: [challengeId],
        chainId: monadTestnet.id,
        gas: CANCEL_CHALLENGE_GAS,
      }),
    );
  };

  if (!challengesLive()) {
    return (
      <section className="club-detail__panel" aria-labelledby="challenge-h">
        <h2 id="challenge-h" className="club-detail__panel-title">
          Challenges
        </h2>
        <p className="club-detail__hint">
          Deploy club challenges on Monad and set{" "}
          <code>VITE_CLUB_CHALLENGES</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="club-detail__panel" aria-labelledby="challenge-h">
      <h2 id="challenge-h" className="club-detail__panel-title">
        Challenges
      </h2>
      <p className="club-detail__hint">
        Free-form rules, treasury reward (Captain/Admin create), equal split
        when the timer ends. Max duration 90 days.
      </p>

      {isManager && !open && (
        <Button
          variant="secondary"
          block
          disabled={locked}
          onClick={() => {
            setFormError(null);
            setOpen(true);
            void refetchAvailable();
          }}
        >
          Start a challenge
        </Button>
      )}

      {isManager && open && (
        <div className="club-detail__propose-form">
          {(formError || parentWarning) && (
            <div ref={formErrorRef}>
              <Alert tone="warning">{formError ?? parentWarning}</Alert>
            </div>
          )}
          <input
            className="clubs-screen__input"
            placeholder="Challenge rule (any text)"
            value={rule}
            disabled={locked}
            maxLength={280}
            onChange={(e) => {
              setFormError(null);
              setRule(e.target.value);
            }}
          />
          <div className="club-challenge__duration-row">
            <input
              className="clubs-screen__input club-challenge__duration-input"
              type="number"
              min={1}
              max={90}
              value={duration}
              disabled={locked}
              onChange={(e) => {
                setFormError(null);
                setDuration(e.target.value);
              }}
              aria-label="Duration amount"
            />
            <select
              className="clubs-screen__input club-challenge__unit-select"
              value={unit}
              disabled={locked}
              onChange={(e) => {
                setFormError(null);
                setUnit(e.target.value);
              }}
              aria-label="Duration unit"
            >
              <option value={String(DurationUnit.Hours)}>Hours</option>
              <option value={String(DurationUnit.Days)}>Days</option>
              <option value={String(DurationUnit.Months)}>Months (max 3)</option>
            </select>
          </div>
          <input
            className="clubs-screen__input"
            placeholder="Reward MOVR (from treasury)"
            value={reward}
            disabled={locked}
            onChange={(e) => {
              setFormError(null);
              setReward(e.target.value);
            }}
          />
          <p className="club-detail__hint">
            Available in treasury: {formatMovr(available)} MOVR (excludes funds
            reserved by active proposals). Updates after donations settle.
          </p>
          <Button
            block
            loading={locked}
            disabled={locked}
            onClick={handleCreate}
          >
            {locked ? "Confirming…" : "Confirm challenge"}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={locked}
            onClick={() => {
              setFormError(null);
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <ul className="club-challenge-list">
        {challenges.map((c) => {
          const ended = Number(c.endAt) * 1000 <= Date.now();
          const active = c.state === 0 && !ended;
          const myStatus = statusFor(c.id, address);
          const pendingMembers = members.filter(
            (m) => statusFor(c.id, m) === CompletionStatus.Pending,
          );

          return (
            <li key={c.id.toString()} className="club-challenge-card">
              <p className="club-challenge-card__rule">{c.rule}</p>
              <p className="club-challenge-card__meta">
                {formatMovr(c.rewardPool)} MOVR ·{" "}
                {durationLabel(c.unit, c.duration)} ·{" "}
                {active ? formatTimeLeft(c.endAt) : ended ? "Ended" : "Settled"}
                {c.approvedCount > 0 ? ` · ${c.approvedCount} approved` : ""}
              </p>

              {isMember && active && myStatus === CompletionStatus.None && (
                <Button
                  variant="secondary"
                  block
                  loading={locked}
                  disabled={locked}
                  onClick={() => handleSubmit(c.id)}
                >
                  {locked ? "Submitting…" : "Mark complete"}
                </Button>
              )}
              {isMember && myStatus > 0 && (
                <p className="club-challenge-card__you">
                  You: {completionLabel(myStatus)}
                </p>
              )}

              {isManager && active && pendingMembers.length > 0 && (
                <ul className="club-challenge-card__pending">
                  {pendingMembers.map((m) => {
                    const mi = members.indexOf(m);
                    return (
                      <li key={m} className="club-challenge-card__pending-row">
                        <span>{memberLabel(m, mi)}</span>
                        <div className="club-challenge-card__pending-actions">
                          <button
                            type="button"
                            className="club-detail__role-action"
                            disabled={locked}
                            onClick={() => handleApprove(c.id, m)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="club-detail__role-action"
                            disabled={locked}
                            onClick={() => handleReject(c.id, m)}
                          >
                            Reject
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isManager && active && (
                <Button
                  variant="ghost"
                  block
                  disabled={locked}
                  onClick={() => handleCancelChallenge(c.id)}
                >
                  Cancel challenge — refund treasury
                </Button>
              )}

              {c.state === 0 && ended && (
                <Button
                  block
                  disabled={locked}
                  onClick={() => handleSettle(c.id)}
                >
                  Settle — split reward to approved members
                </Button>
              )}
            </li>
          );
        })}
        {challenges.length === 0 && (
          <li className="club-donor-board__empty">No challenges yet.</li>
        )}
      </ul>
    </section>
  );
}

export function ClubChallengePins({
  challenges,
}: {
  challenges: ParsedChallenge[];
}) {
  const active = challenges.filter(
    (c) => c.state === 0 && Number(c.endAt) * 1000 > Date.now(),
  );
  if (active.length === 0) return null;
  return (
    <div className="club-card__challenges">
      {active.slice(0, 2).map((c) => (
        <span key={c.id.toString()} className="club-card__challenge-pill">
          {c.rule.length > 36 ? `${c.rule.slice(0, 36)}…` : c.rule} ·{" "}
          {formatTimeLeft(c.endAt)}
        </span>
      ))}
      {active.length > 2 && (
        <span className="club-card__challenge-pill">
          +{active.length - 2} more
        </span>
      )}
    </div>
  );
}
