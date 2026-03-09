import { createConfig, http, fallback } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { avalanche, avalancheFuji } from 'wagmi/chains';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';

// Read project ID from env — WalletConnect only included when a real ID is set
const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '';
const normalizedProjectId = wcProjectId.trim();
const hasRealProjectId =
  normalizedProjectId.length > 0 &&
  normalizedProjectId !== 'YOUR_PROJECT_ID' &&
  normalizedProjectId !== 'convey-dev-placeholder';

// Some wallet SDK paths expect a non-empty, URL-safe projectId string.
// Keep a syntactically valid fallback in local/dev when WalletConnect is disabled.
const safeProjectId = hasRealProjectId
  ? normalizedProjectId
  : '11111111111111111111111111111111';

const wallets = [
  injectedWallet,        // MetaMask + any injected browser wallet
  ...(hasRealProjectId ? [metaMaskWallet] : []),
  ...(hasRealProjectId ? [coinbaseWallet, walletConnectWallet] : []),
];

const connectors = hasRealProjectId
  ? connectorsForWallets(
    [{ groupName: 'Wallets', wallets }],
    {
      appName: 'Convey Marketplace',
      projectId: safeProjectId,
    },
  )
  : [injected()];

const targetChainEnv = String(import.meta.env.VITE_TARGET_CHAIN ?? 'fuji').toLowerCase();
const isMainnetTarget = targetChainEnv === 'avalanche' || targetChainEnv === 'mainnet' || targetChainEnv === 'cchain';
export const ACTIVE_CHAIN = isMainnetTarget ? avalanche : avalancheFuji;
export const ACTIVE_CHAIN_ID = ACTIVE_CHAIN.id;
export const ACTIVE_CHAIN_NAME = isMainnetTarget ? 'Avalanche C-Chain' : 'Avalanche Fuji Testnet';

// Multiple public Fuji RPC endpoints — wagmi will try them in order
const fujiFallback = fallback([
  http('https://api.avax-test.network/ext/bc/C/rpc'),
  http('https://avalanche-fuji-c-chain-rpc.publicnode.com'),
]);

// Fuji listed first so it becomes the default chain
export const config = createConfig({
  connectors,
  chains: [avalancheFuji, avalanche],
  transports: {
    [avalancheFuji.id]: fujiFallback,
    [avalanche.id]: http('https://api.avax.network/ext/bc/C/rpc'),
  },
  ssr: false,
});

export const FUJI_CHAIN_ID = avalancheFuji.id; // 43113
export const AVALANCHE_CHAIN_ID = avalanche.id; // 43114
