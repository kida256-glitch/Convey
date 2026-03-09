import { ACTIVE_CHAIN_ID } from '../wagmi';

const CHAIN_CONFIG: Record<number, {
    hex: string;
    name: string;
    rpcUrls: string[];
    blockExplorerUrls: string[];
}> = {
    43113: {
        hex: '0xA869',
        name: 'Avalanche Fuji C-Chain',
        rpcUrls: [
            'https://api.avax-test.network/ext/bc/C/rpc',
            'https://avalanche-fuji-c-chain-rpc.publicnode.com',
        ],
        blockExplorerUrls: ['https://testnet.snowtrace.io'],
    },
    43114: {
        hex: '0xA86A',
        name: 'Avalanche C-Chain',
        rpcUrls: [
            'https://api.avax.network/ext/bc/C/rpc',
            'https://avalanche-c-chain-rpc.publicnode.com',
        ],
        blockExplorerUrls: ['https://snowtrace.io'],
    },
};

const activeChainConfig = CHAIN_CONFIG[ACTIVE_CHAIN_ID] ?? CHAIN_CONFIG[43113];
export const ACTIVE_CHAIN_HEX = activeChainConfig.hex;

export async function ensureActiveChainInWallet() {
    const eth = (window as any).ethereum;
    if (!eth?.request) return;

    await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
            {
                chainId: activeChainConfig.hex,
                chainName: activeChainConfig.name,
                nativeCurrency: {
                    name: 'Avalanche',
                    symbol: 'AVAX',
                    decimals: 18,
                },
                rpcUrls: activeChainConfig.rpcUrls,
                blockExplorerUrls: activeChainConfig.blockExplorerUrls,
            },
        ],
    });
}

export async function getWalletChainHex() {
    const eth = (window as any).ethereum;
    if (!eth?.request) return null;
    return (await eth.request({ method: 'eth_chainId' })) as string;
}

export async function switchToActiveChainInWallet() {
    const eth = (window as any).ethereum;
    if (!eth?.request) return false;

    try {
        await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: activeChainConfig.hex }],
        });
    } catch {
        return false;
    }

    const activeChain = await getWalletChainHex();
    return activeChain?.toLowerCase() === activeChainConfig.hex.toLowerCase();
}
