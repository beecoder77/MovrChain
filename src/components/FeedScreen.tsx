import { useMemo, useState } from "react";
import type { RunPost } from "../lib/posts";
import { usePostsClubRewards } from "../lib/runRewards";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { useClubNamesByAddress, useMyClubRoster } from "../lib/useClubFeed";
import { TimelinePost } from "./TimelinePost";
import { ChallengeNoticeBanner } from "./ChallengeNoticeBanner";
import { Button } from "../design-system/components";

type FeedTab = "yours" | "community" | "club";

type FeedScreenProps = {
  yourPosts: RunPost[];
  communityPosts: RunPost[];
  address: `0x${string}`;
  loading?: boolean;
  onLogRun: () => void;
  onOpenPost: (post: RunPost) => void;
  onOpenProfile: (address: `0x${string}`) => void;
  onOpenClubsTab?: () => void;
};

function CommunityPost({
  post,
  onOpen,
  onOpenProfile,
  clubRewardWei,
  clubName,
}: {
  post: RunPost;
  onOpen: (post: RunPost) => void;
  onOpenProfile: (address: `0x${string}`) => void;
  clubRewardWei: bigint;
  clubName?: string;
}) {
  const { profile } = useRunnerProfile(post.address as `0x${string}`);
  return (
    <TimelinePost
      post={post}
      profile={profile}
      onOpen={onOpen}
      onOpenProfile={onOpenProfile}
      clubRewardWei={clubRewardWei}
      clubName={clubName}
    />
  );
}

export function FeedScreen({
  yourPosts,
  communityPosts,
  address,
  loading,
  onLogRun,
  onOpenPost,
  onOpenProfile,
  onOpenClubsTab,
}: FeedScreenProps) {
  const [tab, setTab] = useState<FeedTab>("yours");
  const { profile: ownProfile } = useRunnerProfile(address);
  const roster = useMyClubRoster(address);

  const clubPosts = useMemo(() => {
    if (!roster.inClub) return [];
    const byId = new Map<string, RunPost>();
    for (const post of [...yourPosts, ...communityPosts]) {
      if (!roster.memberSet.has(post.address.toLowerCase())) continue;
      byId.set(post.id, post);
    }
    return [...byId.values()].sort(
      (a, b) =>
        new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime(),
    );
  }, [roster.inClub, roster.memberSet, yourPosts, communityPosts]);

  const list =
    tab === "yours"
      ? yourPosts
      : tab === "community"
        ? communityPosts
        : clubPosts;

  const feedAddresses = useMemo(
    () => list.map((p) => p.address),
    [list],
  );
  const clubNames = useClubNamesByAddress(feedAddresses);
  const { getClubRewardWei } = usePostsClubRewards(list);

  const empty =
    !loading && list.length === 0
      ? tab === "yours"
        ? {
            title: "Your Run Feed is empty",
            body: "Import a GPX and verify on Monad. Attestation publishes here under your wallet and to Community.",
            cta: "log" as const,
          }
        : tab === "community"
            ? {
                title: "Community Feed is empty",
                body: "This board is shared on Monad — every device sees the same list. It’s empty until someone verifies and publishes a run.",
                cta: null,
              }
          : !roster.inClub
            ? {
                title: "No club yet",
                body: "Join or create a club to see clubmate runs here.",
                cta: "clubs" as const,
              }
            : {
                title: "Club feed is quiet",
                body: roster.clubName
                  ? `No verified runs from ${roster.clubName} yet. Log a run and show the squad.`
                  : "No verified runs from your clubmates yet.",
                cta: "log" as const,
              }
      : null;

  const tabLabelId =
    tab === "yours"
      ? "tab-yours"
      : tab === "community"
        ? "tab-community"
        : "tab-club";

  return (
    <section className="feed-screen" aria-labelledby="feed-heading">
      <div className="feed-screen__intro">
        <h1 id="feed-heading" className="feed-screen__heading">
          Activity
        </h1>
        <p className="feed-screen__sub">
          Your runs, the public board, and your club. Tap a name for a runner,
          or a run for the route map.
        </p>

        <div className="feed-tabs" role="tablist" aria-label="Feed type">
          <button
            type="button"
            role="tab"
            id="tab-yours"
            aria-selected={tab === "yours"}
            aria-controls="feed-panel"
            className={`feed-tabs__tab${tab === "yours" ? " feed-tabs__tab--active" : ""}`}
            onClick={() => setTab("yours")}
          >
            Your runs
            {yourPosts.length > 0 && (
              <span className="feed-tabs__count">{yourPosts.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-community"
            aria-selected={tab === "community"}
            aria-controls="feed-panel"
            className={`feed-tabs__tab${tab === "community" ? " feed-tabs__tab--active" : ""}`}
            onClick={() => setTab("community")}
          >
            Community
            {communityPosts.length > 0 && (
              <span className="feed-tabs__count">{communityPosts.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-club"
            aria-selected={tab === "club"}
            aria-controls="feed-panel"
            className={`feed-tabs__tab${tab === "club" ? " feed-tabs__tab--active" : ""}`}
            onClick={() => setTab("club")}
          >
            Club
            {roster.inClub && clubPosts.length > 0 && (
              <span className="feed-tabs__count">{clubPosts.length}</span>
            )}
          </button>
        </div>
      </div>

      <ChallengeNoticeBanner
        address={address}
        onOpenClubs={() => onOpenClubsTab?.()}
      />

      <div
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={tabLabelId}
        className="feed-screen__panel"
      >
        {loading && list.length === 0 && (
          <p className="feed-screen__loading">Loading feed…</p>
        )}

        {empty && (
          <div className="feed-screen__empty">
            <p className="feed-screen__empty-title">{empty.title}</p>
            <p className="feed-screen__empty-body">{empty.body}</p>
            {empty.cta === "log" && (
              <Button onClick={onLogRun}>Log your first run</Button>
            )}
            {empty.cta === "clubs" && onOpenClubsTab && (
              <Button onClick={onOpenClubsTab}>Browse clubs</Button>
            )}
          </div>
        )}

        {list.length > 0 && (
          <ol className="feed-screen__list">
            {tab === "yours"
              ? yourPosts.map((post) => (
                  <li key={post.id}>
                    <TimelinePost
                      post={post}
                      isOwn
                      profile={ownProfile}
                      onOpen={onOpenPost}
                      onOpenProfile={onOpenProfile}
                      clubRewardWei={getClubRewardWei(post.runHash)}
                      clubName={clubNames.get(post.address.toLowerCase())}
                    />
                  </li>
                ))
              : list.map((post) => (
                  <li key={post.id}>
                    <CommunityPost
                      post={post}
                      onOpen={onOpenPost}
                      onOpenProfile={onOpenProfile}
                      clubRewardWei={getClubRewardWei(post.runHash)}
                      clubName={clubNames.get(post.address.toLowerCase())}
                    />
                  </li>
                ))}
          </ol>
        )}
      </div>
    </section>
  );
}
