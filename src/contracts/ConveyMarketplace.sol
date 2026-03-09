// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract ConveyMarketplace is ReentrancyGuard, Ownable {
    
    // Enums
    enum OfferStatus { Open, Countered, Accepted, Rejected, Completed, Cancelled }
    enum ListingStatus { Active, Sold, Cancelled }

    // Structs
    struct Listing {
        uint256 id;
        address payable seller;
        string title;
        string description;
        string imageUrl;
        uint256 price; // In Wei (AVAX)
        ListingStatus status;
    }

    struct Offer {
        uint256 id;
        uint256 listingId;
        address payable buyer;
        uint256 offerAmount; // In Wei
        OfferStatus status;
        uint256 counterOfferAmount; // If seller counters
    }

    // State Variables
    uint256 public listingCounter;
    uint256 public offerCounter;
    
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => uint256[]) public listingOffers; // listingId -> offerIds
    
    AggregatorV3Interface internal priceFeed;

    // Events
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price);
    event OfferMade(uint256 indexed offerId, uint256 indexed listingId, address indexed buyer, uint256 amount);
    event CounterOfferMade(uint256 indexed offerId, uint256 indexed listingId, uint256 counterAmount);
    event OfferAccepted(uint256 indexed offerId, uint256 indexed listingId, uint256 finalAmount);
    event FundsReleased(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 amount);
    event ListingCancelled(uint256 indexed listingId);

    constructor(address _priceFeedAddress) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    // --- Modifiers ---
    modifier onlySeller(uint256 _listingId) {
        require(listings[_listingId].seller == msg.sender, "Not the seller");
        _;
    }

    modifier onlyBuyer(uint256 _offerId) {
        require(offers[_offerId].buyer == msg.sender, "Not the buyer");
        _;
    }

    // --- Core Logic ---

    function createListing(string memory _title, string memory _description, string memory _imageUrl, uint256 _price) external {
        require(_price > 0, "Price must be greater than 0");
        
        listingCounter++;
        listings[listingCounter] = Listing({
            id: listingCounter,
            seller: payable(msg.sender),
            title: _title,
            description: _description,
            imageUrl: _imageUrl,
            price: _price,
            status: ListingStatus.Active
        });

        emit ListingCreated(listingCounter, msg.sender, _price);
    }

    function makeOffer(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.status == ListingStatus.Active, "Listing not active");
        require(msg.sender != listing.seller, "Seller cannot buy own listing");
        require(msg.value > 0, "Offer must have value");

        offerCounter++;
        offers[offerCounter] = Offer({
            id: offerCounter,
            listingId: _listingId,
            buyer: payable(msg.sender),
            offerAmount: msg.value,
            status: OfferStatus.Open,
            counterOfferAmount: 0
        });

        listingOffers[_listingId].push(offerCounter);
        emit OfferMade(offerCounter, _listingId, msg.sender, msg.value);
    }

    function counterOffer(uint256 _offerId, uint256 _counterAmount) external onlySeller(offers[_offerId].listingId) {
        Offer storage offer = offers[_offerId];
        require(offer.status == OfferStatus.Open, "Offer not open");
        
        offer.status = OfferStatus.Countered;
        offer.counterOfferAmount = _counterAmount;
        
        emit CounterOfferMade(_offerId, offer.listingId, _counterAmount);
    }

    function acceptOffer(uint256 _offerId) external onlySeller(offers[_offerId].listingId) nonReentrant {
        Offer storage offer = offers[_offerId];
        require(offer.status == OfferStatus.Open, "Offer not open");

        offer.status = OfferStatus.Accepted;
        listings[offer.listingId].status = ListingStatus.Sold;

        // Transfer funds to seller
        (bool sent, ) = listings[offer.listingId].seller.call{value: offer.offerAmount}("");
        require(sent, "Failed to send Ether");

        emit OfferAccepted(_offerId, offer.listingId, offer.offerAmount);
        emit FundsReleased(offer.listingId, listings[offer.listingId].seller, offer.buyer, offer.offerAmount);
    }

    function acceptCounterOffer(uint256 _offerId) external payable onlyBuyer(_offerId) nonReentrant {
        Offer storage offer = offers[_offerId];
        require(offer.status == OfferStatus.Countered, "No counter offer");
        
        uint256 totalRequired = offer.counterOfferAmount;
        uint256 alreadyDeposited = offer.offerAmount;

        if (totalRequired > alreadyDeposited) {
            require(msg.value == totalRequired - alreadyDeposited, "Incorrect value sent");
        } else if (totalRequired < alreadyDeposited) {
            // Refund excess
            uint256 refund = alreadyDeposited - totalRequired;
            (bool sentRefund, ) = payable(msg.sender).call{value: refund}("");
            require(sentRefund, "Failed to refund");
        }

        offer.status = OfferStatus.Accepted;
        listings[offer.listingId].status = ListingStatus.Sold;
        offer.offerAmount = totalRequired; // Update to final amount

        // Transfer funds to seller
        (bool sent, ) = listings[offer.listingId].seller.call{value: totalRequired}("");
        require(sent, "Failed to send Ether");

        emit OfferAccepted(_offerId, offer.listingId, totalRequired);
        emit FundsReleased(offer.listingId, listings[offer.listingId].seller, offer.buyer, totalRequired);
    }

    function cancelListing(uint256 _listingId) external onlySeller(_listingId) {
        require(listings[_listingId].status == ListingStatus.Active, "Not active");
        listings[_listingId].status = ListingStatus.Cancelled;
        emit ListingCancelled(_listingId);
    }

    // --- Chainlink Price Feed ---
    function getLatestPrice() public view returns (int) {
        (
            /* uint80 roundID */,
            int price,
            /* uint startedAt */,
            /* uint timeStamp */,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();
        return price;
    }
}
