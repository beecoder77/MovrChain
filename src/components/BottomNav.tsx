export type MainTab = "feed" | "clubs" | "staking" | "profile";

type BottomNavProps = {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  onLogRun: () => void;
};

function NavIcon({
  name,
}: {
  name: "feed" | "clubs" | "log" | "staking" | "profile";
}) {
  if (name === "feed") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "clubs") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <circle cx="16" cy="9" r="2.5" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
        <path d="M14 19c0-2.2 1.8-4 4.5-4 1.2 0 2.3.4 3.1 1" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "staking") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 3v18" strokeLinecap="round" />
        <path d="M7 8h7.5a3.5 3.5 0 0 1 0 7H7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 15h8.5a3.5 3.5 0 0 0 0-7" strokeLinecap="round" strokeLinejoin="round" />
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
      <div className="bottom-nav__rail bottom-nav__rail--start">
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
          className={`bottom-nav__item${active === "clubs" ? " bottom-nav__item--active" : ""}`}
          aria-current={active === "clubs" ? "page" : undefined}
          onClick={() => onChange("clubs")}
        >
          <NavIcon name="clubs" />
          <span>Clubs</span>
        </button>
      </div>

      <button
        type="button"
        className="bottom-nav__log"
        aria-label="Log a run"
        onClick={onLogRun}
      >
        <NavIcon name="log" />
      </button>

      <div className="bottom-nav__rail bottom-nav__rail--end">
        <button
          type="button"
          className={`bottom-nav__item${active === "staking" ? " bottom-nav__item--active" : ""}`}
          aria-current={active === "staking" ? "page" : undefined}
          onClick={() => onChange("staking")}
        >
          <NavIcon name="staking" />
          <span>Staking</span>
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
      </div>
    </nav>
  );
}
