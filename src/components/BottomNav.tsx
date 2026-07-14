export type MainTab = "feed" | "profile";

type BottomNavProps = {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  onLogRun: () => void;
};

function NavIcon({ name }: { name: "feed" | "log" | "profile" }) {
  if (name === "feed") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "log") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}

export function BottomNav({ active, onChange, onLogRun }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <button
        type="button"
        className={`bottom-nav__item${active === "feed" ? " bottom-nav__item--active" : ""}`}
        aria-current={active === "feed" ? "page" : undefined}
        onClick={() => onChange("feed")}
      >
        <NavIcon name="feed" />
        <span>Feed</span>
      </button>

      <button
        type="button"
        className="bottom-nav__log"
        aria-label="Log a run"
        onClick={onLogRun}
      >
        <NavIcon name="log" />
      </button>

      <button
        type="button"
        className={`bottom-nav__item${active === "profile" ? " bottom-nav__item--active" : ""}`}
        aria-current={active === "profile" ? "page" : undefined}
        onClick={() => onChange("profile")}
      >
        <NavIcon name="profile" />
        <span>Profile</span>
      </button>
    </nav>
  );
}
