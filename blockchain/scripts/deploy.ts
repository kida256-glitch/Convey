import { ethers, network } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log('\n========================================');
    console.log('  Convey Marketplace — Deployment');
    console.log('========================================');
    console.log(`Network  : ${network.name} (chainId ${network.config.chainId ?? 'unknown'})`);
    console.log(`Deployer : ${deployer.address}`);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Balance  : ${ethers.formatEther(balance)} AVAX\n`);

    if (balance < ethers.parseEther('0.05')) {
        throw new Error(
            'Deployer balance too low. Get AVAX from the Fuji faucet:\n' +
            'https://core.app/tools/testnet-faucet/?subnet=c&token=c'
        );
    }

    // ── Deploy ──────────────────────────────────────────
    console.log('Deploying ConveyMarketplace…');
    const Factory = await ethers.getContractFactory('ConveyMarketplace');
    const contract = await Factory.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    const txHash = contract.deploymentTransaction()?.hash ?? 'n/a';

    console.log(`\n✅  Contract deployed at: ${address}`);
    console.log(`   Deployment tx       : ${txHash}`);
    console.log(`   Snowtrace (Fuji)    : https://testnet.snowtrace.io/address/${address}\n`);

    // ── Export address + ABI for frontend ────────────────
    const artifactPath = path.join(
        __dirname,
        '..',
        'artifacts',
        'contracts',
        'ConveyMarketplace.sol',
        'ConveyMarketplace.json'
    );

    const frontendDir = path.join(__dirname, '..', '..', 'src', 'lib');
    const frontendPath = path.join(frontendDir, 'contract.ts');

    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
        const output = `// AUTO-GENERATED — do not edit by hand.
// Re-run: cd blockchain && npm run deploy:fuji

export const CONVEY_ADDRESS = '${address}' as const;

export const CONVEY_ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;
`;
        fs.mkdirSync(frontendDir, { recursive: true });
        fs.writeFileSync(frontendPath, output, 'utf-8');
        console.log(`📄  ABI + address written to src/lib/contract.ts`);
    } else {
        console.warn('⚠️  Artifact not found — run "npm run compile" first, then re-deploy.');
    }

    // ── Save deployment record ────────────────────────────
    const record = {
        network: network.name,
        chainId: network.config.chainId,
        deployer: deployer.address,
        address,
        txHash,
        timestamp: new Date().toISOString(),
    };
    const recordPath = path.join(__dirname, '..', 'deployments.json');
    let existing: any[] = [];
    if (fs.existsSync(recordPath)) {
        existing = JSON.parse(fs.readFileSync(recordPath, 'utf-8'));
    }
    existing.push(record);
    fs.writeFileSync(recordPath, JSON.stringify(existing, null, 2));
    console.log(`📑  Deployment record saved to blockchain/deployments.json`);
    console.log('\nDone! 🎉');
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
