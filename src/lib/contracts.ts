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
  ("0xD033D62f52C851369FFdDbDd7eD0Fcf41630821b" as const);

/** MovrMilestoneReward — claim MOVR for ≥1 km attested runs (1 MOVR/km) */
export const MILESTONE_REWARD_ADDRESS =
  env("VITE_MILESTONE_REWARD") ??
  ("0xDfF2d87173eD482B62357C3d4b91d35d62f8869A" as const);

/** MovrFeed — community + per-wallet run timeline */
export const FEED_ADDRESS =
  env("VITE_FEED_ADDRESS") ??
  ("0x751213c015Cce92F5537FC0285738B7cBa9B2fc5" as const);
