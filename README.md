# Convey Marketplace

Convey is a two-sided marketplace app where sellers can publish products and buyers can negotiate or buy with AVAX.

This project currently uses a hybrid flow:
- Listing creation is handled in the frontend app state (no wallet confirmation on publish).
- Buyer checkout triggers a real wallet transaction (buyer sends AVAX to seller).
- Smart contracts are included in `blockchain/` and can be deployed separately for contract-driven flows.

## What The App Does

### Seller flow
1. Connect wallet.
2. Choose `Seller` role.
3. Publish a listing with title, description, price, stock, and images.
4. Listing appears immediately in the marketplace without a wallet signature popup.

### Buyer flow
1. Connect wallet.
2. Choose `Buyer` role.
3. Browse active listings.
4. Click `Buy Now` to trigger wallet confirmation.
5. After on-chain payment confirmation, stock and purchase history update in the UI.

### Negotiation flow
- Buyers and sellers can exchange offers and messages in-app.
- Negotiation state, notifications, and purchases can be synced in Supabase for real-time cross-device delivery.

## Current State Model

The frontend store (Zustand) is persisted in `localStorage`, so listings and marketplace activity survive wallet switching and page reloads on the same browser profile.

## Tech Stack

- Frontend: React, TypeScript, Vite, Framer Motion
- Web3: Wagmi, Viem, RainbowKit
- State: Zustand (persisted)
- Contracts: Solidity + Hardhat + OpenZeppelin (inside `blockchain/`)
- Network support: Avalanche Fuji and Avalanche C-Chain (configurable)

## Project Structure

- `src/`: frontend app
- `src/components/`: marketplace UI
- `src/store/`: global state
- `src/lib/`: wallet/contract helpers
- `blockchain/`: contracts, tests, deploy scripts

## Run The Frontend

```bash
npm install
npm run dev
```

App runs on:
- `http://localhost:3000`

## Environment Variables

Create `.env` from `.env.example` and set only what you need.

Common variables:
- `VITE_TARGET_CHAIN=fuji` or `avalanche`
- `VITE_CONTRACT_ADDRESS=0x...` (optional, for contract-linked flows)
- `VITE_WALLETCONNECT_PROJECT_ID=...` (optional)

Important:
- Never commit `.env` files or private keys.
- Only commit template files like `.env.example`.

## Enable Realtime Negotiations (Supabase)

To make buyer/seller chat and negotiation events sync across different devices/browsers:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
2. Open Supabase SQL Editor.
3. Run `supabase/negotiations_schema.sql`.

This creates:
- `negotiations`
- `notifications`
- `purchases`

The frontend subscribes to these tables and updates chat state in real time.

## Smart Contracts (Optional)

Contracts live in `blockchain/` and include:
- `ConveyMarketplace.sol`
- Hardhat test suite
- Deploy scripts for Fuji and Avalanche mainnet

Current deployed contract (from `blockchain/deployments.json`):
- Network: `Avalanche Fuji`
- Chain ID: `43113`
- Address: `0x4F86E430D94064826c50C6352E686Ef340208cc6`
- Explorer: `https://testnet.snowtrace.io/address/0x4F86E430D94064826c50C6352E686Ef340208cc6`
- Deployment tx: `https://testnet.snowtrace.io/tx/0x9447113e02d75273a22184a2530b197ed84ae48c7ddd7e60aa4bf7c59d9d8cc5`

Basic commands:

```bash
cd blockchain
npm install
npm run compile
npm run test
npm run deploy:fuji
# or
npm run deploy:avalanche
```

## Notes For Contributors

- Keep UI behavior consistent with the current product decision:
  listing publish without wallet confirmation, payment on buyer checkout.
- If you change payment architecture (for example, full escrow contract flow), update this README in the same PR.
