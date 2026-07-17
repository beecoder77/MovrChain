/**
 * Monad testnet (10143) contract addresses — baked in for the public app.
 * Optional VITE_* env vars override for local forks / redeploys.
 */
const env = (key: string): `0x${string}` | undefined => {
  const v = import.meta.env[key] as string | undefined;
  if (v && /^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
  return undefined;
};

/** MovrChainAttestation — verify / attest runs (hackathon submission address) */
export const ATTESTATION_ADDRESS =
  env("VITE_CONTRACT_ADDRESS") ??
  ("0x70FA6Fa42741f2890647e42a8cBE102FefD65c38" as const);

/** MovrProfile — unique handle, name, bio, avatar (per connected wallet) */
export const PROFILE_ADDRESS =
  env("VITE_PROFILE_ADDRESS") ??
  ("0xa16938B26824c3D2aACEb4e25a08937B7fCb202c" as const);

export const MOVR_TOKEN_ADDRESS =
  env("VITE_MOVR_TOKEN") ??
  ("0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF" as const);

export const ACHIEVEMENT_NFT_ADDRESS =
  env("VITE_ACHIEVEMENT_NFT") ??
  ("0xf54b551c5DEc5E5da56cBB9364cC7F12Ce38043e" as const);

export const STAKING_ADDRESS =
  env("VITE_STAKING") ??
  ("0x1b4b84aff414686AeFb8cBd921E1223461563413" as const);

/** MovrClubRegistry — clubs ≤10 + treasury factory */
export const CLUB_REGISTRY_ADDRESS =
  env("VITE_CLUB_REGISTRY") ??
  ("0x2bBB9f4Dbe6F57bB7DD35de1A4376dE22a1F2404" as const);

export const CLUB_MEMBER_NFT_ADDRESS =
  env("VITE_CLUB_MEMBER_NFT") ??
  ("0xa848d29b8Ae84656BA71646817f9603Ec980cD95" as const);

export const CLUB_BADGE_NFT_ADDRESS =
  env("VITE_CLUB_BADGE_NFT") ??
  ("0x364FE1177db623978bC49c8eA9d96052D59b87ed" as const);

/** MovrClubChallenges — on-chain club running challenges */
export const CLUB_CHALLENGES_ADDRESS =
  env("VITE_CLUB_CHALLENGES") ??
  ("0x6851d99b887F725c4B307Fde7D51e5e0794c0414" as const);

/** MovrMilestoneReward — 1 MOVR/km to runner; +1 MOVR/10km to club treasury if member */
export const MILESTONE_REWARD_ADDRESS =
  env("VITE_MILESTONE_REWARD") ??
  ("0xBB9F09B547d5aD640e523e780168a3C033d2Be62" as const);

/** MovrFeed — community + per-wallet run timeline */
export const FEED_ADDRESS =
  env("VITE_FEED_ADDRESS") ??
  ("0x90572AB8a96534bB334D01078290ae341D4B06e6" as const);
