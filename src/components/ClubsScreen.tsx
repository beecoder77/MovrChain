import {
  ADD_MEMBER_GAS,
  bufferedClubGas,
  buildDonationLeaderboard,
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  CLUB_TREASURY_ABI,
  CREATE_CLUB_GAS,
  DONATE_GAS,
  EXECUTE_GAS,
  PROPOSE_GAS,
  VOTE_GAS,
  parseClub,
  votePowerLabel,
} from "../lib/clubs";
import {
  APPROVE_GAS,
  ERC20_ABI,
  formatMovr,
  MOVR_TOKEN,
  parseMovrInput,
} from "../lib/achievements";
import { formatWalletError } from "../lib/errors";
import { formatAddress } from "../lib/posts";
import { EXPLORER_URL } from "../lib/wagmi";
import { Alert, Button } from "../design-system/components";
import {
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { monadTestnet } from "viem/chains";
import { useEffect, useRef, useState } from "react";
import { isAddress, zeroAddress } from "viem";

type ClubsScreenProps = {
  address: `0x${string}`;
  onOpenClub: (clubId: bigint) => void;
};

export function ClubsScreen({ address, onOpenClub }: ClubsScreenProps) {
  const [name, setName] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const deployed = CLUB_REGISTRY !== zeroAddress;

  const { data: clubIdRaw, refetch: refetchClubOf } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: deployed, staleTime: 4_000, refetchOnMount: "always" },
  });

  const clubId = (clubIdRaw as bigint | undefined) ?? 0n;

  const { data: clubRaw, refetch: refetchClub } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "getClub",
    args: clubId > 0n ? [clubId] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: deployed && clubId > 0n, staleTime: 4_000 },
  });

  const club = clubId > 0n ? parseClub(clubId, clubRaw) : null;

  const { writeContract, data: txHash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: confirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash: txHash, chainId: monadTestnet.id });

  useEffect(() => {
    if (error) setWarning(formatWalletError(error));
  }, [error]);

  useEffect(() => {
    if (!isSuccess || receipt?.status === "reverted") return;
    void refetchClubOf();
    void refetchClub();
    setName("");
    setWarning(null);
  }, [isSuccess, receipt, refetchClubOf, refetchClub]);

  const busy = isPending || confirming;

  const handleCreate = () => {
    setWarning(null);
    reset();
    const trimmed = name.trim();
    if (!trimmed) {
      setWarning("Give your club a name.");
      return;
    }
    if (trimmed.length > 32) {
      setWarning("Club name must be 32 characters or fewer.");
      return;
    }
    writeContract({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "createClub",
      args: [trimmed],
      chainId: monadTestnet.id,
      gas: CREATE_CLUB_GAS,
    });
  };

  if (!deployed) {
    return (
      <section className="clubs-screen" aria-labelledby="clubs-heading">
        <h1 id="clubs-heading" className="clubs-screen__heading">
          Clubs
        </h1>
        <div className="clubs-screen__empty">
          <p className="clubs-screen__empty-title">Clubs not deployed yet</p>
          <p className="clubs-screen__empty-body">
            Run <code>./contracts/deploy-clubs.sh</code> and set{" "}
            <code>VITE_CLUB_REGISTRY</code> (and related addresses).
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="clubs-screen" aria-labelledby="clubs-heading">
      <header className="clubs-screen__intro">
        <h1 id="clubs-heading" className="clubs-screen__heading">
          Clubs
        </h1>
        <p className="clubs-screen__sub">
          Up to 10 runners. Shared treasury. Vote on jerseys, refreshments, and
          more — yield donate boosts your voting weight.
        </p>
      </header>

      {club ? (
        <button
          type="button"
          className="club-card"
          onClick={() => onOpenClub(club.clubId)}
        >
          <div className="club-card__row">
            <span className="club-card__name">{club.name}</span>
            <span className="club-card__meta">
              {club.memberCount}/10 members
            </span>
          </div>
          <p className="club-card__cta">Open club · treasury & votes</p>
        </button>
      ) : (
        <div className="clubs-screen__create">
          <label className="clubs-screen__field">
            <span className="clubs-screen__label">Create a club</span>
            <input
              className="clubs-screen__input"
              type="text"
              maxLength={32}
              value={name}
              disabled={busy}
              placeholder="Dawn Pack"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {warning && (
            <Alert tone="warning" className="ds-alert--footer-spaced">
              {warning}
            </Alert>
          )}
          <Button block loading={busy} disabled={busy} onClick={handleCreate}>
            {busy ? "Creating on Monad…" : "Create club + treasury"}
          </Button>
          <p className="clubs-screen__hint">
            Creating mints your Club Member NFT (2× vote). You can invite up to
            9 more wallets.
          </p>
        </div>
      )}
    </section>
  );
}

type ClubDetailProps = {
  address: `0x${string}`;
  clubId: bigint;
  onBack: () => void;
};

export function ClubDetailScreen({
  address,
  clubId,
  onBack,
}: ClubDetailProps) {
  const [invite, setInvite] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("1");
  const [donateAmount, setDonateAmount] = useState("5");
  const [warning, setWarning] = useState<string | null>(null);
  const pendingDonateAction = useRef<"approve" | "donate" | null>(null);
  const publicClient = usePublicClient({ chainId: monadTestnet.id });

  const { data: clubRaw, refetch: refetchClub } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "getClub",
    args: [clubId],
    chainId: monadTestnet.id,
    query: { staleTime: 0, refetchOnMount: "always" },
  });

  const club = parseClub(clubId, clubRaw);

  const { data: membersRaw, refetch: refetchMembers } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "members",
    args: [clubId],
    chainId: monadTestnet.id,
  });

  const members = (membersRaw as `0x${string}`[] | undefined) ?? [];
  const isCreator =
    club && club.creator.toLowerCase() === address.toLowerCase();
  const isMember = members.some(
    (m) => m.toLowerCase() === address.toLowerCase(),
  );

  const treasury = club?.treasury;

  const { data: topDonorsRaw, refetch: refetchTopDonors } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "topDonors",
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury), staleTime: 4_000 },
  });

  const donationReads = useReadContracts({
    contracts: members.map((member) => ({
      address: treasury!,
      abi: CLUB_TREASURY_ABI,
      functionName: "lifetimeDonated" as const,
      args: [member] as const,
      chainId: monadTestnet.id,
    })),
    query: {
      enabled: Boolean(treasury) && members.length > 0,
      staleTime: 4_000,
      refetchOnMount: "always",
    },
  });

  const { data: myDonatedRaw, refetch: refetchMyDonated } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "lifetimeDonated",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury) && isMember, staleTime: 4_000 },
  });

  const { data: walletBalance } = useReadContract({
    address: MOVR_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: isMember },
  });

  const { data: donateAllowance, refetch: refetchAllowance } = useReadContract({
    address: MOVR_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: treasury ? [address, treasury] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury) && isMember },
  });

  const topDonors = (topDonorsRaw as `0x${string}`[] | undefined) ?? [];
  const donatedWei = (donationReads.data ?? []).map((row) =>
    row?.status === "success" ? (row.result as bigint) : 0n,
  );
  const leaderboard = buildDonationLeaderboard(
    members,
    donatedWei,
    topDonors,
    address,
  );
  const myDonated = (myDonatedRaw as bigint | undefined) ?? 0n;
  const parsedDonate = parseMovrInput(donateAmount);
  const donateAllow = (donateAllowance as bigint | undefined) ?? 0n;
  const walletBal = (walletBalance as bigint | undefined) ?? 0n;
  const needsDonateApprove =
    parsedDonate !== null && parsedDonate > 0n && donateAllow < parsedDonate;

  const { data: bal, refetch: refetchBal } = useReadContract({
    address: treasury,
    abi: [
      {
        type: "function",
        name: "balance",
        inputs: [],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ] as const,
    functionName: "balance",
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury), staleTime: 4_000 },
  });

  const { data: power } = useReadContract({
    address: treasury,
    abi: [
      {
        type: "function",
        name: "votingPower",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ] as const,
    functionName: "votingPower",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury) },
  });

  const { data: proposalCountRaw, refetch: refetchProps } = useReadContract({
    address: treasury,
    abi: [
      {
        type: "function",
        name: "proposalCount",
        inputs: [],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ] as const,
    functionName: "proposalCount",
    chainId: monadTestnet.id,
    query: { enabled: Boolean(treasury) },
  });

  const proposalCount = Number(proposalCountRaw ?? 0n);
  const latestId =
    proposalCount > 0 ? BigInt(proposalCount - 1) : undefined;

  const { data: latestProp, refetch: refetchLatest } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "getProposal",
    args: latestId !== undefined ? [latestId] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: latestId !== undefined && Boolean(treasury) },
  });

  const { data: alreadyVotedRaw, refetch: refetchHasVoted } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "hasVoted",
    args:
      latestId !== undefined && treasury
        ? [latestId, address]
        : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: latestId !== undefined && Boolean(treasury),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  const { data: canExecuteRaw, refetch: refetchCanExecute } = useReadContract({
    address: treasury,
    abi: CLUB_TREASURY_ABI,
    functionName: "canExecute",
    args: latestId !== undefined ? [latestId] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: latestId !== undefined && Boolean(treasury),
      staleTime: 4_000,
      refetchOnMount: "always",
    },
  });

  const { data: votingClosedRaw, refetch: refetchVotingClosed } =
    useReadContract({
      address: treasury,
      abi: CLUB_TREASURY_ABI,
      functionName: "votingClosed",
      args: latestId !== undefined ? [latestId] : undefined,
      chainId: monadTestnet.id,
      query: {
        enabled: latestId !== undefined && Boolean(treasury),
        staleTime: 4_000,
        refetchOnMount: "always",
      },
    });

  const { writeContract, data: txHash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: confirming, isSuccess, data: receipt } =
    useWaitForTransactionReceipt({ hash: txHash, chainId: monadTestnet.id });

  useEffect(() => {
    if (error) setWarning(formatWalletError(error));
  }, [error]);

  useEffect(() => {
    if (!isSuccess || receipt?.status === "reverted") return;
    void refetchClub();
    void refetchMembers();
    void refetchBal();
    void refetchProps();
    void refetchLatest();
    void refetchHasVoted();
    void refetchCanExecute();
    void refetchVotingClosed();
    void refetchTopDonors();
    void donationReads.refetch();
    void refetchMyDonated();
    void refetchAllowance();
    if (pendingDonateAction.current === "donate") {
      setDonateAmount("5");
    }
    pendingDonateAction.current = null;
    setWarning(null);
  }, [
    isSuccess,
    receipt,
    refetchClub,
    refetchMembers,
    refetchBal,
    refetchProps,
    refetchLatest,
    refetchHasVoted,
    refetchCanExecute,
    refetchVotingClosed,
    refetchTopDonors,
    donationReads,
    refetchMyDonated,
    refetchAllowance,
  ]);

  const busy = isPending || confirming;

  if (!club) {
    return (
      <section className="club-detail">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <p>Loading club…</p>
      </section>
    );
  }

  const run = (fn: () => void) => {
    setWarning(null);
    reset();
    fn();
  };

  const handleInvite = () => {
    const addr = invite.trim() as `0x${string}`;
    if (!isAddress(addr)) {
      setWarning("Enter a valid wallet address.");
      return;
    }
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: "addMember",
        args: [clubId, addr],
        chainId: monadTestnet.id,
        gas: ADD_MEMBER_GAS,
      }),
    );
  };

  const handlePropose = () => {
    const wei = parseMovrInput(amount);
    if (!treasury || !title.trim() || !wei || wei === 0n) {
      setWarning("Add a title and MOVR amount.");
      return;
    }
    const args = [
      title.trim(),
      reason.trim() || "Club spend",
      wei,
    ] as const;
    run(() => {
      void (async () => {
        let gas = PROPOSE_GAS;
        try {
          if (publicClient) {
            const estimated = await publicClient.estimateContractGas({
              address: treasury,
              abi: CLUB_TREASURY_ABI,
              functionName: "propose",
              args,
              account: address,
            });
            gas = bufferedClubGas(estimated, PROPOSE_GAS);
          }
        } catch {
          gas = PROPOSE_GAS;
        }
        writeContract({
          address: treasury,
          abi: CLUB_TREASURY_ABI,
          functionName: "propose",
          args,
          chainId: monadTestnet.id,
          gas,
        });
      })();
    });
  };

  const handleVote = (support: boolean) => {
    if (latestId === undefined || !treasury) return;
    run(() => {
      void (async () => {
        let gas = VOTE_GAS;
        try {
          if (publicClient) {
            const estimated = await publicClient.estimateContractGas({
              address: treasury,
              abi: CLUB_TREASURY_ABI,
              functionName: "vote",
              args: [latestId, support],
              account: address,
            });
            gas = bufferedClubGas(estimated, VOTE_GAS);
          }
        } catch {
          gas = VOTE_GAS;
        }
        writeContract({
          address: treasury,
          abi: CLUB_TREASURY_ABI,
          functionName: "vote",
          args: [latestId, support],
          chainId: monadTestnet.id,
          gas,
        });
      })();
    });
  };

  const handleExecute = () => {
    if (latestId === undefined || !treasury) return;
    run(() => {
      void (async () => {
        let gas = EXECUTE_GAS;
        try {
          if (publicClient) {
            const estimated = await publicClient.estimateContractGas({
              address: treasury,
              abi: CLUB_TREASURY_ABI,
              functionName: "execute",
              args: [latestId],
              account: address,
            });
            gas = bufferedClubGas(estimated, EXECUTE_GAS);
          }
        } catch {
          gas = EXECUTE_GAS;
        }
        writeContract({
          address: treasury,
          abi: CLUB_TREASURY_ABI,
          functionName: "execute",
          args: [latestId],
          chainId: monadTestnet.id,
          gas,
        });
      })();
    });
  };

  const handleApproveDonate = () => {
    if (!treasury || !isMember) return;
    if (!parsedDonate || parsedDonate === 0n) {
      setWarning("Enter a valid MOVR amount to donate.");
      return;
    }
    pendingDonateAction.current = "approve";
    run(() =>
      writeContract({
        address: MOVR_TOKEN,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [treasury, parsedDonate],
        chainId: monadTestnet.id,
        gas: APPROVE_GAS,
      }),
    );
  };

  const handleDonate = () => {
    if (!treasury || !isMember) return;
    if (!parsedDonate || parsedDonate === 0n) {
      setWarning("Enter a valid MOVR amount to donate.");
      return;
    }
    if (parsedDonate > walletBal) {
      setWarning("Not enough MOVR in your wallet.");
      return;
    }
    if (donateAllow < parsedDonate) {
      setWarning("Approve MOVR for the treasury first.");
      return;
    }
    pendingDonateAction.current = "donate";
    run(() => {
      void (async () => {
        let gas = DONATE_GAS;
        try {
          if (publicClient) {
            const estimated = await publicClient.estimateContractGas({
              address: treasury,
              abi: CLUB_TREASURY_ABI,
              functionName: "donate",
              args: [parsedDonate],
              account: address,
            });
            gas = bufferedClubGas(estimated, DONATE_GAS);
          }
        } catch {
          gas = DONATE_GAS;
        }
        writeContract({
          address: treasury,
          abi: CLUB_TREASURY_ABI,
          functionName: "donate",
          args: [parsedDonate],
          chainId: monadTestnet.id,
          gas,
        });
      })();
    });
  };

  let propTitle = "";
  let propReason = "";
  let propProposer = "";
  let propAmount = 0n;
  let yesW = 0n;
  let noW = 0n;
  let propState = 0;
  let voteCount = 0n;
  let createdAt = 0;
  if (latestProp) {
    if (Array.isArray(latestProp)) {
      propProposer = String(latestProp[0]);
      propTitle = String(latestProp[1]);
      propReason = String(latestProp[2]);
      propAmount = latestProp[3] as bigint;
      yesW = latestProp[4] as bigint;
      noW = latestProp[5] as bigint;
      propState = Number(latestProp[6]);
      createdAt = Number(latestProp[7]);
      voteCount = (latestProp[8] as bigint) ?? 0n;
    } else {
      const p = latestProp as unknown as Record<string, unknown>;
      propProposer = String(p.proposer ?? "");
      propTitle = String(p.title ?? "");
      propReason = String(p.reason ?? "");
      propAmount = (p.amount as bigint) ?? 0n;
      yesW = (p.yesWeight as bigint) ?? 0n;
      noW = (p.noWeight as bigint) ?? 0n;
      propState = Number(p.state ?? 0);
      createdAt = Number(p.createdAt ?? 0);
      voteCount = (p.voteCount as bigint) ?? 0n;
    }
  }

  const alreadyVoted = Boolean(alreadyVotedRaw);
  const votingPower = Number(power ?? 0n);
  const canVote = propState === 0 && !alreadyVoted && votingPower > 0;
  const passed = yesW > noW;
  const votingClosed = Boolean(votingClosedRaw);
  const canExecuteSpend = Boolean(canExecuteRaw);
  const memberTotal = club.memberCount;
  const votesNeeded = Math.max(0, memberTotal - Number(voteCount));
  const closesAtMs = createdAt > 0 ? (createdAt + 24 * 60 * 60) * 1000 : 0;
  const hoursLeft =
    closesAtMs > 0
      ? Math.max(0, Math.ceil((closesAtMs - Date.now()) / (60 * 60 * 1000)))
      : 0;
  const proposerLabel =
    propProposer &&
    propProposer.toLowerCase() === address.toLowerCase()
      ? "you"
      : propProposer
        ? formatAddress(propProposer as `0x${string}`)
        : "proposer";

  let executeHint = "";
  if (propState === 0) {
    if (!passed) {
      executeHint = "Needs a yes majority before execute.";
    } else if (!votingClosed) {
      executeHint =
        votesNeeded > 0
          ? `Execute unlocks when all ${memberTotal} members vote (${votesNeeded} left), or in ~${hoursLeft}h.`
          : `Execute unlocks when voting closes (~${hoursLeft}h left).`;
    } else if (!canExecuteSpend) {
      executeHint = "Voting closed, but this proposal did not pass.";
    }
  }

  return (
    <section className="club-detail" aria-label="Club detail">
      <header className="club-detail__header">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <h1 className="club-detail__title">{club.name}</h1>
        <p className="club-detail__sub">
          Treasury {formatMovr((bal as bigint) ?? 0n)} MOVR · Your power:{" "}
          {votePowerLabel(Number(power ?? 0n))}
        </p>
      </header>

      <div className="club-detail__stats">
        <div className="club-detail__stat">
          <span className="club-detail__stat-value">{club.memberCount}/10</span>
          <span className="club-detail__stat-label">Members</span>
        </div>
        <div className="club-detail__stat">
          <span className="club-detail__stat-value">
            {formatMovr((bal as bigint) ?? 0n)}
          </span>
          <span className="club-detail__stat-label">Treasury MOVR</span>
        </div>
      </div>

      {treasury && (
        <p className="club-detail__treasury-wallet">
          Treasury wallet{" "}
          <a
            className="club-detail__treasury-link"
            href={`${EXPLORER_URL}/address/${treasury}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {formatAddress(treasury)}
          </a>
        </p>
      )}

      <section className="club-detail__panel" aria-labelledby="donate-h">
        <h2 id="donate-h" className="club-detail__panel-title">
          Donations
        </h2>
        <p className="club-detail__hint">
          Leaderboard totals include verified runs (1 MOVR / 10 km to treasury),
          staking yield donate %, and manual gifts below. Top 3 donors earn 3×
          vote power.
        </p>

        {isMember && (
          <div className="club-detail__donate-form">
            <p className="club-detail__donate-you">
              Your lifetime: <strong>{formatMovr(myDonated)} MOVR</strong>
            </p>
            <input
              className="clubs-screen__input"
              placeholder="Amount MOVR"
              value={donateAmount}
              disabled={busy}
              onChange={(e) => setDonateAmount(e.target.value)}
              aria-label="Donate amount MOVR"
            />
            {needsDonateApprove ? (
              <Button
                block
                loading={busy}
                disabled={busy}
                onClick={handleApproveDonate}
              >
                1 · Approve MOVR
              </Button>
            ) : (
              <Button block loading={busy} disabled={busy} onClick={handleDonate}>
                2 · Donate to treasury
              </Button>
            )}
            <p className="club-detail__hint">
              {needsDonateApprove
                ? "Approve lets the treasury pull MOVR — confirm again to actually donate."
                : "Approved — tap Donate to move MOVR into the club treasury."}
            </p>
          </div>
        )}

        <ol className="club-donor-board" aria-label="Donation leaderboard">
          {leaderboard.map((entry) => (
            <li
              key={entry.address}
              className={`club-donor-board__row${
                entry.isViewer ? " club-donor-board__row--you" : ""
              }${entry.isTopDonor ? " club-donor-board__row--top" : ""}`}
            >
              <span className="club-donor-board__rank">{entry.rank}</span>
              <span className="club-donor-board__who">
                {formatAddress(entry.address)}
                {entry.isViewer ? " · you" : ""}
                {entry.isTopDonor && entry.lifetimeWei > 0n ? (
                  <span className="club-donor-board__badge">3× vote</span>
                ) : null}
              </span>
              <span className="club-donor-board__amt">
                {formatMovr(entry.lifetimeWei)} MOVR
              </span>
            </li>
          ))}
          {leaderboard.every((e) => e.lifetimeWei === 0n) && (
            <li className="club-donor-board__empty">
              No donations yet — verify runs, set staking donate %, or gift MOVR.
            </li>
          )}
        </ol>
      </section>

      <section className="club-detail__panel" aria-labelledby="members-h">
        <h2 id="members-h" className="club-detail__panel-title">
          Members
        </h2>
        <ul className="club-detail__members">
          {members.map((m) => (
            <li key={m}>
              {formatAddress(m)}
              {m.toLowerCase() === club.creator.toLowerCase() ? " · creator" : ""}
            </li>
          ))}
        </ul>
        {isCreator && club.memberCount < 10 && (
          <div className="club-detail__invite">
            <input
              className="clubs-screen__input"
              placeholder="0x… invite wallet"
              value={invite}
              disabled={busy}
              onChange={(e) => setInvite(e.target.value)}
            />
            <Button
              variant="secondary"
              block
              loading={busy}
              disabled={busy}
              onClick={handleInvite}
            >
              Add member
            </Button>
          </div>
        )}
      </section>

      <section className="club-detail__panel" aria-labelledby="propose-h">
        <h2 id="propose-h" className="club-detail__panel-title">
          Propose a spend
        </h2>
        <input
          className="clubs-screen__input"
          placeholder="Jerseys / refreshments…"
          value={title}
          disabled={busy}
          maxLength={64}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="clubs-screen__input"
          placeholder="Why this helps the club"
          value={reason}
          disabled={busy}
          maxLength={160}
          onChange={(e) => setReason(e.target.value)}
        />
        <input
          className="clubs-screen__input"
          placeholder="Amount MOVR"
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button block loading={busy} disabled={busy} onClick={handlePropose}>
          Submit proposal
        </Button>
        <p className="club-detail__hint">
          If passed, treasury MOVR is sent to whoever submitted the proposal.
        </p>
      </section>

      {latestId !== undefined && propState === 0 && (
        <section className="club-detail__panel" aria-labelledby="vote-h">
          <h2 id="vote-h" className="club-detail__panel-title">
            Active vote
          </h2>
          <p className="club-detail__prop-title">{propTitle}</p>
          <p className="club-detail__sub">{propReason}</p>
          <p className="club-detail__sub">
            {formatMovr(propAmount)} MOVR · Proposer {proposerLabel} · Yes{" "}
            {yesW.toString()} / No {noW.toString()} · Votes{" "}
            {voteCount.toString()}/{memberTotal}
          </p>
          {alreadyVoted && (
            <p className="club-detail__vote-status" role="status">
              You already voted on this proposal.
            </p>
          )}
          {!alreadyVoted && votingPower === 0 && (
            <p className="club-detail__vote-status" role="status">
              You need club membership to vote.
            </p>
          )}
          {executeHint && (
            <p className="club-detail__hint" role="status">
              {executeHint}
            </p>
          )}
          <div className="club-detail__vote-actions">
            <Button
              block
              loading={busy}
              disabled={busy || !canVote}
              onClick={() => handleVote(true)}
            >
              Vote yes
            </Button>
            <Button
              variant="secondary"
              block
              loading={busy}
              disabled={busy || !canVote}
              onClick={() => handleVote(false)}
            >
              Vote no
            </Button>
            <Button
              variant="secondary"
              block
              loading={busy}
              disabled={busy || !canExecuteSpend}
              onClick={handleExecute}
            >
              Execute — pay {formatMovr(propAmount)} MOVR to {proposerLabel}
            </Button>
          </div>
        </section>
      )}

      {warning && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          {warning}
        </Alert>
      )}
    </section>
  );
}
