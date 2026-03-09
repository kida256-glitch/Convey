// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  ConveyMarketplace
/// @notice Decentralised peer-to-peer marketplace on Avalanche.
///         Sellers list items with an asking price and a stock count.
///         Buyers can either:
///           (a) Buy at the asking price immediately (buyDirect), or
///           (b) Start a negotiation: makeOffer → counterOffer / acceptOffer.
///         Offer funds are held in escrow inside this contract until the
///         deal is finalised or cancelled.
contract ConveyMarketplace is ReentrancyGuard, Ownable {
    // ─────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────
    /// @dev Platform fee in basis points (100 = 1 %).  Starts at 0 for launch.
    uint16 public platformFeeBps;
    uint16 public constant MAX_FEE_BPS = 500; // 5 % hard cap

    // ─────────────────────────────────────────────
    //  Enums
    // ─────────────────────────────────────────────
    enum ListingStatus {
        Active,
        Sold,
        Cancelled
    }
    enum OfferStatus {
        Open,
        Countered,
        Accepted,
        Rejected,
        Cancelled
    }

    // ─────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────
    struct Listing {
        uint256 id;
        address payable seller;
        string title;
        string description;
        string imageURI; // primary image URI (IPFS CID or https)
        uint256 priceWei; // asking price per unit in wei
        uint32 stock; // units available
        ListingStatus status;
    }

    struct Offer {
        uint256 id;
        uint256 listingId;
        address payable buyer;
        uint256 depositWei; // how much the buyer has deposited into escrow
        uint256 counterWei; // seller's counter price (0 if none)
        OfferStatus status;
    }

    struct Escrow {
        address payable buyer;
        uint256 amountWei;
    }

    // ─────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────
    uint256 public listingCount;
    uint256 public offerCount;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;

    /// @dev listingId -> escrow payment funded by buyer.
    mapping(uint256 => Escrow) public escrows;

    /// @dev seller address -> released escrow amount available for withdrawal.
    mapping(address => uint256) public pendingWithdrawals;

    /// @dev listingId → list of offerIds
    mapping(uint256 => uint256[]) private _listingOffers;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────
    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 priceWei,
        uint32 stock
    );
    event ListingUpdated(
        uint256 indexed listingId,
        uint256 newPriceWei,
        uint32 newStock
    );
    event ListingCancelled(uint256 indexed listingId);
    event ListingSold(uint256 indexed listingId, uint32 remainingStock);

    event DirectPurchase(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 amountWei
    );

    event OfferCreated(
        uint256 indexed offerId,
        uint256 indexed listingId,
        address indexed buyer,
        uint256 depositWei
    );
    event OfferCountered(uint256 indexed offerId, uint256 counterWei);
    event OfferAccepted(uint256 indexed offerId, uint256 finalAmountWei);
    event OfferRejected(uint256 indexed offerId);
    event OfferCancelled(uint256 indexed offerId);
    event FundsReleased(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 amountWei
    );
    event EscrowDeposited(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 amountWei
    );
    event SellerWithdrawal(address indexed seller, uint256 amountWei);

    event FeeBpsUpdated(uint16 newBps);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────
    modifier listingExists(uint256 _listingId) {
        require(
            _listingId > 0 && _listingId <= listingCount,
            "Listing not found"
        );
        _;
    }

    modifier offerExists(uint256 _offerId) {
        require(_offerId > 0 && _offerId <= offerCount, "Offer not found");
        _;
    }

    modifier onlyListingSeller(uint256 _listingId) {
        require(listings[_listingId].seller == msg.sender, "Not the seller");
        _;
    }

    modifier onlyOfferBuyer(uint256 _offerId) {
        require(offers[_offerId].buyer == msg.sender, "Not the buyer");
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────
    constructor() Ownable(msg.sender) {
        platformFeeBps = 0; // fees start at zero; owner can enable later
    }

    // ─────────────────────────────────────────────
    //  Seller: Listing management
    // ─────────────────────────────────────────────

    /// @notice Create a new product listing.
    /// @param _title       Display name of the item.
    /// @param _description Short description.
    /// @param _imageURI    Primary image URI (IPFS or https).
    /// @param _priceWei    Asking price per unit in wei.
    /// @param _stock       Number of units available (≥ 1).
    function createListing(
        string calldata _title,
        string calldata _description,
        string calldata _imageURI,
        uint256 _priceWei,
        uint32 _stock
    ) external returns (uint256 listingId) {
        listingId = _createListing(
            _title,
            _description,
            _imageURI,
            _priceWei,
            _stock
        );
    }

    /// @notice Alias used by frontend flows that call listProduct.
    function listProduct(
        string calldata _title,
        string calldata _description,
        string calldata _imageURI,
        uint256 _priceWei,
        uint32 _stock
    ) external returns (uint256 listingId) {
        listingId = _createListing(
            _title,
            _description,
            _imageURI,
            _priceWei,
            _stock
        );
    }

    /// @notice Buyer deposits AVAX into escrow for a listing.
    ///         Funds remain locked until seller calls releaseFunds.
    function depositToEscrow(
        uint256 _listingId
    ) external payable nonReentrant listingExists(_listingId) {
        Listing storage l = listings[_listingId];
        Escrow storage e = escrows[_listingId];

        require(l.status == ListingStatus.Active, "Listing not active");
        require(l.stock > 0, "Out of stock");
        require(msg.sender != l.seller, "Seller cannot deposit");
        require(msg.value > 0, "Deposit must be > 0");
        require(e.amountWei == 0, "Escrow already funded");

        escrows[_listingId] = Escrow({
            buyer: payable(msg.sender),
            amountWei: msg.value
        });

        emit EscrowDeposited(_listingId, msg.sender, msg.value);
    }

    /// @notice Seller confirms completion and releases escrow.
    ///         Funds move into seller's pending withdrawals.
    function releaseFunds(
        uint256 _listingId
    ) external listingExists(_listingId) onlyListingSeller(_listingId) {
        Listing storage l = listings[_listingId];
        Escrow storage e = escrows[_listingId];

        require(l.status == ListingStatus.Active, "Listing not active");
        require(l.stock > 0, "Out of stock");
        require(e.amountWei > 0, "Escrow not funded");

        uint256 amount = e.amountWei;
        address payable buyer = e.buyer;

        // Checks-effects-interactions: clear escrow and account payout before transfer.
        delete escrows[_listingId];
        _finaliseStock(l);

        uint256 fee = (amount * platformFeeBps) / 10_000;
        uint256 payout = amount - fee;
        pendingWithdrawals[l.seller] += payout;

        emit FundsReleased(_listingId, l.seller, buyer, amount);
    }

    /// @notice Seller withdraws released escrow funds.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdrawal failed");

        emit SellerWithdrawal(msg.sender, amount);
    }

    function _createListing(
        string calldata _title,
        string calldata _description,
        string calldata _imageURI,
        uint256 _priceWei,
        uint32 _stock
    ) internal returns (uint256 listingId) {
        require(bytes(_title).length > 0, "Title required");
        require(_priceWei > 0, "Price must be > 0");
        require(_stock > 0, "Stock must be > 0");

        listingCount++;
        listingId = listingCount;

        listings[listingId] = Listing({
            id: listingId,
            seller: payable(msg.sender),
            title: _title,
            description: _description,
            imageURI: _imageURI,
            priceWei: _priceWei,
            stock: _stock,
            status: ListingStatus.Active
        });

        emit ListingCreated(listingId, msg.sender, _priceWei, _stock);
    }

    /// @notice Update price and/or stock of an active listing.
    function updateListing(
        uint256 _listingId,
        uint256 _newPriceWei,
        uint32 _newStock
    ) external listingExists(_listingId) onlyListingSeller(_listingId) {
        Listing storage l = listings[_listingId];
        require(l.status == ListingStatus.Active, "Listing not active");
        require(_newPriceWei > 0, "Price must be > 0");
        require(_newStock > 0, "Stock must be > 0");

        l.priceWei = _newPriceWei;
        l.stock = _newStock;

        emit ListingUpdated(_listingId, _newPriceWei, _newStock);
    }

    /// @notice Permanently remove a listing from the marketplace.
    function cancelListing(
        uint256 _listingId
    ) external listingExists(_listingId) onlyListingSeller(_listingId) {
        Listing storage l = listings[_listingId];
        require(l.status == ListingStatus.Active, "Listing not active");
        l.status = ListingStatus.Cancelled;
        emit ListingCancelled(_listingId);
    }

    // ─────────────────────────────────────────────
    //  Buyer: Direct purchase (Buy Now)
    // ─────────────────────────────────────────────

    /// @notice Buy one unit at the listing's asking price.
    ///         The buyer must send exactly `listing.priceWei`.
    ///         Funds go directly to the seller (minus platform fee).
    function buyDirect(
        uint256 _listingId
    ) external payable nonReentrant listingExists(_listingId) {
        Listing storage l = listings[_listingId];
        require(l.status == ListingStatus.Active, "Listing not active");
        require(msg.sender != l.seller, "Seller cannot buy own item");
        require(msg.value == l.priceWei, "Send exact listing price");
        require(l.stock > 0, "Out of stock");

        // Decrement stock
        l.stock--;
        if (l.stock == 0) {
            l.status = ListingStatus.Sold;
            emit ListingSold(_listingId, 0);
        }

        // Calculate & retain platform fee
        uint256 fee = (msg.value * platformFeeBps) / 10_000;
        uint256 payout = msg.value - fee;

        // Transfer to seller
        (bool ok, ) = l.seller.call{value: payout}("");
        require(ok, "Transfer to seller failed");

        emit DirectPurchase(_listingId, msg.sender, l.seller, msg.value);
    }

    // ─────────────────────────────────────────────
    //  Buyer: Offer / Negotiation flow
    // ─────────────────────────────────────────────

    /// @notice Submit an offer by depositing AVAX into escrow.
    ///         The deposited amount is the buyer's initial offer.
    function makeOffer(
        uint256 _listingId
    )
        external
        payable
        nonReentrant
        listingExists(_listingId)
        returns (uint256 offerId)
    {
        Listing storage l = listings[_listingId];
        require(l.status == ListingStatus.Active, "Listing not active");
        require(msg.sender != l.seller, "Seller cannot offer on own item");
        require(msg.value > 0, "Offer amount must be > 0");
        require(l.stock > 0, "Out of stock");

        offerCount++;
        offerId = offerCount;

        offers[offerId] = Offer({
            id: offerId,
            listingId: _listingId,
            buyer: payable(msg.sender),
            depositWei: msg.value,
            counterWei: 0,
            status: OfferStatus.Open
        });

        _listingOffers[_listingId].push(offerId);

        emit OfferCreated(offerId, _listingId, msg.sender, msg.value);
    }

    /// @notice Seller proposes a counter price.
    ///         No funds move here — the counter amount is recorded on-chain.
    function counterOffer(
        uint256 _offerId,
        uint256 _counterWei
    )
        external
        offerExists(_offerId)
        onlyListingSeller(offers[_offerId].listingId)
    {
        Offer storage o = offers[_offerId];
        require(
            o.status == OfferStatus.Open || o.status == OfferStatus.Countered,
            "Offer not negotiable"
        );
        require(_counterWei > 0, "Counter must be > 0");

        o.counterWei = _counterWei;
        o.status = OfferStatus.Countered;

        emit OfferCountered(_offerId, _counterWei);
    }

    /// @notice Seller accepts the buyer's current deposited amount.
    ///         Escrow is released to the seller immediately.
    function acceptOffer(
        uint256 _offerId
    )
        external
        nonReentrant
        offerExists(_offerId)
        onlyListingSeller(offers[_offerId].listingId)
    {
        Offer storage o = offers[_offerId];
        Listing storage l = listings[o.listingId];

        require(
            o.status == OfferStatus.Open || o.status == OfferStatus.Countered,
            "Offer not in negotiable state"
        );
        require(l.status == ListingStatus.Active, "Listing not active");
        require(l.stock > 0, "Out of stock");

        uint256 amount = o.depositWei;

        // Checks-effects-interactions
        o.status = OfferStatus.Accepted;
        _finaliseStock(l);

        uint256 fee = (amount * platformFeeBps) / 10_000;
        uint256 payout = amount - fee;

        (bool ok, ) = l.seller.call{value: payout}("");
        require(ok, "Transfer to seller failed");

        emit OfferAccepted(_offerId, amount);
        emit FundsReleased(o.listingId, l.seller, o.buyer, amount);
    }

    /// @notice Buyer accepts the seller's counter price.
    ///         If counter > deposit:  buyer must send the difference.
    ///         If counter < deposit:  buyer receives a refund of the excess.
    ///         If counter == deposit: no extra value needed.
    function acceptCounter(
        uint256 _offerId
    )
        external
        payable
        nonReentrant
        offerExists(_offerId)
        onlyOfferBuyer(_offerId)
    {
        Offer storage o = offers[_offerId];
        Listing storage l = listings[o.listingId];

        require(
            o.status == OfferStatus.Countered,
            "No counter offer to accept"
        );
        require(l.status == ListingStatus.Active, "Listing not active");
        require(l.stock > 0, "Out of stock");

        uint256 counter = o.counterWei;

        if (counter > o.depositWei) {
            // Buyer needs to top up
            uint256 topUp = counter - o.depositWei;
            require(msg.value == topUp, "Send exact top-up amount");
        } else if (counter < o.depositWei) {
            // Buyer gets a refund — no extra value should be sent
            require(msg.value == 0, "Do not send value when counter is lower");
            uint256 refund = o.depositWei - counter;
            o.depositWei = counter; // update before external call

            (bool refunded, ) = o.buyer.call{value: refund}("");
            require(refunded, "Refund failed");
        } else {
            require(msg.value == 0, "No extra value needed");
        }

        uint256 finalAmount = counter;

        // Checks-effects-interactions
        o.status = OfferStatus.Accepted;
        o.depositWei = finalAmount;
        _finaliseStock(l);

        uint256 fee = (finalAmount * platformFeeBps) / 10_000;
        uint256 payout = finalAmount - fee;

        (bool ok, ) = l.seller.call{value: payout}("");
        require(ok, "Transfer to seller failed");

        emit OfferAccepted(_offerId, finalAmount);
        emit FundsReleased(o.listingId, l.seller, o.buyer, finalAmount);
    }

    /// @notice Seller declines the offer — escrow is refunded to buyer.
    function rejectOffer(
        uint256 _offerId
    )
        external
        nonReentrant
        offerExists(_offerId)
        onlyListingSeller(offers[_offerId].listingId)
    {
        Offer storage o = offers[_offerId];
        require(
            o.status == OfferStatus.Open || o.status == OfferStatus.Countered,
            "Offer not active"
        );

        o.status = OfferStatus.Rejected;

        (bool ok, ) = o.buyer.call{value: o.depositWei}("");
        require(ok, "Refund failed");

        emit OfferRejected(_offerId);
    }

    /// @notice Buyer cancels their own offer — escrow is refunded.
    function cancelOffer(
        uint256 _offerId
    ) external nonReentrant offerExists(_offerId) onlyOfferBuyer(_offerId) {
        Offer storage o = offers[_offerId];
        require(
            o.status == OfferStatus.Open || o.status == OfferStatus.Countered,
            "Cannot cancel: offer already finalised"
        );

        o.status = OfferStatus.Cancelled;

        (bool ok, ) = o.buyer.call{value: o.depositWei}("");
        require(ok, "Refund failed");

        emit OfferCancelled(_offerId);
    }

    // ─────────────────────────────────────────────
    //  View functions
    // ─────────────────────────────────────────────

    /// @notice Fetch all offer IDs for a given listing.
    function getListingOffers(
        uint256 _listingId
    ) external view returns (uint256[] memory) {
        return _listingOffers[_listingId];
    }

    /// @notice Returns (offerId, buyerAddress, depositWei, counterWei, status)
    ///         for a given offer.
    function getOfferDetails(
        uint256 _offerId
    )
        external
        view
        offerExists(_offerId)
        returns (
            uint256 offerId,
            uint256 listingId,
            address buyer,
            uint256 depositWei,
            uint256 counterWei,
            OfferStatus status
        )
    {
        Offer storage o = offers[_offerId];
        return (
            o.id,
            o.listingId,
            o.buyer,
            o.depositWei,
            o.counterWei,
            o.status
        );
    }

    // ─────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────

    /// @notice Adjust the platform fee (max 5 %).
    function setPlatformFee(uint16 _bps) external onlyOwner {
        require(_bps <= MAX_FEE_BPS, "Fee exceeds max");
        platformFeeBps = _bps;
        emit FeeBpsUpdated(_bps);
    }

    /// @notice Withdraw accumulated platform fees.
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "Nothing to withdraw");
        (bool ok, ) = owner().call{value: balance}("");
        require(ok, "Withdrawal failed");
        emit FeesWithdrawn(owner(), balance);
    }

    // ─────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────

    /// @dev Decrement stock of a listing and mark Sold if it hits zero.
    function _finaliseStock(Listing storage l) internal {
        l.stock--;
        if (l.stock == 0) {
            l.status = ListingStatus.Sold;
            emit ListingSold(l.id, 0);
        }
    }

    // ─────────────────────────────────────────────
    //  Fallback — reject accidental ETH
    // ─────────────────────────────────────────────
    receive() external payable {
        revert("Use buyDirect, makeOffer, or depositToEscrow");
    }
}
