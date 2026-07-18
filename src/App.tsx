import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import type { ParsedRun } from "./lib/gpx";
import { parseGpx } from "./lib/gpx";
import { addVerifiedPost, getPostsForAddress, type AchievementDef, type RunPost } from "./lib/posts";
import { useCommunityFeed, usePersonalFeed } from "./lib/feed";
import { AppShell, WalletChip } from "./design-system/components";
import { ConnectScreen, MonadNetworkGate } from "./components/ConnectScreen";
import { FeedScreen } from "./components/FeedScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { PublicProfileScreen } from "./components/PublicProfileScreen";
import { EditProfileScreen } from "./components/EditProfileScreen";
import { BottomNav, type MainTab } from "./components/BottomNav";
import { GpxUpload } from "./components/GpxUpload";
import { RunReplay } from "./components/RunReplay";
import { RunSummary } from "./components/RunSummary";
import { VerifyClaim } from "./components/VerifyClaim";
import { RunDetailScreen } from "./components/RunDetailScreen";
import { ClubsScreen, ClubDetailScreen } from "./components/ClubsScreen";
import { StakingDetailScreen } from "./components/StakingDetailScreen";
import { AchievementDetailScreen } from "./components/AchievementDetailScreen";

export type LogStep = "upload" | "replay" | "summary" | "verify";

type AchievementView = {
  achievement: AchievementDef;
  /** Wallet whose achievement we display */
  subject: `0x${string}`;
  viewOnly: boolean;
};

const LOG_LABELS: Record<LogStep, string> = {
  upload: "Import",
  replay: "Replay",
  summary: "Summary",
  verify: "Verify",
};

export default function App() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<MainTab>("feed");
  const [logStep, setLogStep] = useState<LogStep | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [detailPost, setDetailPost] = useState<RunPost | null>(null);
  const [achievementView, setAchievementView] =
    useState<AchievementView | null>(null);
  /** Other runner overlay — never used for write actions */
  const [viewedProfile, setViewedProfile] = useState<`0x${string}` | null>(
    null,
  );
  const [openClubId, setOpenClubId] = useState<bigint | null>(null);
  const [run, setRun] = useState<ParsedRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);

  const refreshFeed = useCallback(() => setFeedVersion((v) => v + 1), []);

  const {
    posts: chainPersonal,
    isLoading: personalLoading,
    refetch: refetchPersonal,
  } = usePersonalFeed(address, feedVersion);

  const {
    posts: communityPosts,
    isLoading: communityLoading,
    refetch: refetchCommunity,
  } = useCommunityFeed(feedVersion);

  const {
    posts: viewedPosts,
    isLoading: viewedLoading,
  } = usePersonalFeed(viewedProfile ?? undefined, feedVersion);

  const localPersonal = useMemo(
    () => (address ? getPostsForAddress(address) : []),
    [address, feedVersion],
  );

  /** On-chain Your runs, plus this device’s cache for the current feed contract only */
  const yourPosts = useMemo(() => {
    if (chainPersonal.length === 0) return localPersonal;
    const seen = new Set(chainPersonal.map((p) => p.runHash.toLowerCase()));
    const extras = localPersonal.filter(
      (p) => !seen.has(p.runHash.toLowerCase()),
    );
    return [...chainPersonal, ...extras].sort((a, b) =>
      b.verifiedAt.localeCompare(a.verifiedAt),
    );
  }, [chainPersonal, localPersonal]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      setRun(parsed);
      setLogStep("replay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse GPX.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSample = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/sample-run.gpx");
      const text = await res.text();
      const parsed = parseGpx(text);
      setRun({ ...parsed, isSample: true });
      setLogStep("replay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample run.");
    } finally {
      setLoading(false);
    }
  }, []);

  const goToFeed = useCallback(() => {
    setLogStep(null);
    setRun(null);
    setError(null);
    setEditingProfile(false);
    setDetailPost(null);
    setAchievementView(null);
    setViewedProfile(null);
    setOpenClubId(null);
    setTab("feed");
  }, []);

  const startLogRun = useCallback(() => {
    setRun(null);
    setError(null);
    setLogStep("upload");
  }, []);

  const exitLogFlow = useCallback(() => {
    setLogStep(null);
    setRun(null);
    setError(null);
  }, []);

  const openRunnerProfile = useCallback(
    (runner: `0x${string}`) => {
      if (address && runner.toLowerCase() === address.toLowerCase()) {
        setViewedProfile(null);
        setDetailPost(null);
        setAchievementView(null);
        setEditingProfile(false);
        setOpenClubId(null);
        setTab("profile");
        return;
      }
      setDetailPost(null);
      setAchievementView(null);
      setEditingProfile(false);
      setViewedProfile(runner);
    },
    [address],
  );

  /** Persist locally + refresh feeds — do NOT leave the verify screen yet. */
  const handleVerified = useCallback(
    (txHash?: string): boolean => {
      if (!address || !run || run.isSample) return false;
      const { saved } = addVerifiedPost(address, run, txHash);
      refreshFeed();
      void refetchPersonal();
      void refetchCommunity();
      return saved;
    },
    [address, run, refreshFeed, refetchPersonal, refetchCommunity],
  );

  /** Explicit exit from verify → feed (user taps Continue). */
  const handleVerifyDone = useCallback(() => {
    setLogStep(null);
    setRun(null);
    setError(null);
    setTab("feed");
  }, []);

  if (!isConnected || !address) {
    return <ConnectScreen />;
  }

  let content: ReactNode;

  if (logStep) {
    content = (
      <AppShell
        brand="MovrChain"
        stepLabel={LOG_LABELS[logStep]}
        onPrimaryHeader={logStep === "replay" || logStep === "summary"}
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        {logStep === "upload" && (
          <GpxUpload
            onFile={handleFile}
            onSample={handleSample}
            error={error}
            isLoading={loading}
          />
        )}
        {logStep === "replay" && run && (
          <RunReplay run={run} onFinish={() => setLogStep("summary")} />
        )}
        {logStep === "summary" && run && (
          <RunSummary
            run={run}
            onVerify={() => {
              if (run.isSample) return;
              setLogStep("verify");
            }}
            onCancel={run.isSample ? goToFeed : exitLogFlow}
          />
        )}
        {logStep === "verify" && run && !run.isSample && (
          <VerifyClaim
            run={run}
            onBack={() => setLogStep("summary")}
            onVerified={handleVerified}
            onContinueToFeed={handleVerifyDone}
          />
        )}
      </AppShell>
    );
  } else if (editingProfile) {
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        <EditProfileScreen
          address={address}
          onBack={() => setEditingProfile(false)}
          onSaved={() => {
            setEditingProfile(false);
            refreshFeed();
            setTab("profile");
          }}
        />
      </AppShell>
    );
  } else if (achievementView) {
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        <AchievementDetailScreen
          address={achievementView.subject}
          viewerAddress={address}
          achievement={achievementView.achievement}
          viewOnly={achievementView.viewOnly}
          onBack={() => setAchievementView(null)}
        />
      </AppShell>
    );
  } else if (detailPost) {
    const isOwn =
      detailPost.address.toLowerCase() === address.toLowerCase();
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        <RunDetailScreen
          post={detailPost}
          isOwn={isOwn}
          onBack={() => setDetailPost(null)}
          onOpenProfile={openRunnerProfile}
        />
      </AppShell>
    );
  } else if (viewedProfile) {
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        <PublicProfileScreen
          subjectAddress={viewedProfile}
          posts={viewedPosts}
          loadingPosts={viewedLoading}
          onBack={() => setViewedProfile(null)}
          onOpenAchievement={(achievement) =>
            setAchievementView({
              achievement,
              subject: viewedProfile,
              viewOnly: true,
            })
          }
          onOpenPost={setDetailPost}
          onOpenProfile={openRunnerProfile}
        />
      </AppShell>
    );
  } else if (openClubId !== null) {
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
      >
        <ClubDetailScreen
          address={address}
          clubId={openClubId}
          onBack={() => setOpenClubId(null)}
          onOpenProfile={openRunnerProfile}
        />
      </AppShell>
    );
  } else {
    content = (
      <AppShell
        brand="MovrChain"
        headerRight={<WalletChip address={address} connected />}
        onBrandClick={goToFeed}
        bottomNav={
          <BottomNav active={tab} onChange={setTab} onLogRun={startLogRun} />
        }
      >
        {tab === "feed" && (
          <FeedScreen
            yourPosts={yourPosts}
            communityPosts={communityPosts}
            address={address}
            loading={personalLoading || communityLoading}
            onLogRun={startLogRun}
            onOpenPost={setDetailPost}
            onOpenProfile={openRunnerProfile}
            onOpenClubsTab={() => setTab("clubs")}
          />
        )}
        {tab === "clubs" && (
          <ClubsScreen
            address={address}
            onOpenClub={(id) => setOpenClubId(id)}
          />
        )}
        {tab === "staking" && (
          <StakingDetailScreen
            address={address}
            viewerAddress={address}
          />
        )}
        {tab === "profile" && (
          <ProfileScreen
            address={address}
            posts={yourPosts}
            onLogRun={startLogRun}
            onEditProfile={() => setEditingProfile(true)}
            onOpenAchievement={(achievement) =>
              setAchievementView({
                achievement,
                subject: address,
                viewOnly: false,
              })
            }
            onOpenClub={(id) => setOpenClubId(id)}
            onOpenClubsTab={() => setTab("clubs")}
          />
        )}
      </AppShell>
    );
  }

  return <MonadNetworkGate>{content}</MonadNetworkGate>;
}
