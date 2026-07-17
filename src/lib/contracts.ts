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
  ("0x4FcC7b8d7334289d548183694C04d67aA366cC7E" as const);

/** MovrProfile — unique handle, name, bio, avatar (per connected wallet) */
export const PROFILE_ADDRESS =
  env("VITE_PROFILE_ADDRESS") ??
  ("0x5079c9F03BafDaD54A4CBFdbf05662fdaC285832" as const);

export const MOVR_TOKEN_ADDRESS =
  env("VITE_MOVR_TOKEN") ??
  ("0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF" as const);

export const ACHIEVEMENT_NFT_ADDRESS =
  env("VITE_ACHIEVEMENT_NFT") ??
  ("0x4b5eFbb1499423Ff1a315f699dAA9A059639077a" as const);

export const STAKING_ADDRESS =
  env("VITE_STAKING") ??
  ("0xd88b01Ce8781712E593863Ca358EA44F5F0E0D4D" as const);

/** MovrClubRegistry — clubs ≤10 + treasury factory */
export const CLUB_REGISTRY_ADDRESS =
  env("VITE_CLUB_REGISTRY") ??
  ("0xe8438Ce97a5972812E4968F5b40D60d2A3aDA3A7" as const);

export const CLUB_MEMBER_NFT_ADDRESS =
  env("VITE_CLUB_MEMBER_NFT") ??
  ("0x4FDE1cDA74FE56107CaCDC55b551bc6a45731474" as const);

export const CLUB_BADGE_NFT_ADDRESS =
  env("VITE_CLUB_BADGE_NFT") ??
  ("0xEB2Bb2BeBC2D5fA52E768B796e5aeC27E17D03B2" as const);

/** MovrClubChallenges — on-chain club running challenges */
export const CLUB_CHALLENGES_ADDRESS =
  env("VITE_CLUB_CHALLENGES") ??
  ("0x7186Cd55038cB626C282055bCaEab721ae942108" as const);

/** MovrMilestoneReward — 1 MOVR/km to runner; +1 MOVR/10km to club treasury if member */
export const MILESTONE_REWARD_ADDRESS =
  env("VITE_MILESTONE_REWARD") ??
  ("0xb09746Ec8Ce13415fed0c11d282b1a7Acca777ed" as const);

/** MovrFeed — community + per-wallet run timeline */
export const FEED_ADDRESS =
  env("VITE_FEED_ADDRESS") ??
  ("0x41a767e92731168E4c596573Da411D78B4c78e19" as const);
