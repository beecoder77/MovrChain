# MovrChain

Monad-native running tracker — import GPX, replay your route, verify on-chain, claim milestone rewards.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 and upload `public/sample-run.gpx` to test the full flow.

## Flow

1. **Import** — Upload GPX (Strava, Apple Watch, Garmin)
2. **Replay** — Stat-dominant orange screen with route animation
3. **Summary** — Full stats + map
4. **Verify** — On-chain attestation on Monad testnet (optional wallet)

## Deploy contract (Monad testnet)

```bash
cd contracts
forge create src/MovrChainAttestation.sol:MovrChainAttestation \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY
```

Set the deployed address:

```bash
echo "VITE_CONTRACT_ADDRESS=0xYourAddress" > .env.local
```

Chain: Monad Testnet (10143) · Faucet: https://faucet.monad.xyz

## Demo without contract

If `VITE_CONTRACT_ADDRESS` is unset, Screen 4 uses **Simulate verify** for judge demos.
