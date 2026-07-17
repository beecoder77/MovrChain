import { useEffect, useState } from "react";
import {
  usePublicClient,
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
import { useAfterConfirmedTx } from "../lib/useAfterConfirmedTx";
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

function profileFailureMessage(error: unknown): string {
  return (
    formatWalletError(error instanceof Error ? error : new Error(String(error))) ??
    "Could not save profile on Monad. Check the transaction and try again."
  );
}

export function EditProfileScreen({
  address,
  onBack,
  onSaved,
}: EditProfileScreenProps) {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: monadTestnet.id });

  const { profile: chainProfile, isLoading, refetch } = useRunnerProfile(address);

  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarId, setAvatarId] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [failedTxHash, setFailedTxHash] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (hydrated) return;
    if (isLoading) return;
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
    isError: receiptFailed,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: monadTestnet.id,
    pollingInterval: 1_000,
  });

  const receiptReverted = receipt?.status === "reverted";
  const txFailed = receiptFailed || receiptReverted;

  const syncing = useAfterConfirmedTx(
    txHash,
    isSuccess,
    receiptReverted,
    async () => {
      await refetchAfterTx([() => refetch()], { queryClient });
      onSaved();
    },
  );

  // Failed receipt must never leave the form locked — clear write state.
  useEffect(() => {
    if (!txFailed || !txHash) return;
    setFailedTxHash(txHash);
    setLocalError(
      profileFailureMessage(
        receiptError ?? new Error("Profile transaction reverted on Monad"),
      ),
    );
    reset();
  }, [txFailed, txHash, receiptError, reset]);

  useEffect(() => {
    if (!writeError) return;
    setLocalError(profileFailureMessage(writeError));
  }, [writeError]);

  // Confirming only while waiting — never after failure/success settle.
  const busy = isPending || (confirming && !txFailed) || syncing;
  const nameOk = name.trim().length > 0 && name.trim().length <= MAX_NAME_LEN;
  const bioOk = bio.length <= MAX_BIO_LEN;
  const handleOk = !handleError && !handleTaken;
  const canSave = nameOk && bioOk && handleOk && !busy && hydrated;

  const handleSave = () => {
    setLocalError(null);
    setFailedTxHash(null);
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

    void (async () => {
      let gas = SET_PROFILE_GAS;
      try {
        if (publicClient) {
          const estimated = await publicClient.estimateContractGas({
            address: PROFILE_ADDRESS,
            abi: PROFILE_ABI,
            functionName: "setProfile",
            args: [normalized, trimmed, bio, avatarId],
            account: address,
          });
          const buffered = (estimated * 15n) / 10n;
          if (buffered > gas) gas = buffered;
        }
      } catch (e) {
        setLocalError(profileFailureMessage(e));
        return;
      }

      writeContract({
        address: PROFILE_ADDRESS,
        abi: PROFILE_ABI,
        functionName: "setProfile",
        args: [normalized, trimmed, bio, avatarId],
        chainId: monadTestnet.id,
        gas,
      });
    })();
  };

  const male = AVATARS.filter((a) => a.gender === "male");
  const female = AVATARS.filter((a) => a.gender === "female");

  return (
    <section className="edit-profile" aria-labelledby="edit-profile-heading">
      <header className="edit-profile__header">
        <Button variant="ghost" onClick={onBack}>
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
          {(failedTxHash || txHash) && (
            <>
              {" "}
              <a
                href={`${EXPLORER_URL}/tx/${failedTxHash ?? txHash}`}
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
