# MovrChain Security Audit Reconciliation

**Status: all High / Medium / Low findings from original + Jul 18 reaudits #1–#2 are FIXED** (Info residuals documented).  
Reaudit #3 (Staking Expected rewards UI): frontend **17/20 Good**; Low/Info UX residuals **OPEN** (non-blocking).  
Foundry: `forge test --offline` → **92 passed** (Jul 18 2026 — execute manager gate).

---

## Original audit table → disposition

| Sev | Contract | Issue | Status | Fix |
|-----|----------|--------|--------|-----|
| **High** | Registry + ClubMemberNFT | leave never burns NFT | **FIXED** | `burnMember` on leave |
| **Medium** | AchievementNFT | live boost on transfer | **FIXED** | `tokenBoostBps` snapshot |
| **Medium** | Attestation | stale streak on idle / sub-1 km | **FIXED** | decay + `effectiveCurrentStreakDays`; streak NFT uses active streak only |
| **Medium** | Challenges | any member locks treasury | **FIXED** | manager-only, ≤90d, `cancelChallenge` |
| **Medium** | MilestoneReward | club cut at claim time | **FIXED** | `clubIdAtAttest` snapshotted in attestation |
| **Medium** | ClubTreasury | proposal race on balance | **FIXED** | `totalReserved` / `available()` |
| **Low** | Attestation | self-attest farming | **FIXED** | hard caps + `selfAttestEnabled` / `ATTESTER_ROLE` / `attestRunFor` |
| **Low** | Challenges | dust settle locks escrow | **FIXED** | refund when `pool/winners==0` |
| **Low** | ClubMemberNFT | stale NFT after leave | **FIXED** | same as High burn |
| **Low** | ClubBadgeNFT | transferable; boost unused | **FIXED** | soulbound + wired into `MovrStaking.boostBpsOf` |
| **Low** | MovrStaking | `configureRates` retroactive | **FIXED** | per-user `lockedRate` (future intervals only) |
| **Low** | AchievementNFT | `buyNFT` reentrancy | **FIXED** | `nonReentrant` + N9 |
| **Info** | MovrToken | unlimited mint | **FIXED** | `MAX_SUPPLY` = 1e9 MOVR |
| **Info** | Attestation | owner pause | **FIXED** | retained as intentional ops control (tested) |
| **Info** | Milestone / Staking | no fund withdraw | **FIXED** | `withdrawExcess` (see reaudit #2 note on Milestone) |
| **Info** | Registry | one club / wallet | **FIXED** | enforced on-chain (`clubOf` / `busy`) |
| **Info** | MovrFeed | no pause | **FIXED** | `Ownable` + `Pausable` on publish |

### Extra hardenings (also FIXED)

| Issue | Fix |
|--------|-----|
| Vote after `votingClosed` | `require(!votingClosed)` |
| Unbacked staking rewards | `rewardReserve` |
| Irreversible challenge approve | `revokeApproval` |
| Zero-boost owned-count skip | always adjust `ownedAchievementCount` |
| Redeploy orphans production state | **UUPS + Beacon** with Timelock + 2-of-3 Multisig |
| Any member could `execute` passed proposal | **FIXED** — `isClubManager` (Captain/Admin) only |

---

## Jul 18 2026 reaudit #1 (post-UUPS + gas)

| Sev | Area | Issue | Status | Fix |
|-----|------|--------|--------|-----|
| **Medium** | Deploy | Attestation `DEFAULT_ADMIN` left on deployer | **FIXED** | `PrivilegeHandoff` + U9 |
| **Medium** | Deploy | Deployer kept `ADMIN_ROLE` / `MINTER_ROLE` | **FIXED** | Grant + renounce in library; U9–U10 |
| **Low** | Frontend | Streak progress used undecayed storage | **FIXED** | `effectiveCurrentStreakDays` + N8 |
| **Info** | Frontend | NFT claim OOG | **FIXED** | `monadGas.ts` floors / buffer |

---

## Jul 18 2026 reaudit #2

| Sev | Area | Issue | Status | Fix |
|-----|------|--------|--------|-----|
| **Medium** | Deploy | `ADMIN_ADDRESS` granted pre-handoff survived Timelock cutover | **FIXED** | No pre-handoff grant; Timelock grants after cutover |
| **Medium** | MilestoneReward | `withdrawExcess` can empty claim pool | **OK** (intentional) | Timelock kill-switch; documented — not “excess over liabilities” |
| **Medium** | Frontend gas | VerifyClaim / clubs used 2.0× + “unused refunded” (wrong on Monad) | **FIXED** | Shared `bufferedMonadGas` (1.5×) |
| **Low** | Challenges | Approved leaver still counted in `approvedCount` for settle math | **FIXED** | Settle counts current-member winners only; H11 |
| **Low** | Frontend ABI | `RunAttested` omitted `clubIdAtAttest` | **FIXED** | ABI + `clubIdAtAttest` view |
| **Low** | Frontend UX | Verify reward copy used live `clubOf` | **FIXED** | Prefer `clubIdAtAttest` after attest |
| **Low** | Tests | S6 `rewardReserve` empty path untested | **FIXED** | `testClaimRevertsWhenRewardReserveEmpty` |
| **Info** | MovrToken | Deployer keeps mint admin (immutable token, not in UUPS handoff) | **OK** (ops) | Optional post-cutover hand token admin → Timelock |
| **Info** | Attestation | Deployer keeps `ATTESTER_ROLE` | **OK** (intentional) | Prod: Timelock disables self-attest + `setAttester` |

---

## Jul 18 2026 reaudit #3 (Staking Expected rewards UI)

Scope: `StakingDetailScreen` + `projectStakingRewards` (day / month / year · boost · club yield split).  
Impeccable frontend audit health: **17/20 Good** → post adapt/polish: responsive + caption contrast **FIXED** (A11y↑ · Responsive↑).

| Sev | Area | Issue | Status | Fix / note |
|-----|------|--------|--------|------------|
| **Low** | Frontend UX | Projections use live rate, not mid-interval `lockedRate` | **OK** (documented) | Footnote: “today’s rate”; accrues at locked rate until next harvest |
| **Low** | Frontend UX | Amount field ignored when `staked > 0` | **FIXED** | Label = stake/unstake; note when amount ≠ stake; meta = “Based on your … stake” |
| **Low** | Frontend UX | Club yield column can preview donate % before join/save | **OK** (preview) | Empty + donate copy: preview updates table; save applies on-chain; needs club |
| **Info** | Frontend a11y | Caption / muted meta on surface may sit near AA floor | **FIXED** | Projection meta/note use ink-tinted muted (`color-mix`) |
| **Info** | Frontend responsive | 4-column proj table tight on ~320px | **FIXED** | Stacked Day/Month/Year periods + responsive metric grid |
| **Info** | Frontend | No unit tests for `projectStakingRewards` helper | **OPEN** | Optional Vitest; math mirrored from `MovrStaking` |

Feature shipped:
- Day / month / year gross accrual: `(amount × boostedRate × seconds) / 1e18`
- Boost = `boostBpsOf` (achievements + club badges, capped)
- Club yield stack = `gross × donateBps / 10_000` on claim split

---

## Test matrix

### MovrToken
| ID | Case | Status |
|----|------|--------|
| T1–T4 | Mint / admin / zero owner | ➕ |
| T5 | `MAX_SUPPLY` enforced | ➕ |

### MovrChainAttestation
| ID | Case | Status |
|----|------|--------|
| A1–A12 | Core attest / caps / streak | ✅/➕ |
| A13 | Self-attest disable + attester path | ➕ |
| A14 | Idle / sub-1 km streak decay | ➕ |
| A15 | `clubIdAtAttest` snapshot | ➕ |

### MovrFeed
| ID | Case | Status |
|----|------|--------|
| F1–F5 | Publish / names / pagination | ✅/➕ |
| F6 | Pause blocks publish | ➕ |

### MovrMilestoneReward
| ID | Case | Status |
|----|------|--------|
| R1–R7 | Pay / club cut / empty / non-runner | ✅/➕ |
| R8 | Join-after-attest does **not** get club cut | ➕ |
| R9 | `withdrawExcess` (Timelock kill-switch) | ➕ |

### MovrProfile
| ID | Case | Status |
|----|------|--------|
| P1–P7 | Profile / handles | ✅/➕ |

### MovrStaking
| ID | Case | Status |
|----|------|--------|
| S1–S4 | Stake / donate / claim | ✅/➕ |
| S5 | `configureRates` | ➕ |
| S6 | Empty `rewardReserve` reverts claim | ➕ |
| S7 | Rates not retroactive (`lockedRate`) | ➕ |
| S8 | Frontend day/month/year projection matches live rate × boost | ✅ (UI) |
| S9 | Frontend club yield split uses donate bps (You keep / Club / Gross) | ✅ (UI) |
| S10 | Frontend what-if uses amount field when stake is zero | ✅ (UI) |

### AchievementNFT
| ID | Case | Status |
|----|------|--------|
| N1–N7 | Claim / boost snapshot / market / reentrancy | ✅/➕ |
| N8 | Streak ineligible after idle decay | ➕ |
| N9 | `buyNFT` reentrancy guard (malicious seller) | ➕ |

### Clubs
| ID | Case | Status |
|----|------|--------|
| C1–C15 | Create / vote / leave-burn / reservation / badges soulbound | ✅/➕ |

### Challenges
| ID | Case | Status |
|----|------|--------|
| H1–H10 | Manager create / cancel / dust / revoke | ✅/➕ |
| H11 | Approved leaver forfeits on settle | ➕ |

### Upgradeability (UUPS / Beacon / Multisig / Timelock)
| ID | Case | Status |
|----|------|--------|
| U1 | Multisig 1-of-3 cannot execute | ➕ |
| U2 | Multisig 2-of-3 executes | ➕ |
| U3 | `replaceSigner` only via self-call | ➕ |
| U4 | Timelock premature execute reverts | ➕ |
| U5 | Timelock upgrade preserves attestation state + new logic | ➕ |
| U6 | Direct UUPS upgrade by non-owner reverts | ➕ |
| U7 | Two clubs share beacon; one upgrade hits both; balances intact | ➕ |
| U8 | Non-owner cannot upgrade beacon | ➕ |
| U9 | Privilege handoff: deployer drained; Timelock admin; ATTESTER + registry MINTER kept | ➕ |
| U10 | Drained deployer cannot `grantRole` / `createAchievement` | ➕ |

### Frontend / gas (manual + observed)
| ID | Case | Status |
|----|------|--------|
| N*1 | `claimAchievement` with estimate buffer ≥ URI mint cost | ✅ (3.5M floor) |
| N*2 | Claim preflight `eligible` + clear stuck `claiming` | ✅ |
| N*3 | Streak progress uses `effectiveCurrentStreakDays` | ✅ |
| N*4 | Shared `bufferedMonadGas` (1.5×) for verify + clubs | ✅ |
| N*5 | Reward copy uses `clubIdAtAttest` after attest | ✅ |
| N*6 | Staking Expected rewards: Day / Month / Year stacked periods | ✅ |
| N*7 | Projection includes NFT + club-badge boost via `boostBpsOf` | ✅ |
| N*8 | Club yield column when donate preview > 0 | ✅ |
| N*9 | Projection disclaimer: estimate ≠ guaranteed `rewardReserve` payout | ✅ (README) |

---

## Redeploy / upgrade policy

**Stateful contracts are UUPS proxies** (ClubTreasury via **UpgradeableBeacon**).  
`MovrToken` and `MovrProfile` stay immutable.

| Action | Tool |
|--------|------|
| First upgradeable deploy | `./redeploy-all.sh` → `DeployUpgradeableStack.s.sol` |
| Logic change (no new address) | `./upgrade.sh upgrade <name\|all>` → Multisig confirm → wait delay → `./upgrade.sh execute <name>` |
| Club treasury logic change | `./upgrade.sh upgrade treasury` (`MODE=beacon`) |

Post-deploy wiring (handled by `DeployUpgradeableStack` via `PrivilegeHandoff`):
1. `attestation.setClubRegistry(registry)`
2. `staking.setClubBadges(badges)` + `setClubRegistry`
3. Ownable + AccessControl (`DEFAULT_ADMIN` / `ADMIN_ROLE` / `MINTER_ROLE`) → Timelock; deployer renounces those roles
4. Optional `ADMIN_ADDRESS`: grant AchievementNFT `ADMIN_ROLE` **via Timelock after cutover** (not in the Foundry script)
5. Optional production: `attestation.setSelfAttestEnabled(false)` + grant `ATTESTER_ROLE` (via Timelock / `setAttester`)
