import { useEffect, useRef, useState } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monadTestnet } from "viem/chains";
import { zeroAddress } from "viem";
import { Alert, Button } from "../design-system/components";
import { formatWalletError } from "../lib/errors";
import { EXPLORER_URL } from "../lib/wagmi";
import { refetchAfterTx } from "../lib/refetchAfterTx";
import {
  AVATARS,
  MAX_BIO_LEN,
  MAX_HANDLE_LEN,
  MAX_NAME_LEN,
  PROFILE_ABI,
  PROFILE_ADDRESS,
  SET_PROFILE_GAS,
  validateHandleInput,
  normalizeHandle,
} from "../lib/profile";
import { useRunnerProfile } from "../lib/useRunnerProfile";

type EditProfileScreenProps = {
  /** Must be the connected wallet — setProfile always writes msg.sender */
  address: `0x${string}`;
  onBack: () => void;
  onSaved: () => void;
};

export function EditProfileScreen({
  address,
  onBack,
  onSaved,
}: EditProfileScreenProps) {
  const queryClient = useQueryClient();
  const handledTx = useRef<string | null>(null);

  const { profile: chainProfile, isLoading, refetch } = useRunnerProfile(address);

  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarId, setAvatarId] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    if (chainProfile.exists) {
      setHandle(chainProfile.handle);
      setName(chainProfile.name);
      setBio(chainProfile.bio);
      setAvatarId(chainProfile.avatarId);
    } else {
      setHandle("");
      setName("");
      setBio("");
      setAvatarId(0);
    }
    setHydrated(true);
  }, [chainProfile, isLoading, hydrated]);

  const normalizedPreview = normalizeHandle(handle);
  const handleError = handle.trim() ? validateHandleInput(handle) : "Add a unique handle.";

  const { data: resolvedOwner } = useReadContract({
    address: PROFILE_ADDRESS,
    abi: PROFILE_ABI,
    functionName: "resolveHandle",
    args: normalizedPreview ? [normalizedPreview] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled: Boolean(normalizedPreview),
      staleTime: 4_000,
    },
  });

  const handleTaken =
    Boolean(normalizedPreview) &&
    typeof resolvedOwner === "string" &&
    resolvedOwner !== zeroAddress &&
    resolvedOwner.toLowerCase() !== address.toLowerCase();

  const { writeContract, data: txHash, isPending, error: writeError, reset } =
    useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: monadTestnet.id,
    confirmations: 2,
    pollingInterval: 1_000,
  });

  useEffect(() => {
    if (!isSuccess || !txHash || !receipt) return;
    if (handledTx.current === txHash) return;
    handledTx.current = txHash;

    if (receipt.status === "reverted") {
      setLocalError(
        "Transaction reverted on Monad (handle taken or invalid). Try again.",
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      setSyncing(true);
      try {
        await refetchAfterTx([() => refetch()], { queryClient });
        if (!cancelled) onSaved();
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuccess, txHash, receipt, onSaved, refetch, queryClient]);

  useEffect(() => {
    if (!receiptError) return;
    setLocalError(
      "Could not confirm the transaction on Monad. Check your wallet activity.",
    );
  }, [receiptError]);

  const busy = isPending || confirming || syncing;
  const nameOk = name.trim().length > 0 && name.trim().length <= MAX_NAME_LEN;
  const bioOk = bio.length <= MAX_BIO_LEN;
  const handleOk = !handleError && !handleTaken;
  const canSave = nameOk && bioOk && handleOk && !busy && hydrated;

  const handleSave = () => {
    setLocalError(null);
    handledTx.current = null;
    reset();

    const handleMsg = validateHandleInput(handle);
    if (handleMsg) {
      setLocalError(handleMsg);
      return;
    }
    const normalized = normalizeHandle(handle);
    if (!normalized) {
      setLocalError("Invalid handle.");
      return;
    }
    if (handleTaken) {
      setLocalError("That handle is already taken.");
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Add a display name.");
      return;
    }
    if (trimmed.length > MAX_NAME_LEN) {
      setLocalError(`Name must be ${MAX_NAME_LEN} characters or fewer.`);
      return;
    }
    if (bio.length > MAX_BIO_LEN) {
      setLocalError(`Bio must be ${MAX_BIO_LEN} characters or fewer.`);
      return;
    }

    // Always writes msg.sender — never pass another wallet's address into setProfile
    writeContract({
      address: PROFILE_ADDRESS,
      abi: PROFILE_ABI,
      functionName: "setProfile",
      args: [normalized, trimmed, bio, avatarId],
      chainId: monadTestnet.id,
      gas: SET_PROFILE_GAS,
    });
  };

  const male = AVATARS.filter((a) => a.gender === "male");
  const female = AVATARS.filter((a) => a.gender === "female");

  return (
    <section className="edit-profile" aria-labelledby="edit-profile-heading">
      <header className="edit-profile__header">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <h1 id="edit-profile-heading" className="edit-profile__heading">
          Edit profile
        </h1>
      </header>

      <p className="edit-profile__lead">
        Pick a unique handle, athletic avatar, and display name. Saved on Monad
        for your wallet only — gas only, no fee.
      </p>

      {isLoading && !hydrated && (
        <p className="edit-profile__lead">Loading your profile from Monad…</p>
      )}

      <fieldset className="edit-profile__avatars" disabled={busy || !hydrated}>
        <legend className="edit-profile__legend">Avatar</legend>

        <p className="edit-profile__group-label" id="avatars-male">
          Male athletes
        </p>
        <div
          className="edit-profile__avatar-grid"
          role="listbox"
          aria-labelledby="avatars-male"
        >
          {male.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={avatarId === a.id}
              className={`edit-profile__avatar-btn${avatarId === a.id ? " is-selected" : ""}`}
              onClick={() => setAvatarId(a.id)}
            >
              <img src={a.src} alt="" width={64} height={64} />
              <span className="sr-only">{a.label}</span>
            </button>
          ))}
        </div>

        <p className="edit-profile__group-label" id="avatars-female">
          Female athletes
        </p>
        <div
          className="edit-profile__avatar-grid"
          role="listbox"
          aria-labelledby="avatars-female"
        >
          {female.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={avatarId === a.id}
              className={`edit-profile__avatar-btn${avatarId === a.id ? " is-selected" : ""}`}
              onClick={() => setAvatarId(a.id)}
            >
              <img src={a.src} alt="" width={64} height={64} />
              <span className="sr-only">{a.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="edit-profile__field">
        <span className="edit-profile__label">Handle</span>
        <div className="edit-profile__handle-row">
          <span className="edit-profile__handle-prefix" aria-hidden>
            @
          </span>
          <input
            className="edit-profile__input edit-profile__input--handle"
            type="text"
            value={handle}
            maxLength={MAX_HANDLE_LEN}
            autoComplete="username"
            spellCheck={false}
            disabled={busy || !hydrated}
            placeholder="yourhandle"
            onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))}
          />
        </div>
        <span className="edit-profile__hint">
          {normalizedPreview
            ? handleTaken
              ? "Taken — pick another"
              : `${normalizedPreview.length}/${MAX_HANDLE_LEN} · unique on Monad`
            : `3–${MAX_HANDLE_LEN} chars · letters, numbers, _`}
        </span>
      </label>

      <label className="edit-profile__field">
        <span className="edit-profile__label">Display name</span>
        <input
          className="edit-profile__input"
          type="text"
          value={name}
          maxLength={MAX_NAME_LEN}
          autoComplete="nickname"
          disabled={busy || !hydrated}
          placeholder="Your runner name"
          onChange={(e) => setName(e.target.value)}
        />
        <span className="edit-profile__hint">
          {name.trim().length}/{MAX_NAME_LEN}
        </span>
      </label>

      <label className="edit-profile__field">
        <span className="edit-profile__label">Bio</span>
        <textarea
          className="edit-profile__textarea"
          value={bio}
          maxLength={MAX_BIO_LEN}
          rows={3}
          disabled={busy || !hydrated}
          placeholder="Pace goals, favorite routes, why you run…"
          onChange={(e) => setBio(e.target.value)}
        />
        <span className="edit-profile__hint">
          {bio.length}/{MAX_BIO_LEN}
        </span>
      </label>

      {(localError || writeError) && (
        <Alert className="edit-profile__alert">
          {localError ?? formatWalletError(writeError) ?? "Could not save."}
          {txHash && (
            <>
              {" "}
              <a
                href={`${EXPLORER_URL}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View tx
              </a>
            </>
          )}
        </Alert>
      )}

      <div className="edit-profile__actions">
        <Button block loading={busy} disabled={!canSave} onClick={handleSave}>
          {busy ? "Saving on Monad…" : "Save on Monad"}
        </Button>
      </div>
    </section>
  );
}
