/**
 * Monad testnet (10143) contract addresses — baked in for the public app.
 * Optional VITE_* env vars override for local forks / redeploys.
 * Cutover: Jul 18 2026 UUPS + Beacon + Timelock + Multisig (creator-only threshold).
 */
const env = (key: string): `0x${string}` | undefined => {
  const v = import.meta.env[key] as string | undefined;
  if (v && /^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
  return undefined;
};

/** MovrChainAttestation — verify / attest runs (hackathon submission address) */
export const ATTESTATION_ADDRESS =
  env("VITE_CONTRACT_ADDRESS") ??
  ("0x8F31Cbb38b539cB9e3242E262bf40058904d739c" as const);

/** MovrProfile — unique handle, name, bio, avatar (per connected wallet) */
export const PROFILE_ADDRESS =
  env("VITE_PROFILE_ADDRESS") ??
  ("0x5079c9F03BafDaD54A4CBFdbf05662fdaC285832" as const);

export const MOVR_TOKEN_ADDRESS =
  env("VITE_MOVR_TOKEN") ??
  ("0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF" as const);

export const ACHIEVEMENT_NFT_ADDRESS =
  env("VITE_ACHIEVEMENT_NFT") ??
  ("0x1c5E27280a2D993CE3E8E8a19009488f0F38EB5A" as const);

export const STAKING_ADDRESS =
  env("VITE_STAKING") ??
  ("0x9d6ae82fB08CE0a53554269d558a3C75d33B199C" as const);

/** MovrClubRegistry — clubs ≤10 + treasury factory */
export const CLUB_REGISTRY_ADDRESS =
  env("VITE_CLUB_REGISTRY") ??
  ("0x91cb9D4A5e14E5Ac0962E2d6cba963003A4EC9D3" as const);

export const CLUB_MEMBER_NFT_ADDRESS =
  env("VITE_CLUB_MEMBER_NFT") ??
  ("0x9a3d2332E53e512DcFA65078884f5213aAfe2A0a" as const);

export const CLUB_BADGE_NFT_ADDRESS =
  env("VITE_CLUB_BADGE_NFT") ??
  ("0xCC97214Be43c1A6E967caC448195FA3933C15764" as const);

/** MovrClubChallenges — on-chain club running challenges */
export const CLUB_CHALLENGES_ADDRESS =
  env("VITE_CLUB_CHALLENGES") ??
  ("0xB45d215FFb048D9477a9C4c6fA60b182B09538Ed" as const);

/** MovrMilestoneReward — 1 MOVR/km to runner; +1 MOVR/10km to club treasury if member */
export const MILESTONE_REWARD_ADDRESS =
  env("VITE_MILESTONE_REWARD") ??
  ("0x7B013C35E7bA65e51486C3f9005b6e19809CD270" as const);

/** MovrFeed — community + per-wallet run timeline */
export const FEED_ADDRESS =
  env("VITE_FEED_ADDRESS") ??
  ("0xf6073E5A71D05336b6c260FA14f7a86520D403Aa" as const);
