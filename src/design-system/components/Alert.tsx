import type { ReactNode } from "react";

type AlertTone = "error" | "warning";

type AlertProps = {
  tone?: AlertTone;
  spaced?: boolean;
  className?: string;
  children: ReactNode;
};

export function Alert({
  tone = "error",
  spaced = false,
  className,
  children,
}: AlertProps) {
  return (
    <div
      className={[
        "ds-alert",
        `ds-alert--${tone}`,
        spaced ? "ds-alert--spaced" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="alert"
    >
      {children}
    </div>
  );
}
