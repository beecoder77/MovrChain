import { useEffect, useRef, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { monadTestnet } from "viem/chains";
import { Alert, Button } from "../design-system/components";
import { formatWalletError } from "../lib/errors";
import { EXPLORER_URL } from "../lib/wagmi";
import {
  AVATARS,
  MAX_BIO_LEN,
  MAX_NAME_LEN,
  PROFILE_ABI,
  PROFILE_ADDRESS,
  SET_PROFILE_GAS,
} from "../lib/profile";
import { useRunnerProfile } from "../lib/useRunnerProfile";

type EditProfileScreenProps = {
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

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarId, setAvatarId] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Fill form from on-chain profile once the first getProfile completes
  useEffect(() => {
    if (isLoading || hydrated) return;
    if (chainProfile.exists) {
      setName(chainProfile.name);
      setBio(chainProfile.bio);
      setAvatarId(chainProfile.avatarId);
    } else {
      setName("");
      setBio("");
      setAvatarId(0);
    }
    setHydrated(true);
  }, [chainProfile, isLoading, hydrated]);

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
  });

  useEffect(() => {
    if (!isSuccess || !txHash || !receipt) return;
    if (handledTx.current === txHash) return;
    handledTx.current = txHash;

    if (receipt.status === "reverted") {
      setLocalError(
        "Transaction reverted on Monad (often out of gas). Try again.",
      );
      return;
    }

    void (async () => {
      await queryClient.invalidateQueries();
      await refetch();
      onSaved();
    })();
  }, [isSuccess, txHash, receipt, onSaved, refetch, queryClient]);

  useEffect(() => {
    if (!receiptError) return;
    setLocalError(
      "Could not confirm the transaction on Monad. Check your wallet activity.",
    );
  }, [receiptError]);

  const busy = isPending || confirming;
  const nameOk = name.trim().length > 0 && name.trim().length <= MAX_NAME_LEN;
  const bioOk = bio.length <= MAX_BIO_LEN;
  const canSave = nameOk && bioOk && !busy && hydrated;

  const handleSave = () => {
    setLocalError(null);
    handledTx.current = null;
    reset();
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

    writeContract({
      address: PROFILE_ADDRESS,
      abi: PROFILE_ABI,
      functionName: "setProfile",
      args: [trimmed, bio, avatarId],
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
        Choose an athletic avatar, then save your name and bio on Monad. Gas
        only — no fee.
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
