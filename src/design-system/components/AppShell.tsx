import type { ReactNode } from "react";

type AppShellProps = {
  brand: string;
  stepLabel?: string;
  onPrimaryHeader?: boolean;
  headerRight?: ReactNode;
  bottomNav?: ReactNode;
  onBrandClick?: () => void;
  children: ReactNode;
};

export function AppShell({
  brand,
  stepLabel,
  onPrimaryHeader = false,
  headerRight,
  bottomNav,
  onBrandClick,
  children,
}: AppShellProps) {
  return (
    <div className="ds-app-shell">
      <header
        className={`ds-app-header${onPrimaryHeader ? " ds-app-header--on-primary" : ""}`}
      >
        {onBrandClick ? (
          <button
            type="button"
            className="ds-brand-mark ds-brand-mark--button"
            onClick={onBrandClick}
            aria-label={`${brand} — go to activity feed`}
          >
            <img
              className="ds-brand-mark__logo"
              src="/brand/movr-logo-32.svg"
              alt=""
              width={28}
              height={28}
            />
            {brand}
          </button>
        ) : (
          <span className="ds-brand-mark">
            <img
              className="ds-brand-mark__logo"
              src="/brand/movr-logo-32.svg"
              alt=""
              width={28}
              height={28}
            />
            {brand}
          </span>
        )}
        <div className="ds-app-header__right">
          {headerRight}
          {stepLabel && <span className="ds-step-label">{stepLabel}</span>}
        </div>
      </header>
      <main className={`ds-app-main${bottomNav ? " ds-app-main--with-nav" : ""}`}>
        {children}
      </main>
      {bottomNav}
    </div>
  );
}
