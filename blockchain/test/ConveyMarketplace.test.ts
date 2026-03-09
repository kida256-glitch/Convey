import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import type { ConveyMarketplace } from '../typechain-types';

const ONE_AVAX = ethers.parseEther('1');
const HALF_AVAX = ethers.parseEther('0.5');
const TWO_AVAX = ethers.parseEther('2');

describe('ConveyMarketplace', () => {
    let marketplace: ConveyMarketplace;
    let owner: SignerWithAddress;
    let seller: SignerWithAddress;
    let buyer: SignerWithAddress;
    let buyer2: SignerWithAddress;

    beforeEach(async () => {
        [owner, seller, buyer, buyer2] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory('ConveyMarketplace');
        marketplace = await Factory.deploy() as unknown as ConveyMarketplace;
        await marketplace.waitForDeployment();
    });

    // ─── Listings ──────────────────────────────────────────────────────
    describe('createListing', () => {
        it('creates a listing and emits ListingCreated', async () => {
            await expect(
                marketplace.connect(seller).createListing('Item A', 'Desc', 'ipfs://cid', ONE_AVAX, 10)
            )
                .to.emit(marketplace, 'ListingCreated')
                .withArgs(1, seller.address, ONE_AVAX, 10);

            const l = await marketplace.listings(1);
            expect(l.seller).to.equal(seller.address);
            expect(l.priceWei).to.equal(ONE_AVAX);
            expect(l.stock).to.equal(10);
            expect(l.status).to.equal(0); // Active
        });

        it('reverts with empty title', async () => {
            await expect(
                marketplace.connect(seller).createListing('', 'Desc', '', ONE_AVAX, 5)
            ).to.be.revertedWith('Title required');
        });

        it('reverts with zero price', async () => {
            await expect(
                marketplace.connect(seller).createListing('X', 'Desc', '', 0, 5)
            ).to.be.revertedWith('Price must be > 0');
        });

        it('reverts with zero stock', async () => {
            await expect(
                marketplace.connect(seller).createListing('X', 'Desc', '', ONE_AVAX, 0)
            ).to.be.revertedWith('Stock must be > 0');
        });
    });

    describe('cancelListing', () => {
        beforeEach(async () => {
            await marketplace.connect(seller).createListing('Item', '', '', ONE_AVAX, 5);
        });

        it('seller can cancel an active listing', async () => {
            await expect(marketplace.connect(seller).cancelListing(1))
                .to.emit(marketplace, 'ListingCancelled').withArgs(1);
            const l = await marketplace.listings(1);
            expect(l.status).to.equal(2); // Cancelled
        });

        it('non-seller cannot cancel', async () => {
            await expect(marketplace.connect(buyer).cancelListing(1))
                .to.be.revertedWith('Not the seller');
        });
    });

    // ─── Buy Direct ───────────────────────────────────────────────────
    describe('buyDirect', () => {
        beforeEach(async () => {
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 3);
        });

        it('transfers funds to seller and decrements stock', async () => {
            const sellerBefore = await ethers.provider.getBalance(seller.address);
            await marketplace.connect(buyer).buyDirect(1, { value: ONE_AVAX });
            const sellerAfter = await ethers.provider.getBalance(seller.address);

            // Seller received ONE_AVAX (fee is 0)
            expect(sellerAfter - sellerBefore).to.equal(ONE_AVAX);

            const l = await marketplace.listings(1);
            expect(l.stock).to.equal(2);
        });

        it('marks listing Sold when last unit is purchased', async () => {
            await marketplace.connect(seller).updateListing(1, ONE_AVAX, 1);
            await expect(marketplace.connect(buyer).buyDirect(1, { value: ONE_AVAX }))
                .to.emit(marketplace, 'ListingSold').withArgs(1, 0);
            const l = await marketplace.listings(1);
            expect(l.status).to.equal(1); // Sold
        });

        it('reverts when sending wrong amount', async () => {
            await expect(
                marketplace.connect(buyer).buyDirect(1, { value: HALF_AVAX })
            ).to.be.revertedWith('Send exact listing price');
        });

        it('reverts when seller tries to buy own item', async () => {
            await expect(
                marketplace.connect(seller).buyDirect(1, { value: ONE_AVAX })
            ).to.be.revertedWith('Seller cannot buy own item');
        });
    });

    // ─── Offer flow ───────────────────────────────────────────────────
    describe('makeOffer + acceptOffer', () => {
        beforeEach(async () => {
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 5);
        });

        it('creates an offer with deposited funds', async () => {
            await expect(
                marketplace.connect(buyer).makeOffer(1, { value: HALF_AVAX })
            ).to.emit(marketplace, 'OfferCreated').withArgs(1, 1, buyer.address, HALF_AVAX);

            const [, , , deposit, ,] = await marketplace.getOfferDetails(1);
            expect(deposit).to.equal(HALF_AVAX);
        });

        it('seller accepts offer — funds released', async () => {
            await marketplace.connect(buyer).makeOffer(1, { value: HALF_AVAX });

            const sellerBefore = await ethers.provider.getBalance(seller.address);
            const tx = await marketplace.connect(seller).acceptOffer(1);
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * tx.gasPrice;
            const sellerAfter = await ethers.provider.getBalance(seller.address);

            // Seller gained HALF_AVAX minus gas
            expect(sellerAfter - sellerBefore + gasUsed).to.equal(HALF_AVAX);

            const [, , , , , status] = await marketplace.getOfferDetails(1);
            expect(status).to.equal(2); // Accepted
        });
    });

    // ─── Counter-offer flow ───────────────────────────────────────────
    describe('counterOffer + acceptCounter', () => {
        beforeEach(async () => {
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 5);
            await marketplace.connect(buyer).makeOffer(1, { value: HALF_AVAX });
        });

        it('seller counters; buyer accepts by topping up', async () => {
            await marketplace.connect(seller).counterOffer(1, ONE_AVAX);

            const topUp = ONE_AVAX - HALF_AVAX;
            const sellerBefore = await ethers.provider.getBalance(seller.address);

            await marketplace.connect(buyer).acceptCounter(1, { value: topUp });

            const sellerAfter = await ethers.provider.getBalance(seller.address);
            expect(sellerAfter - sellerBefore).to.be.closeTo(ONE_AVAX, ethers.parseEther('0.01'));
        });

        it('seller counters lower; buyer gets refund', async () => {
            const lowerCounter = ethers.parseEther('0.25');
            await marketplace.connect(seller).counterOffer(1, lowerCounter);

            const buyerBefore = await ethers.provider.getBalance(buyer.address);
            const tx = await marketplace.connect(buyer).acceptCounter(1, { value: 0 });
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * tx.gasPrice;
            const buyerAfter = await ethers.provider.getBalance(buyer.address);

            // Buyer's net change: received refund of (0.5 - 0.25) = 0.25, minus gas
            const refund = HALF_AVAX - lowerCounter;
            expect(buyerAfter - buyerBefore + gasUsed).to.be.closeTo(refund, ethers.parseEther('0.001'));
        });
    });

    // ─── Cancel / Reject flow ─────────────────────────────────────────
    describe('cancelOffer', () => {
        it('buyer cancels and is refunded', async () => {
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 5);
            await marketplace.connect(buyer).makeOffer(1, { value: HALF_AVAX });

            const before = await ethers.provider.getBalance(buyer.address);
            const tx = await marketplace.connect(buyer).cancelOffer(1);
            const receipt = await tx.wait();
            const gas = receipt!.gasUsed * tx.gasPrice;
            const after = await ethers.provider.getBalance(buyer.address);

            expect(after - before + gas).to.be.closeTo(HALF_AVAX, ethers.parseEther('0.001'));
        });
    });

    describe('rejectOffer', () => {
        it('seller rejects and buyer is refunded', async () => {
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 5);
            await marketplace.connect(buyer).makeOffer(1, { value: HALF_AVAX });

            const before = await ethers.provider.getBalance(buyer.address);
            await marketplace.connect(seller).rejectOffer(1);
            const after = await ethers.provider.getBalance(buyer.address);

            expect(after - before).to.equal(HALF_AVAX);
        });
    });

    // ─── Platform fee ─────────────────────────────────────────────────
    describe('platformFee', () => {
        it('owner can set fee up to 5%', async () => {
            await marketplace.connect(owner).setPlatformFee(200); // 2 %
            expect(await marketplace.platformFeeBps()).to.equal(200);
        });

        it('reverts if fee > 5%', async () => {
            await expect(marketplace.connect(owner).setPlatformFee(600))
                .to.be.revertedWith('Fee exceeds max');
        });

        it('deducts fee from direct purchase', async () => {
            await marketplace.connect(owner).setPlatformFee(100); // 1 %
            await marketplace.connect(seller).createListing('Widget', '', '', ONE_AVAX, 5);

            const sellerBefore = await ethers.provider.getBalance(seller.address);
            await marketplace.connect(buyer).buyDirect(1, { value: ONE_AVAX });
            const sellerAfter = await ethers.provider.getBalance(seller.address);

            const expectedPayout = ONE_AVAX - ONE_AVAX / 100n; // 1 % fee
            expect(sellerAfter - sellerBefore).to.equal(expectedPayout);
        });
    });
});
