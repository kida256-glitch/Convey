import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import * as dotenv from 'dotenv';

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? '';
const SNOWTRACE_API_KEY = process.env.SNOWTRACE_API_KEY ?? 'verifyPlaceholder';

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.24',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },

    networks: {
        fuji: {
            url: 'https://api.avax-test.network/ext/bc/C/rpc',
            chainId: 43113,
            accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
            gasMultiplier: 1.5,
        },
        avalanche: {
            url: 'https://api.avax.network/ext/bc/C/rpc',
            chainId: 43114,
            accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
            gasMultiplier: 1.2,
        },
    },

    etherscan: {
        apiKey: {
            avalancheFujiTestnet: SNOWTRACE_API_KEY,
            avalanche: SNOWTRACE_API_KEY,
        },
        customChains: [
            {
                network: 'avalancheFujiTestnet',
                chainId: 43113,
                urls: {
                    apiURL: 'https://api-testnet.snowtrace.io/api',
                    browserURL: 'https://testnet.snowtrace.io',
                },
            },
            {
                network: 'avalanche',
                chainId: 43114,
                urls: {
                    apiURL: 'https://api.snowtrace.io/api',
                    browserURL: 'https://snowtrace.io',
                },
            },
        ],
    },

    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },

    typechain: {
        outDir: 'typechain-types',
        target: 'ethers-v6',
    },
};

export default config;
