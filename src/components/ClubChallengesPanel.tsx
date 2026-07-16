import { useReadContracts, type UseWriteContractReturnType } from "wagmi";
import { monadTestnet } from "viem/chains";
import type { PublicClient } from "viem";
import {
  APPROVE_CHALLENGE_GAS,
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
import { bufferedClubGas } from "../lib/clubs";
import { formatMovr, parseMovrInput } from "../lib/achievements";
import {
  memberDisplayLabel,
  parseProfile,
  PROFILE_ABI,
  PROFILE_ADDRESS,
} from "../lib/profile";
import { Button } from "../design-system/components";
import { useState } from "react";

type ClubChallengesPanelProps = {
  clubId: bigint;
  address: `0x${string}`;
  members: readonly `0x${string}`[];
  isMember: boolean;
  isManager: boolean;
  busy: boolean;
  challenges: ParsedChallenge[];
  onRefresh: () => void;
  onWrite: (fn: () => void) => void;
  writeContract: UseWriteContractReturnType["writeContract"];
  publicClient: PublicClient | undefined;
};

export function ClubChallengesPanel({
  clubId,
  address,
  members,
  isMember,
  isManager,
  busy,
  challenges,
  onWrite,
  writeContract,
  publicClient,
}: ClubChallengesPanelProps) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState("");
  const [duration, setDuration] = useState("7");
  const [unit, setUnit] = useState(String(DurationUnit.Days));
  const [reward, setReward] = useState("5");

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
      staleTime: 4_000,
    },
  });

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
    if (!row || row.status !== "success") return CompletionStatus.None;
    return Number(row.result);
  };

  const memberLabel = (m: `0x${string}`, i: number) => {
    const row = profileReads.data?.[i];
    const profile =
      row?.status === "success" ? parseProfile(row.result) : undefined;
    return memberDisplayLabel(profile, m);
  };

  const handleCreate = () => {
    const dur = Number(duration);
    const rewardWei = parseMovrInput(reward);
    if (!rule.trim() || !Number.isFinite(dur) || dur <= 0) return;
    if (!rewardWei || rewardWei === 0n) return;
    onWrite(() => {
      void (async () => {
        let gas = CREATE_CHALLENGE_GAS;
        try {
          if (publicClient) {
            const est = await publicClient.estimateContractGas({
              address: CLUB_CHALLENGES,
              abi: CLUB_CHALLENGES_ABI,
              functionName: "createChallenge",
              args: [clubId, rule.trim(), Number(unit), dur, rewardWei],
              account: address,
            });
            gas = bufferedClubGas(est, CREATE_CHALLENGE_GAS);
          }
        } catch {
          gas = CREATE_CHALLENGE_GAS;
        }
        writeContract({
          address: CLUB_CHALLENGES,
          abi: CLUB_CHALLENGES_ABI,
          functionName: "createChallenge",
          args: [clubId, rule.trim(), Number(unit), dur, rewardWei],
          chainId: monadTestnet.id,
          gas,
        });
      })();
    });
  };

  const handleSubmit = (challengeId: bigint) => {
    onWrite(() =>
      writeContract({
        address: CLUB_CHALLENGES,
        abi: CLUB_CHALLENGES_ABI,
        functionName: "submitCompletion",
        args: [challengeId],
        chainId: monadTestnet.id,
        gas: SUBMIT_CHALLENGE_GAS,
      }),
    );
  };

  const handleApprove = (challengeId: bigint, member: `0x${string}`) => {
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
        Free-form rules, treasury reward, Captain/Admin approval, equal split
        when the timer ends.
      </p>

      {isMember && !open && (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          Start a challenge
        </Button>
      )}

      {isMember && open && (
        <div className="club-detail__propose-form">
          <input
            className="clubs-screen__input"
            placeholder="Challenge rule (any text)"
            value={rule}
            disabled={busy}
            maxLength={280}
            onChange={(e) => setRule(e.target.value)}
          />
          <div className="club-challenge__duration-row">
            <input
              className="clubs-screen__input club-challenge__duration-input"
              type="number"
              min={1}
              max={365}
              value={duration}
              disabled={busy}
              onChange={(e) => setDuration(e.target.value)}
              aria-label="Duration amount"
            />
            <select
              className="clubs-screen__input club-challenge__unit-select"
              value={unit}
              disabled={busy}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Duration unit"
            >
              <option value={String(DurationUnit.Hours)}>Hours</option>
              <option value={String(DurationUnit.Days)}>Days</option>
              <option value={String(DurationUnit.Months)}>Months</option>
            </select>
          </div>
          <input
            className="clubs-screen__input"
            placeholder="Reward MOVR (from treasury)"
            value={reward}
            disabled={busy}
            onChange={(e) => setReward(e.target.value)}
          />
          <Button block loading={busy} disabled={busy} onClick={handleCreate}>
            Confirm challenge
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy}
            onClick={() => setOpen(false)}
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
                  disabled={busy}
                  onClick={() => handleSubmit(c.id)}
                >
                  Mark complete
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
                            disabled={busy}
                            onClick={() => handleApprove(c.id, m)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="club-detail__role-action"
                            disabled={busy}
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

              {c.state === 0 && ended && (
                <Button block disabled={busy} onClick={() => handleSettle(c.id)}>
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
