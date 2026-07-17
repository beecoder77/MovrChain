/** Collect nested viem / wagmi error text for matching. */
function errorText(error: unknown): string {
  if (!error) return "";
  const parts: string[] = [];
  const walk = (e: unknown, depth: number) => {
    if (!e || depth > 5) return;
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (e instanceof Error) {
      parts.push(e.message);
      const anyErr = e as Error & {
        shortMessage?: string;
        details?: string;
        cause?: unknown;
        metaMessages?: string[];
      };
      if (anyErr.shortMessage) parts.push(anyErr.shortMessage);
      if (anyErr.details) parts.push(anyErr.details);
      if (anyErr.metaMessages?.length) parts.push(anyErr.metaMessages.join(" "));
      if (anyErr.cause) walk(anyErr.cause, depth + 1);
      return;
    }
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      for (const k of ["message", "shortMessage", "details", "reason", "data"]) {
        if (typeof o[k] === "string") parts.push(o[k] as string);
      }
      if (o.cause) walk(o.cause, depth + 1);
    }
  };
  walk(error, 0);
  return parts.join(" ").toLowerCase();
}

/** Map known Solidity / wallet failure text → UI copy. */
function mapKnownFailure(combined: string): string | null {
  if (!combined.trim()) return null;

  if (combined.includes("user rejected") || combined.includes("user denied")) {
    return "Transaction cancelled in your wallet.";
  }
  if (combined.includes("insufficient funds")) {
    return "Not enough MON for gas. Add funds and try again.";
  }
  if (
    combined.includes("wrong network") ||
    combined.includes("chain mismatch") ||
    combined.includes("unsupported chain")
  ) {
    return "Switch to Monad testnet in your wallet, then try again.";
  }
  if (combined.includes("connector not found") || combined.includes("no provider")) {
    return "No wallet detected. Install MetaMask or another Web3 wallet.";
  }
  // Exact revert / custom errors from MovrChainAttestation.attestRun
  if (
    combined.includes("already attested") ||
    combined.includes("alreadyattested")
  ) {
    return "This run was already verified on Monad. You can post it to your feed without verifying again.";
  }
  if (
    combined.includes("invalid distance") ||
    combined.includes("invalid duration") ||
    combined.includes("invaliddistance") ||
    combined.includes("invalidduration")
  ) {
    return "This GPX looks invalid for attestation. Re-export and try again.";
  }
  if (
    combined.includes("paceunrealistic") ||
    combined.includes("distancetoohigh") ||
    combined.includes("durationtoohigh")
  ) {
    return "This run looks unrealistic (distance, duration, or pace). Check the GPX and try again.";
  }
  if (combined.includes("dailylimit")) {
    return "Daily attestation limit reached (24/day). Try again tomorrow.";
  }
  if (combined.includes("enforcedpause") || combined.includes("paused")) {
    return "Attestations are temporarily paused. Please try again later.";
  }
  if (combined.includes("out of gas") || combined.includes("intrinsic gas too low")) {
    return "Transaction ran out of gas on Monad. Retry — the gas limit was too low for this write (unused gas is refunded, so a higher limit does not raise the fee by itself).";
  }
  if (combined.includes("handle taken")) {
    return "That handle is already taken. Pick another unique @handle.";
  }
  if (
    combined.includes('"handle"') ||
    combined.includes("revert handle") ||
    (combined.includes("handle") && combined.includes("revert"))
  ) {
    return "Invalid handle. Use 3–16 characters: start with a letter, then letters, numbers, or _.";
  }
  if (combined.includes('"name"') || combined.includes("revert name")) {
    return "Display name is required and must be 32 characters or fewer.";
  }
  if (combined.includes('"bio"') || combined.includes("revert bio")) {
    return "Bio must be 160 characters or fewer.";
  }
  if (combined.includes('"avatar"') || combined.includes("revert avatar")) {
    return "Pick a valid avatar from the list.";
  }
  if (combined.includes("voted")) {
    return "You already voted on this proposal.";
  }
  if (combined.includes("voting open")) {
    return "Execute unlocks after every member votes, or 24 hours after the proposal.";
  }
  if (combined.includes("not passed")) {
    return "This proposal does not have a yes majority yet.";
  }
  if (
    combined.includes("execution reverted") ||
    combined.includes("revert") ||
    combined.includes("transaction failed")
  ) {
    return "Transaction failed on Monad. Check gas, handle availability, and try again.";
  }

  return null;
}

/** Map wallet / chain errors to user-facing copy. */
export function formatWalletError(error: Error | null | undefined): string | null {
  if (!error) return null;
  return (
    mapKnownFailure(errorText(error)) ??
    "Something went wrong with your wallet. Check the connection and try again."
  );
}

export function isAlreadyAttestedError(error: unknown): boolean {
  const t = errorText(error);
  return t.includes("already attested") || t.includes("alreadyattested");
}

/** Friendly copy when an attestation tx fails (reject, revert, wait error). */
export function formatAttestationFailure(opts: {
  writeError?: unknown;
  receiptError?: unknown;
  receiptStatus?: "success" | "reverted";
}): string | null {
  // Prefer specific revert reasons from write OR receipt wait error (e.g. "Already attested")
  const known =
    mapKnownFailure(errorText(opts.writeError)) ??
    mapKnownFailure(errorText(opts.receiptError));
  if (known) return known;

  if (opts.receiptStatus === "reverted") {
    return "Attestation transaction failed on Monad (reverted). Your run was not verified — try again.";
  }
  if (opts.receiptError) {
    return "Could not confirm attestation on Monad. Check your wallet activity and try again.";
  }
  if (opts.writeError) {
    return formatWalletError(
      opts.writeError instanceof Error
        ? opts.writeError
        : new Error(String(opts.writeError)),
    );
  }
  return null;
}
