/** Club roles — Captain (creator on-chain), Admin (on-chain), Member. */

export type ClubRole = "captain" | "admin" | "member";

export const CLUB_ROLE_LABEL: Record<ClubRole, string> = {
  captain: "Captain",
  admin: "Admin",
  member: "Member",
};

export function resolveClubRole(
  account: string,
  creator: string,
  isAdminOnChain: boolean,
): ClubRole {
  if (account.toLowerCase() === creator.toLowerCase()) return "captain";
  if (isAdminOnChain) return "admin";
  return "member";
}

export function canProposeSpend(isManager: boolean): boolean {
  return isManager;
}
