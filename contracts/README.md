# MovrChain contracts — Monad deploy

## Contracts

| Contract | Role |
|----------|------|
| `MovrToken` (MOVR) | ERC-20; owner mints; can assign ADMIN |
| `MovrChainAttestation` | GPX run proof + streak stats |
| `AchievementNFT` (MAVT) | Admin creates achievements; runners claim; list/buy in MON |
| `MovrStaking` | Stake MOVR; rewards accelerate with Achievement boost |
| `MovrProfile` | On-chain name, bio, athletic avatarId (0–19); free `setProfile` |

**Roles**
- `DEFAULT_ADMIN_ROLE` (contract creator / deployer): mint MOVR, assign admins, fund staking, transfer ownership powers
- `ADMIN_ROLE`: create/configure achievements, set staking rates

## Profile (MovrProfile)

Deploy alone (keeps existing token/attestation/NFT/staking):

```bash
./deploy-profile.sh
# → set VITE_PROFILE_ADDRESS in the Vite app `.env`
```

Avatars: `../public/brand/avatars/avatar-00.svg` … `avatar-19.svg` (10 male, 10 female). Regenerate with `npm run generate:avatars`.

## Brand art & NFT metadata

- MOVR logo: `../public/brand/movr-logo.svg` (+ `movr-logo-32.svg`)
- Achievement badges: `../public/brand/achievements/*.svg`
- Local ERC-721 JSON: `../public/metadata/achievements/*.json`
- On-chain data URIs: `metadata/*.uri.txt` (from `npm run generate:art`)

The first testnet NFT used placeholder `ipfs://` URIs and had no `setAchievementURI`. To push real art on-chain (keeps MOVR + attestation):

```bash
./redeploy-nft-staking.sh
# paste new ACHIEVEMENT_NFT + STAKING into .env
./fund-rewards.sh
# later art-only refresh:
./update-achievement-uris.sh
```

## Seeded achievements (deploy script)

| Name | Criterion | Threshold | Boost |
|------|-----------|-----------|-------|
| First Kilometer | Single run | 1 km | +3% |
| First 5K | Single run | 5 km | +5% |
| First 10K | Single run | 10 km | +8% |
| First Half Marathon | Single run | 21.098 km | +12% |
| First Marathon | Single run | 42.195 km | +20% |
| 7-Day Streak | Streak (≥1 km/day) | 7 | +7% |
| 14-Day Streak | Streak | 14 | +12% |
| 30-Day Streak | Streak | 30 | +20% |
| Double Digits Total | Lifetime | 10 km | +4% |
| Century Club | Lifetime | 100 km | +15% |

## Setup

```bash
# Install Monad Foundry (recommended for correct gas model)
foundryup --network monad

cd contracts
cp .env.example .env
# Put a funded Monad testnet private key in PRIVATE_KEY
```

Fund deployer via the [Monad faucet](https://faucet.monad.xyz/).

## Compile & test

```bash
forge build
forge test -vv
```

## Check admin / owner role

After deploy, put contract addresses in `.env`, then:

```bash
./check-role.sh                 # uses CHECK_ADDRESS or PRIVATE_KEY wallet
./check-role.sh 0xYourAddress   # check a specific wallet
```

Reports `DEFAULT_ADMIN_ROLE` (owner) and `ADMIN_ROLE` (admin) on MovrToken, AchievementNFT, and MovrStaking.

## Deploy to Monad Testnet (chain 10143)

```bash
source .env
forge script script/DeployMovrChain.s.sol:DeployMovrChain \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --legacy
```

Copy logged addresses into the app:

```bash
# repo root .env
VITE_CONTRACT_ADDRESS=<ATTESTATION address>
VITE_MOVR_TOKEN=<MOVR_TOKEN>
VITE_ACHIEVEMENT_NFT=<ACHIEVEMENT_NFT>
VITE_STAKING=<STAKING>
```

## Verify (MonadVision / Sourcify)

```bash
forge verify-contract <address> src/MovrToken.sol:MovrToken \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org \
  --constructor-args $(cast abi-encode "constructor(address)" <owner>)
```

Repeat for other contracts with their constructor args.

## Gas note (Monad)

Monad charges on **gas_limit**, not gas used. Prefer realistic limits; avoid padded huge estimates.
