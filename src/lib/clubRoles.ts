/** Club roles — Captain (creator on-chain), Admin (UI-only for now), Member. */

export type ClubRole = "captain" | "admin" | "member";

export const CLUB_ROLE_LABEL: Record<ClubRole, string> = {
  captain: "Captain",
  admin: "Admin",
  member: "Member",
};

const STORAGE_KEY = "movr-club-admins-v1";

type AdminMap = Record<string, string[]>;

function clubKey(clubId: bigint): string {
  return clubId.toString();
}

function readMap(): AdminMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as AdminMap;
  } catch {
    return {};
  }
}

function writeMap(map: AdminMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getClubAdmins(clubId: bigint): `0x${string}`[] {
  const list = readMap()[clubKey(clubId)] ?? [];
  return list
    .filter((a) => typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a))
    .map((a) => a as `0x${string}`);
}

export function isClubAdmin(clubId: bigint, account: string): boolean {
  const lower = account.toLowerCase();
  return getClubAdmins(clubId).some((a) => a.toLowerCase() === lower);
}

export function setClubAdmin(
  clubId: bigint,
  account: `0x${string}`,
  makeAdmin: boolean,
): void {
  const key = clubKey(clubId);
  const map = readMap();
  const lower = account.toLowerCase();
  const current = (map[key] ?? []).filter(
    (a) => typeof a === "string" && a.toLowerCase() !== lower,
  );
  if (makeAdmin) current.push(account);
  map[key] = current;
  writeMap(map);
}

export function resolveClubRole(
  account: string,
  creator: string,
  clubId: bigint,
): ClubRole {
  if (account.toLowerCase() === creator.toLowerCase()) return "captain";
  if (isClubAdmin(clubId, account)) return "admin";
  return "member";
}

export function canProposeSpend(
  account: string,
  creator: string,
  clubId: bigint,
): boolean {
  const role = resolveClubRole(account, creator, clubId);
  return role === "captain" || role === "admin";
}
