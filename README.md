# Convey - Decentralized Bargaining Marketplace

Convey is a Web3 marketplace built on Avalanche that enables buyers and sellers to negotiate prices in real-time using smart contracts with escrow functionality.

## 🚀 Features

- **Decentralized Escrow**: Funds are locked in smart contracts until both parties agree.
- **Real-time Bargaining**: Make offers, counter-offers, and accept deals instantly.
- **Avalanche Powered**: Fast, low-cost transactions on the C-Chain.
- **Chainlink Integration**: Real-time AVAX/USD price feeds for accurate valuation.
- **Modern UI**: Glassmorphism design with smooth Framer Motion animations.

## 🛠 Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Framer Motion
- **Web3**: Wagmi, Viem, RainbowKit
- **Smart Contracts**: Solidity ^0.8.20, OpenZeppelin
- **Blockchain**: Avalanche C-Chain (Fuji Testnet / Mainnet)

## 📦 Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example`
4. Start the development server:
   ```bash
   npm run dev
   ```

## 🏗 Architecture

```ascii
+---------------------------------------------------------------+
|                        User Interface                         |
|  (Next.js / React / Tailwind / Framer Motion / RainbowKit)    |
+-------------------------------+-------------------------------+
                                |
                                v
+-------------------------------+-------------------------------+
|                       Web3 Libraries                          |
|                   (Wagmi / Viem / Ethers)                     |
+-------------------------------+-------------------------------+
                                |
                                v
+-------------------------------+-------------------------------+
|                   Avalanche C-Chain (RPC)                     |
+---------------+-------------------------------+---------------+
                |                               |
                v                               v
+-------------------------------+   +---------------------------+
|      ConveyMarketplace.sol    |   |   Chainlink Price Feed    |
|  (Escrow, Offers, Listings)   |   |       (AVAX / USD)        |
+-------------------------------+   +---------------------------+
```

## 🏗 Smart Contract Architecture

The `ConveyMarketplace.sol` contract handles:
- Listing creation
- Offer management (Make, Counter, Accept)
- Escrow fund holding
- Fund release upon completion

## 🔗 Deployment

To deploy the smart contracts:
1. Configure your `hardhat.config.ts` (not included in this preview) with Avalanche Fuji settings.
2. Run deployment script.
3. Update the frontend with the new contract address.

## 🛡 Security

- **ReentrancyGuard**: Protects against reentrancy attacks.
- **Ownable**: Contract ownership management.
- **Escrow**: Funds are only released when the agreed conditions are met.

## 🔮 Future Improvements

- IPFS integration for decentralized image storage.
- User reputation system.
- Dispute resolution mechanism (DAO-based).
