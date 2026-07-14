import { useState } from "react";
import type { RunPost } from "../lib/posts";
import { useRunnerProfile } from "../lib/useRunnerProfile";
import { TimelinePost } from "./TimelinePost";
import { Button } from "../design-system/components";

type FeedTab = "yours" | "community";

type FeedScreenProps = {
  yourPosts: RunPost[];
  communityPosts: RunPost[];
  address: `0x${string}`;
  loading?: boolean;
  onLogRun: () => void;
};

function CommunityPost({ post }: { post: RunPost }) {
  const { profile } = useRunnerProfile(post.address as `0x${string}`);
  return <TimelinePost post={post} profile={profile} />;
}

export function FeedScreen({
  yourPosts,
  communityPosts,
  address,
  loading,
  onLogRun,
}: FeedScreenProps) {
  const [tab, setTab] = useState<FeedTab>("yours");
  const { profile: ownProfile } = useRunnerProfile(address);

  const list = tab === "yours" ? yourPosts : communityPosts;
  const empty =
    !loading && list.length === 0
      ? tab === "yours"
        ? {
            title: "Your Run Feed is empty",
            body: "Import a GPX and verify on Monad. Attestation publishes here under your wallet and to Community.",
            cta: true,
          }
        : {
            title: "Community Feed is empty",
            body: "When runners verify on Monad, their runs show up here for everyone.",
            cta: false,
          }
      : null;

  return (
    <section className="feed-screen" aria-labelledby="feed-heading">
      <div className="feed-screen__intro">
        <h1 id="feed-heading" className="feed-screen__heading">
          Activity
        </h1>
        <p className="feed-screen__sub">
          Your runs stay under your wallet. Community is the public board.
        </p>

        <div
          className="feed-tabs"
          role="tablist"
          aria-label="Feed type"
        >
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
        </div>
      </div>

      <div
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={tab === "yours" ? "tab-yours" : "tab-community"}
        className="feed-screen__panel"
      >
        {loading && list.length === 0 && (
          <p className="feed-screen__loading">Loading feed…</p>
        )}

        {empty && (
          <div className="feed-screen__empty">
            <p className="feed-screen__empty-title">{empty.title}</p>
            <p className="feed-screen__empty-body">{empty.body}</p>
            {empty.cta && (
              <Button onClick={onLogRun}>Log your first run</Button>
            )}
          </div>
        )}

        {list.length > 0 && (
          <ol className="feed-screen__list">
            {tab === "yours"
              ? yourPosts.map((post) => (
                  <li key={post.id}>
                    <TimelinePost post={post} isOwn profile={ownProfile} />
                  </li>
                ))
              : communityPosts.map((post) => (
                  <li key={post.id}>
                    <CommunityPost post={post} />
                  </li>
                ))}
          </ol>
        )}
      </div>
    </section>
  );
}
