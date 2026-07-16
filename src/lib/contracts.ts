/**
 * Monad testnet (10143) contract addresses — baked in for the public app.
 * Optional VITE_* env vars override for local forks / redeploys.
 */
const env = (key: string): `0x${string}` | undefined => {
  const v = import.meta.env[key] as string | undefined;
  if (v && /^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
  return undefined;
};

/** MovrChainAttestation — verify / attest runs */
export const ATTESTATION_ADDRESS =
  env("VITE_CONTRACT_ADDRESS") ??
  ("0xae2Cbd400FA8ef5be2F0c52cF21263A1D95C58cB" as const);

/** MovrProfile — unique handle, name, bio, avatar (per connected wallet) */
export const PROFILE_ADDRESS =
  env("VITE_PROFILE_ADDRESS") ??
  ("0x9A2AE847Ad36B8A64aa82156331Bd8648A3De31A" as const);

export const MOVR_TOKEN_ADDRESS =
  env("VITE_MOVR_TOKEN") ??
  ("0xD95C0f1F5F5F73e32F87B4f76d6a79809911B7BF" as const);

export const ACHIEVEMENT_NFT_ADDRESS =
  env("VITE_ACHIEVEMENT_NFT") ??
  ("0xe17320E0440Bc1a2CC426772f1712fB5b1627466" as const);

export const STAKING_ADDRESS =
  env("VITE_STAKING") ??
  ("0xbB10eBa7545E2f33212F11c0E426DBdF0814FF48" as const);

/** MovrClubRegistry — clubs ≤10 + treasury factory */
export const CLUB_REGISTRY_ADDRESS =
  env("VITE_CLUB_REGISTRY") ??
  ("0x884D26487362656D0d63078948684d0f56c53D10" as const);

export const CLUB_MEMBER_NFT_ADDRESS =
  env("VITE_CLUB_MEMBER_NFT") ??
  ("0x9a82e7bDa0e15c6144E1bb40012BC3dBFaC2A982" as const);

export const CLUB_BADGE_NFT_ADDRESS =
  env("VITE_CLUB_BADGE_NFT") ??
  ("0xa5630CF7BafF26546e94f02893f148fDd852dd27" as const);

/** MovrClubChallenges — on-chain club running challenges */
export const CLUB_CHALLENGES_ADDRESS =
  env("VITE_CLUB_CHALLENGES") ??
  ("0xD9E13E508eE6f4Fe996Cbf2F0EAD6D1443a74192" as const);

/** MovrMilestoneReward — 1 MOVR/km to runner; +1 MOVR/10km to club treasury if member */
export const MILESTONE_REWARD_ADDRESS =
  env("VITE_MILESTONE_REWARD") ??
  ("0x6ead9Ee219074C9CF746bE46676428e94F893e94" as const);

/** MovrFeed — community + per-wallet run timeline */
export const FEED_ADDRESS =
  env("VITE_FEED_ADDRESS") ??
  ("0x751213c015Cce92F5537FC0285738B7cBa9B2fc5" as const);
