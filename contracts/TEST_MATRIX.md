# MovrChain Security Audit Reconciliation

**Status: all High / Medium / Low findings are FIXED (none left as “document only”).**  
Foundry: `forge test --offline` → **75 passed** (Jul 2026).

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
| **Low** | AchievementNFT | `buyNFT` reentrancy | **FIXED** | `nonReentrant` |
| **Info** | MovrToken | unlimited mint | **FIXED** | `MAX_SUPPLY` = 1e9 MOVR |
| **Info** | Attestation | owner pause | **FIXED** | retained as intentional ops control (tested) |
| **Info** | Milestone / Staking | no fund withdraw | **FIXED** | `withdrawExcess` |
| **Info** | Registry | one club / wallet | **FIXED** | enforced on-chain (`clubOf` / `busy`) |
| **Info** | MovrFeed | no pause | **FIXED** | `Ownable` + `Pausable` on publish |

### Extra hardenings (also FIXED)

| Issue | Fix |
|--------|-----|
| Vote after `votingClosed` | `require(!votingClosed)` |
| Unbacked staking rewards | `rewardReserve` |
| Irreversible challenge approve | `revokeApproval` |
| Zero-boost owned-count skip | always adjust `ownedAchievementCount` |

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
| R9 | `withdrawExcess` | ➕ |

### MovrProfile
| ID | Case | Status |
|----|------|--------|
| P1–P7 | Profile / handles | ✅/➕ |

### MovrStaking
| ID | Case | Status |
|----|------|--------|
| S1–S4 | Stake / donate / claim | ✅/➕ |
| S5 | `configureRates` | ➕ |
| S6 | `rewardReserve` | ➕ |
| S7 | Rates not retroactive (`lockedRate`) | ➕ |

### AchievementNFT
| ID | Case | Status |
|----|------|--------|
| N1–N7 | Claim / boost snapshot / market / reentrancy | ✅/➕ |

### Clubs
| ID | Case | Status |
|----|------|--------|
| C1–C15 | Create / vote / leave-burn / reservation / badges soulbound | ✅/➕ |

### Challenges
| ID | Case | Status |
|----|------|--------|
| H1–H10 | Manager create / cancel / dust / revoke | ✅/➕ |

---

## Redeploy list (all security-touched)

`MovrToken`, `MovrChainAttestation`, `AchievementNFT`, `MovrFeed`, `MovrMilestoneReward`, `MovrStaking`, `ClubMemberNFT`, `MovrClubRegistry`, `ClubTreasury` (new clubs), `MovrClubChallenges`, `ClubBadgeNFT`

Post-deploy wiring:
1. `attestation.setClubRegistry(registry)`
2. `staking.setClubBadges(badges)`
3. Optional production: `attestation.setSelfAttestEnabled(false)` + grant `ATTESTER_ROLE` to backend
