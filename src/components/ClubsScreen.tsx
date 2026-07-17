import {
  ADD_MEMBER_GAS,
  APPROVE_JOIN_GAS,
  bufferedClubGas,
  buildDonationLeaderboard,
  CLUB_REGISTRY,
  CLUB_REGISTRY_ABI,
  CLUB_TREASURY_ABI,
  CREATE_CLUB_GAS,
  DONATE_GAS,
  EXECUTE_GAS,
  JOIN_CLUB_GAS,
  PROPOSE_GAS,
  REQUEST_JOIN_GAS,
  SET_VISIBILITY_GAS,
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
import {
  canProposeSpend,
  CLUB_ROLE_LABEL,
  resolveClubRole,
} from "../lib/clubRoles";
import { SET_CLUB_ADMIN_GAS } from "../lib/clubChallenges";
import {
  ClubChallengesPanel,
  ClubChallengePins,
} from "./ClubChallengesPanel";
import { ChallengeNoticeBanner } from "./ChallengeNoticeBanner";
import { useClubChallengeList } from "../lib/useClubChallenges";
import { useClubLeaderboard } from "../lib/useClubLeaderboard";
import {
  memberDisplayLabel,
  parseProfile,
  PROFILE_ABI,
  PROFILE_ADDRESS,
} from "../lib/profile";
import { EXPLORER_URL } from "../lib/wagmi";
import { refetchAfterTx } from "../lib/refetchAfterTx";
import { useAfterConfirmedTx } from "../lib/useAfterConfirmedTx";
import { Alert, Button } from "../design-system/components";
import {
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monadTestnet } from "viem/chains";
import { useEffect, useRef, useState } from "react";
import { isAddress, zeroAddress } from "viem";

type ClubsScreenProps = {
  address: `0x${string}`;
  onOpenClub: (clubId: bigint) => void;
};

export function ClubsScreen({ address, onOpenClub }: ClubsScreenProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [isPublicCreate, setIsPublicCreate] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const deployed = CLUB_REGISTRY !== zeroAddress;

  const { data: clubIdRaw, refetch: refetchClubOf } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: deployed, staleTime: 0, refetchOnMount: "always" },
  });

  const clubId = (clubIdRaw as bigint | undefined) ?? 0n;

  const { data: clubRaw, refetch: refetchClub } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "getClub",
    args: clubId > 0n ? [clubId] : undefined,
    chainId: monadTestnet.id,
    query: { enabled: deployed && clubId > 0n, staleTime: 0, refetchOnMount: "always" },
  });

  const club = clubId > 0n ? parseClub(clubId, clubRaw) : null;
  const { challenges: allChallenges } = useClubChallengeList(club?.clubId);
  const {
    ranked,
    pendingByClub,
    loading: listLoading,
    refetchAll: refetchLeaderboard,
  } = useClubLeaderboard(address);

  const { writeContract, data: txHash, isPending, error, reset } =
    useWriteContract();
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

  useEffect(() => {
    if (error) setWarning(formatWalletError(error));
    else if (receiptFailed || receipt?.status === "reverted")
      setWarning(
        formatWalletError(
          receiptError ?? new Error("Club transaction reverted on Monad"),
        ),
      );
  }, [error, receiptFailed, receiptError, receipt?.status]);

  const syncing = useAfterConfirmedTx(
    txHash,
    isSuccess,
    receipt?.status === "reverted",
    async () => {
      await refetchAfterTx(
        [
          () => refetchClubOf(),
          () => refetchClub(),
          () => refetchLeaderboard(),
        ],
        {
          queryClient,
          until: async () => {
            const r = await refetchClubOf();
            return Number((r.data as bigint | undefined) ?? 0n) > 0;
          },
        },
      );
      setName("");
      setCreateOpen(false);
      setWarning(null);
    },
  );

  const busy = isPending || confirming || syncing;
  const inClub = clubId > 0n;

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
      args: [trimmed, isPublicCreate],
      chainId: monadTestnet.id,
      gas: CREATE_CLUB_GAS,
    });
  };

  const handleJoin = (targetId: bigint, isPublic: boolean) => {
    setWarning(null);
    reset();
    writeContract({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: isPublic ? "joinClub" : "requestJoin",
      args: [targetId],
      chainId: monadTestnet.id,
      gas: isPublic ? JOIN_CLUB_GAS : REQUEST_JOIN_GAS,
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
          Ranked by treasury and verified runs. Public clubs join instantly;
          private clubs need Captain or Admin approval.
        </p>
      </header>

      {club && (
        <ChallengeNoticeBanner
          address={address}
          onOpenClubs={() => onOpenClub(club.clubId)}
          ctaLabel="View challenges"
        />
      )}

      {warning && (
        <Alert tone="warning" className="ds-alert--footer-spaced">
          {warning}
        </Alert>
      )}

      {club && (
        <button
          type="button"
          className="club-card club-card--yours"
          onClick={() => onOpenClub(club.clubId)}
        >
          <div className="club-card__row">
            <span className="club-card__name">{club.name}</span>
            <span className="club-card__badge">
              {club.isPublic ? "Public" : "Private"} · Yours
            </span>
          </div>
          <p className="club-card__meta">
            {club.memberCount}/10 members · Open club
          </p>
          <ClubChallengePins challenges={allChallenges} />
        </button>
      )}

      <section className="club-rank" aria-labelledby="club-rank-h">
        <h2 id="club-rank-h" className="club-rank__title">
          Leaderboard
        </h2>
        {listLoading && ranked.length === 0 && (
          <p className="clubs-screen__hint">Loading clubs…</p>
        )}
        {!listLoading && ranked.length === 0 && (
          <div className="clubs-screen__empty">
            <p className="clubs-screen__empty-title">No clubs yet</p>
            <p className="clubs-screen__empty-body">
              Be first — create a public or private pack below.
            </p>
          </div>
        )}
        <ul className="club-rank__list">
          {ranked.map((row) => {
            const isYours = clubId === row.clubId;
            const pending = pendingByClub.get(row.clubId.toString()) ?? false;
            const full = row.memberCount >= 10;
            return (
              <li key={row.clubId.toString()} className="club-rank__item">
                <button
                  type="button"
                  className="club-rank__row"
                  onClick={() => onOpenClub(row.clubId)}
                >
                  <span
                    className={`club-rank__place${row.rank <= 3 ? " club-rank__place--top" : ""}`}
                  >
                    {row.rank}
                  </span>
                  <span className="club-rank__body">
                    <span className="club-rank__name">{row.name}</span>
                    <span className="club-rank__meta">
                      {row.isPublic ? "Public" : "Private"} · {row.memberCount}
                      /10 · {formatMovr(row.treasuryWei)} MOVR · {row.runCount}{" "}
                      runs
                    </span>
                  </span>
                </button>
                {!inClub && !isYours && (
                  <div className="club-rank__action">
                    {pending ? (
                      <span className="club-rank__pending">Awaiting approval</span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busy || full}
                        onClick={() => handleJoin(row.clubId, row.isPublic)}
                      >
                        {full
                          ? "Full"
                          : row.isPublic
                            ? "Join"
                            : "Request"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!inClub && !createOpen && (
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={() => setCreateOpen(true)}
        >
          Create a club
        </Button>
      )}

      {!inClub && createOpen && (
        <div className="clubs-screen__create">
          <label className="clubs-screen__field">
            <span className="clubs-screen__label">Club name</span>
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
          <fieldset className="club-visibility">
            <legend className="clubs-screen__label">Visibility</legend>
            <label className="club-visibility__option">
              <input
                type="radio"
                name="create-visibility"
                checked={isPublicCreate}
                disabled={busy}
                onChange={() => setIsPublicCreate(true)}
              />
              Public — anyone can join
            </label>
            <label className="club-visibility__option">
              <input
                type="radio"
                name="create-visibility"
                checked={!isPublicCreate}
                disabled={busy}
                onChange={() => setIsPublicCreate(false)}
              />
              Private — Captain/Admin approve
            </label>
          </fieldset>
          <Button block loading={busy} disabled={busy} onClick={handleCreate}>
            {syncing
              ? "Updating club…"
              : busy
                ? "Creating on Monad…"
                : "Create club + treasury"}
          </Button>
          <Button
            variant="ghost"
            block
            disabled={busy}
            onClick={() => setCreateOpen(false)}
          >
            Cancel
          </Button>
          <p className="clubs-screen__hint">
            Creating mints your Club Member NFT (2× vote). Max 10 runners.
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
  onOpenProfile: (member: `0x${string}`) => void;
};

export function ClubDetailScreen({
  address,
  clubId,
  onBack,
  onOpenProfile,
}: ClubDetailProps) {
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("1");
  const [donateAmount, setDonateAmount] = useState("5");
  const [proposeOpen, setProposeOpen] = useState(false);
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
  const isCaptain =
    club && club.creator.toLowerCase() === address.toLowerCase();
  const isMember = members.some(
    (m) => m.toLowerCase() === address.toLowerCase(),
  );

  const { data: isManagerRaw, refetch: refetchManager } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "isClubManager",
    args: [clubId, address],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(club), staleTime: 4_000 },
  });

  const canPropose = canProposeSpend(Boolean(isManagerRaw));
  const isManager = canPropose;

  const { data: viewerClubOfRaw, refetch: refetchViewerClubOf } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "clubOf",
    args: [address],
    chainId: monadTestnet.id,
    query: { staleTime: 4_000 },
  });
  const viewerClubOf = (viewerClubOfRaw as bigint | undefined) ?? 0n;
  const canJoinThisClub = viewerClubOf === 0n && !isMember;

  const { data: joinPendingRaw, refetch: refetchJoinPending } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "joinPending",
    args: [clubId, address],
    chainId: monadTestnet.id,
    query: { enabled: canJoinThisClub || Boolean(club), staleTime: 4_000 },
  });
  const myJoinPending = Boolean(joinPendingRaw);

  const { data: applicantsRaw, refetch: refetchApplicants } = useReadContract({
    address: CLUB_REGISTRY,
    abi: CLUB_REGISTRY_ABI,
    functionName: "pendingApplicants",
    args: [clubId],
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(club && !club.isPublic && isManager),
      staleTime: 4_000,
    },
  });
  const applicants = (applicantsRaw as `0x${string}`[] | undefined) ?? [];

  const applicantProfiles = useReadContracts({
    contracts: applicants.map((a) => ({
      address: PROFILE_ADDRESS,
      abi: PROFILE_ABI,
      functionName: "getProfile" as const,
      args: [a] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: applicants.length > 0, staleTime: 15_000 },
  });

  const adminReads = useReadContracts({
    contracts: members.map((m) => ({
      address: CLUB_REGISTRY,
      abi: CLUB_REGISTRY_ABI,
      functionName: "clubAdmins" as const,
      args: [clubId, m] as const,
      chainId: monadTestnet.id,
    })),
    query: { enabled: members.length > 0, staleTime: 4_000 },
  });

  const {
    challenges: detailChallenges,
    refetchAll: refetchChallenges,
  } = useClubChallengeList(clubId);

  const profileReads = useReadContracts({
    contracts: members.map((member) => ({
      address: PROFILE_ADDRESS,
      abi: PROFILE_ABI,
      functionName: "getProfile" as const,
      args: [member] as const,
      chainId: monadTestnet.id,
    })),
    query: {
      enabled: members.length > 0,
      staleTime: 15_000,
    },
  });

  const memberProfiles = members.map((_, i) => {
    const row = profileReads.data?.[i];
    if (!row || row.status !== "success") return undefined;
    return parseProfile(row.result);
  });

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

  useEffect(() => {
    if (error) setWarning(formatWalletError(error));
    else if (receiptFailed || receipt?.status === "reverted")
      setWarning(
        formatWalletError(
          receiptError ?? new Error("Club transaction reverted on Monad"),
        ),
      );
  }, [error, receiptFailed, receiptError, receipt?.status]);

  const syncing = useAfterConfirmedTx(
    txHash,
    isSuccess,
    receipt?.status === "reverted",
    async () => {
      await refetchAfterTx(
        [
          () => refetchClub(),
          () => refetchMembers(),
          () => refetchBal(),
          () => refetchProps(),
          () => refetchLatest(),
          () => refetchHasVoted(),
          () => refetchCanExecute(),
          () => refetchVotingClosed(),
          () => refetchTopDonors(),
          () => donationReads.refetch(),
          () => refetchMyDonated(),
          () => refetchAllowance(),
          () => refetchManager(),
          () => refetchChallenges(),
          () => adminReads.refetch(),
          () => refetchViewerClubOf(),
          () => refetchJoinPending(),
          () => refetchApplicants(),
          () => applicantProfiles.refetch(),
        ],
        { queryClient },
      );
      if (pendingDonateAction.current === "donate") {
        setDonateAmount("5");
      }
      pendingDonateAction.current = null;
      setProposeOpen(false);
      setWarning(null);
    },
  );

  const busy = isPending || confirming || syncing;

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

  const toggleAdmin = (member: `0x${string}`, makeAdmin: boolean) => {
    if (!isCaptain) return;
    if (member.toLowerCase() === club.creator.toLowerCase()) return;
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: "setClubAdmin",
        args: [clubId, member, makeAdmin],
        chainId: monadTestnet.id,
        gas: SET_CLUB_ADMIN_GAS,
      }),
    );
  };

  const handleSetVisibility = (nextPublic: boolean) => {
    if (!isCaptain) return;
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: "setClubVisibility",
        args: [clubId, nextPublic],
        chainId: monadTestnet.id,
        gas: SET_VISIBILITY_GAS,
      }),
    );
  };

  const handleJoinThisClub = () => {
    if (!canJoinThisClub || !club) return;
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: club.isPublic ? "joinClub" : "requestJoin",
        args: [clubId],
        chainId: monadTestnet.id,
        gas: club.isPublic ? JOIN_CLUB_GAS : REQUEST_JOIN_GAS,
      }),
    );
  };

  const handleApproveApplicant = (account: `0x${string}`) => {
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: "approveJoin",
        args: [clubId, account],
        chainId: monadTestnet.id,
        gas: APPROVE_JOIN_GAS,
      }),
    );
  };

  const handleRejectApplicant = (account: `0x${string}`) => {
    run(() =>
      writeContract({
        address: CLUB_REGISTRY,
        abi: CLUB_REGISTRY_ABI,
        functionName: "rejectJoin",
        args: [clubId, account],
        chainId: monadTestnet.id,
        gas: APPROVE_JOIN_GAS,
      }),
    );
  };

  const openProposeForm = () => {
    if (!canPropose) {
      setWarning("Only the Captain or Admins can propose a spend.");
      return;
    }
    setProposeOpen(true);
  };

  const closeProposeForm = () => {
    setProposeOpen(false);
    setTitle("");
    setReason("");
    setAmount("1");
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
    if (!canPropose) {
      setWarning("Only the Captain or Admins can propose a spend.");
      return;
    }
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
          {club.isPublic ? "Public" : "Private"}
          {isMember
            ? ` · ${CLUB_ROLE_LABEL[
                resolveClubRole(
                  address,
                  club.creator,
                  Boolean(isManagerRaw) &&
                    address.toLowerCase() !== club.creator.toLowerCase(),
                )
              ]} · Treasury ${formatMovr((bal as bigint) ?? 0n)} MOVR · Your power: ${votePowerLabel(Number(power ?? 0n))}`
            : ` · Treasury ${formatMovr((bal as bigint) ?? 0n)} MOVR · ${club.memberCount}/10 members`}
        </p>
      </header>

      {canJoinThisClub && (
        <div className="club-detail__join">
          {myJoinPending ? (
            <p className="club-detail__hint" role="status">
              Join request pending — waiting for Captain or Admin approval.
            </p>
          ) : club.memberCount >= 10 ? (
            <p className="club-detail__hint">This club is full (10/10).</p>
          ) : (
            <Button block loading={busy} disabled={busy} onClick={handleJoinThisClub}>
              {club.isPublic ? "Join club" : "Request to join"}
            </Button>
          )}
        </div>
      )}

      {isCaptain && (
        <section className="club-detail__panel" aria-labelledby="visibility-h">
          <h2 id="visibility-h" className="club-detail__panel-title">
            Visibility
          </h2>
          <p className="club-detail__hint">
            {club.isPublic
              ? "Anyone can join without approval. Flip to private to require Captain/Admin approval."
              : "Join requests need your approval. Flip to public to clear pending requests and allow instant joins."}
          </p>
          <Button
            variant="secondary"
            block
            disabled={busy}
            onClick={() => handleSetVisibility(!club.isPublic)}
          >
            Make {club.isPublic ? "private" : "public"}
          </Button>
        </section>
      )}

      {isManager && !club.isPublic && applicants.length > 0 && (
        <section className="club-detail__panel" aria-labelledby="applicants-h">
          <h2 id="applicants-h" className="club-detail__panel-title">
            Join requests
          </h2>
          <ul className="club-challenge-card__pending">
            {applicants.map((a, i) => {
              const row = applicantProfiles.data?.[i];
              const profile =
                row?.status === "success" ? parseProfile(row.result) : undefined;
              return (
                <li key={a} className="club-challenge-card__pending-row">
                  <button
                    type="button"
                    className="club-detail__member-main"
                    onClick={() => onOpenProfile(a)}
                  >
                    {memberDisplayLabel(profile, a)}
                  </button>
                  <div className="club-challenge-card__pending-actions">
                    <button
                      type="button"
                      className="club-detail__role-action"
                      disabled={busy || club.memberCount >= 10}
                      onClick={() => handleApproveApplicant(a)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="club-detail__role-action"
                      disabled={busy}
                      onClick={() => handleRejectApplicant(a)}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
        <ul className="club-detail__member-list">
          {members.map((m, i) => {
            const adminRow = adminReads.data?.[i];
            const isAdminOnChain =
              adminRow?.status === "success" && Boolean(adminRow.result);
            const role = resolveClubRole(m, club.creator, isAdminOnChain);
            const label = memberDisplayLabel(memberProfiles[i], m);
            const isYou = m.toLowerCase() === address.toLowerCase();
            const showAdminToggle = Boolean(isCaptain && role !== "captain");
            return (
              <li key={m} className="club-detail__member-row">
                <button
                  type="button"
                  className="club-detail__member-main"
                  onClick={() => onOpenProfile(m)}
                >
                  <span className="club-detail__member-name">
                    {label}
                    {isYou ? " · you" : ""}
                  </span>
                  <span
                    className={`club-detail__role club-detail__role--${role}`}
                  >
                    {CLUB_ROLE_LABEL[role]}
                  </span>
                </button>
                {showAdminToggle && (
                  <button
                    type="button"
                    className="club-detail__role-action"
                    disabled={busy}
                    onClick={() => toggleAdmin(m, role !== "admin")}
                  >
                    {role === "admin" ? "Demote" : "Make admin"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {isCaptain && club.memberCount < 10 && (
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

      {canPropose && (
        <section className="club-detail__panel" aria-labelledby="propose-h">
          <h2 id="propose-h" className="club-detail__panel-title">
            Club spend
          </h2>
          {!proposeOpen ? (
            <Button
              variant="secondary"
              block
              disabled={busy}
              onClick={openProposeForm}
            >
              Propose a spend
            </Button>
          ) : (
            <div className="club-detail__propose-form">
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
              <Button
                variant="ghost"
                block
                disabled={busy}
                onClick={closeProposeForm}
              >
                Cancel
              </Button>
              <p className="club-detail__hint">
                If passed, treasury MOVR is sent to whoever submitted the
                proposal. Captain and Admins can propose.
              </p>
            </div>
          )}
        </section>
      )}

      <ClubChallengesPanel
        clubId={clubId}
        address={address}
        members={members}
        isMember={isMember}
        isManager={isManager}
        busy={busy}
        challenges={detailChallenges}
        onRefresh={refetchChallenges}
        onWrite={run}
        writeContract={writeContract}
        publicClient={publicClient ?? undefined}
      />

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
