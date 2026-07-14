export type AvatarDef = {
  id: number;
  gender: "male" | "female";
  label: string;
  sport: string;
  src: string;
};

export type OnChainProfile = {
  name: string;
  bio: string;
  avatarId: number;
  updatedAt: bigint;
  exists: boolean;
};

export const AVATARS: AvatarDef[] = Array.from({ length: 20 }, (_, id) => {
  const gender = id < 10 ? "male" : "female";
  const labels = [
    "Stride",
    "Tempo",
    "Trail",
    "Relay",
    "Dawn",
    "Pulse",
    "Hill",
    "Pack",
    "Finish",
    "Steady",
  ];
  const sports = [
    "road",
    "track",
    "trail",
    "relay",
    "sunrise",
    "interval",
    "climb",
    "crew",
    "race",
    "easy",
  ];
  const i = id % 10;
  return {
    id,
    gender,
    label: labels[i]!,
    sport: sports[i]!,
    src: `/brand/avatars/avatar-${String(id).padStart(2, "0")}.svg`,
  };
});

export function avatarSrc(avatarId: number): string {
  const a = AVATARS[avatarId] ?? AVATARS[0]!;
  return a.src;
}
