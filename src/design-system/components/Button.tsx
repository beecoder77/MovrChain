import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "primary-inverted";

type CommonProps = {
  variant?: ButtonVariant;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
};

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkButtonProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

function classNames(
  variant: ButtonVariant,
  block: boolean,
  className?: string,
): string {
  return [
    "ds-btn",
    `ds-btn--${variant}`,
    block ? "ds-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  block = false,
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={classNames(variant, block, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="ds-loading-pulse" aria-hidden /> {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function LinkButton({
  variant = "secondary",
  block = false,
  children,
  className,
  ...props
}: LinkButtonProps) {
  return (
    <a className={classNames(variant, block, className)} {...props}>
      {children}
    </a>
  );
}
