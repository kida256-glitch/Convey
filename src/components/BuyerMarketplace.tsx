import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, DollarSign, Bell, MessageSquare, X, ShoppingBag, Zap, ChevronLeft, ChevronRight, ImageOff, Loader2 } from 'lucide-react';
import { useAppStore, Purchase, Negotiation, AppNotification } from '../store/useAppStore';
import { NegotiationChat } from './NegotiationChat';
import { useAccount, useChainId, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { useAvaxPrice } from '../hooks/useAvaxPrice';
import { ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from '../wagmi';
import { fetchListings, decrementListingStock, subscribeToListings, isSupabaseConfigured, configReady } from '../lib/listingsApi';
import { addNotificationRemote, addPurchaseRemote, markNotificationsReadRemote, upsertNegotiationRemote } from '../lib/negotiationsApi';

export const BuyerMarketplace = () => {
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'notif'; message: string } | null>(null);
  const [isLoadingListings, setIsLoadingListings] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(isSupabaseConfigured);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const pendingPurchaseRef = useRef<{ purchase: Purchase; listingTitle: string } | null>(null);
  const { negotiations, addNegotiation, listings: storeListings, notifications, markNotificationsRead, purchases, addPurchase, decrementStock, addNotification, setListings, upsertListing } = useAppStore();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { sendTransaction, data: payHash, isPending: buyPending, error: buyError } = useSendTransaction();
  const { isSuccess: paySuccess } = useWaitForTransactionReceipt({
    hash: payHash,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!payHash },
  });
  const onWrongNetwork = !!address && chainId !== ACTIVE_CHAIN_ID;

  const buyerId = address || '0xBuyer';
  const normalizeAddress = (value?: string | null) => (value ?? '').toLowerCase();
  const normalizedAddress = normalizeAddress(address);
  const hasConnectedBuyer = !!address;
  const isOwnListing = (listing: any) =>
    !!normalizedAddress && (listing?.seller || '').toLowerCase() === normalizedAddress;
  // Listings are local-first so sellers can publish without wallet confirmation.
  const allListings = storeListings;
  // Show every active listing immediately, even if it belongs to the connected wallet.
  // Purchase/offer actions are still blocked for own listings in the modal.
  const marketListings = allListings.filter((listing) => listing.status === 'Active');
  const myPurchases = purchases.filter((p) =>
    hasConnectedBuyer
      ? normalizeAddress(p.buyerAddress) === normalizedAddress
      : p.buyerAddress === buyerId,
  );

  // Buyer's own negotiations and unread counts
  const myNegotiations = negotiations.filter((n) =>
    hasConnectedBuyer
      ? normalizeAddress(n.buyerAddress) === normalizedAddress
      : n.buyerAddress === '0xBuyer',
  );
  const buyerNotifs = notifications.filter((n) => n.forRole === 'buyer' && !n.read);
  const unreadByNeg = (negId: string) => buyerNotifs.filter((n) => n.negotiationId === negId).length;
  const totalUnread = buyerNotifs.length;

  useEffect(() => {
    void configReady.then(() => {
      setSupabaseReady(isSupabaseConfigured);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const remote = await fetchListings();
        if (!cancelled) {
          setListings(remote);
          setFetchError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError((err as Error).message ?? 'Could not load listings.');
        }
      } finally {
        if (!cancelled) setIsLoadingListings(false);
      }
    };

    // Initial load.
    void sync();

    let pollingId: number | null = null;

    if (supabaseReady) {
      // Real-time: Supabase pushes changes instantly — no polling needed.
      const unsubscribe = subscribeToListings((listings) => {
        if (!cancelled) setListings(listings);
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    } else {
      // Fallback: poll the local API every 5 seconds.
      pollingId = window.setInterval(sync, 5000);
    }

    return () => {
      cancelled = true;
      if (pollingId !== null) window.clearInterval(pollingId);
    };
  }, [setListings, supabaseReady]);

  // Watch for new buyer notifications and surface a popup, once per notification
  useEffect(() => {
    const newest = buyerNotifs
      .filter((n) => !seenNotifIds.current.has(n.id))
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!newest) return;
    seenNotifIds.current.add(newest.id);
    if (activeNegotiationId !== newest.negotiationId) {
      setToast({ type: 'notif', message: `Seller replied: "${newest.preview.slice(0, 60)}"` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Buyer payment confirmation: commit purchase to store AFTER tx is confirmed
  useEffect(() => {
    if (!paySuccess || !payHash || !pendingPurchaseRef.current) return;
    const { purchase, listingTitle } = pendingPurchaseRef.current;
    pendingPurchaseRef.current = null;

    addPurchase({ ...purchase, txHash: payHash });
    void addPurchaseRemote({ ...purchase, txHash: payHash });
    decrementStock(purchase.listingId);
    void decrementListingStock(purchase.listingId)
      .then((updated) => {
        upsertListing(updated);
      })
      .catch(() => {
        // Local decrement already applied — server will sync on next poll.
      });
    const sellerNotification: AppNotification = {
      id: `${payHash}-buynow-notif`,
      negotiationId: purchase.negotiationId,
      forRole: 'seller',
      preview: `Your item "${listingTitle}" was purchased at full price (${purchase.amount} AVAX)!`,
      read: false,
      timestamp: Date.now(),
    };
    addNotification(sellerNotification);
    void addNotificationRemote(sellerNotification);
    setToast({ type: 'success', message: `Purchase confirmed! Hash: ${payHash.slice(0, 12)}…` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paySuccess, payHash, decrementStock, addPurchase, addNotification, upsertListing]);

  useEffect(() => {
    if (!buyError) return;
    pendingPurchaseRef.current = null; // clear pending so we don't double-commit
    const msg = (buyError as any)?.shortMessage ?? (buyError as Error).message;
    setToast({ type: 'info', message: `Transaction failed: ${msg.slice(0, 120)}` });
  }, [buyError]);

  const handleMakeOffer = (listing: any) => {
    if (isOwnListing(listing)) {
      setToast({ type: 'info', message: 'You cannot negotiate on your own listing. Connect a different buyer wallet.' });
      return;
    }

    // Check if negotiation already exists
    const existing = negotiations.find((n) =>
      n.listingId === listing.id &&
      (hasConnectedBuyer
        ? normalizeAddress(n.buyerAddress) === normalizedAddress
        : n.buyerAddress === '0xBuyer')
    );

    if (existing) {
      setActiveNegotiationId(existing.id);
      markNotificationsRead(existing.id, 'buyer');
      void markNotificationsReadRemote(existing.id, 'buyer');
      setToast({ type: 'info', message: 'Opened your existing negotiation.' });
    } else {
      const newNegotiation: Negotiation = {
        id: Date.now().toString(),
        listingId: listing.id,
        onChainListingId: listing.onChainId ?? listing.id,
        buyerAddress: address || '0xBuyer',
        sellerAddress: listing.seller,
        status: 'open',
        currentOffer: 0,
        messages: [],
      };
      addNegotiation(newNegotiation);
      void upsertNegotiationRemote(newNegotiation);
      setActiveNegotiationId(newNegotiation.id);
      setToast({ type: 'success', message: 'Negotiation started successfully.' });
    }
    setSelectedListing(null); // Close detail modal
  };

  const handleBuyNow = (listing: any) => {
    if (isOwnListing(listing)) {
      setToast({ type: 'info', message: 'You cannot buy your own listing. Connect a different buyer wallet.' });
      return;
    }

    if (!address) {
      setToast({ type: 'info', message: 'Connect your wallet to complete payment.' });
      return;
    }

    if (onWrongNetwork) {
      setToast({ type: 'info', message: `Switch to ${ACTIVE_CHAIN_NAME} before paying.` });
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(String(listing.seller))) {
      setToast({ type: 'info', message: 'Seller wallet address is invalid. This listing cannot be purchased yet.' });
      return;
    }

    // Send payment directly to the seller when buyer confirms purchase.
    const negId = `direct-${Date.now()}`;
    pendingPurchaseRef.current = {
      purchase: {
        id: `${Date.now()}-purchase`,
        negotiationId: negId,
        listingId: listing.id,
        buyerAddress: buyerId,
        sellerAddress: listing.seller,
        amount: listing.price,
        completedAt: Date.now(),
      },
      listingTitle: listing.title,
    };
    setSelectedListing(null);
    setToast({ type: 'info', message: `Confirm the transaction in your wallet…` });
    sendTransaction({
      chainId: ACTIVE_CHAIN_ID,
      to: listing.seller as `0x${string}`,
      value: parseEther(String(listing.price)),
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-[60]">
          <div
            className={`px-4 py-3 rounded-xl border text-sm font-medium shadow-lg ${toast.type === 'success'
              ? 'bg-green-500/20 border-green-400/40 text-green-300'
              : toast.type === 'notif'
                ? 'bg-avalanche-red/20 border-avalanche-red/40 text-red-300'
                : 'bg-blue-500/20 border-blue-400/40 text-blue-300'
              }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Database not configured warning */}
      {!supabaseReady && (
        <div className="mb-4 px-4 py-3 bg-orange-500/10 border border-orange-400/30 rounded-xl text-sm text-orange-300">
          <strong>Local mode:</strong> Listings are stored on this machine only. Buyers on other devices cannot see them.
          {' '}Add <code className="bg-white/10 px-1 rounded">VITE_SUPABASE_URL</code> &amp; <code className="bg-white/10 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your <code className="bg-white/10 px-1 rounded">.env</code> file to enable cross-device sharing.
        </div>
      )}

      {/* Fetch error banner */}
      {fetchError && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-400/30 rounded-xl flex items-center justify-between gap-4">
          <span className="text-red-300 text-sm">Could not load listings: <strong>{fetchError}</strong></span>
          <button
            onClick={() => {
              setFetchError(null);
              setIsLoadingListings(true);
              fetchListings()
                .then((remote) => { setListings(remote); setFetchError(null); })
                .catch((e: Error) => setFetchError(e.message))
                .finally(() => setIsLoadingListings(false));
            }}
            className="shrink-0 bg-red-500 hover:bg-red-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {onWrongNetwork && (
        <div className="mb-6 px-4 py-3 bg-yellow-500/15 border border-yellow-400/40 rounded-xl flex items-center justify-between gap-4">
          <span className="text-yellow-300 text-sm font-medium">⚠️ Your wallet is on the wrong network. Switch to <strong>{ACTIVE_CHAIN_NAME}</strong> to make transactions.</span>
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
            className="shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            Switch Network
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Marketplace</h1>
          {totalUnread > 0 && (
            <div className="relative cursor-default">
              <Bell className="w-6 h-6 text-gray-400" />
              <span className="absolute -top-1.5 -right-1.5 bg-avalanche-red text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search listings..."
              className="w-full bg-avalanche-dark-light border border-white/10 rounded-xl pl-10 pr-4 py-3 focus:border-avalanche-red outline-none transition-colors"
            />
          </div>
          <button className="bg-avalanche-dark-light border border-white/10 p-3 rounded-xl hover:bg-white/5 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* My Negotiations panel */}
      {myNegotiations.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-avalanche-red" /> My Negotiations
          </h2>
          <div className="flex flex-wrap gap-3">
            {myNegotiations.map((neg) => {
              const unread = unreadByNeg(neg.id);
              const relatedListing = allListings.find((l) => l.id === neg.listingId);
              return (
                <button
                  key={neg.id}
                  onClick={() => {
                    setActiveNegotiationId(neg.id);
                    markNotificationsRead(neg.id, 'buyer');
                    void markNotificationsReadRemote(neg.id, 'buyer');
                  }}
                  className="relative bg-avalanche-dark-light border border-white/10 hover:border-avalanche-red/50 px-4 py-3 rounded-xl text-left transition-all"
                >
                  {unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-avalanche-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unread} new
                    </span>
                  )}
                  <p className="font-semibold text-sm truncate max-w-[180px]">
                    {relatedListing?.title ?? `Listing #${neg.listingId}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {neg.currentOffer > 0 ? `${neg.currentOffer} AVAX` : 'No offer yet'}
                    {' · '}
                    <span className={neg.status === 'accepted' ? 'text-green-400' : neg.status === 'rejected' ? 'text-red-400' : 'text-yellow-400'}>
                      {neg.status}
                    </span>
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Purchased Items */}
      {myPurchases.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-avalanche-red" /> Purchased Items
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {myPurchases.map((purchase) => {
              const item = allListings.find((l) => l.id === purchase.listingId);
              return (
                <motion.div
                  key={purchase.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-avalanche-dark-light border border-green-500/20 rounded-2xl overflow-hidden"
                >
                  {item?.images?.[0] && (
                    <img src={item.images[0]} alt={item.title} className="w-full h-36 object-cover" />
                  )}
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <h3 className="font-bold truncate">{item?.title ?? `Item #${purchase.listingId}`}</h3>
                      <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">PURCHASED</span>
                    </div>
                    <p className="text-avalanche-red font-bold text-sm mb-1">{purchase.amount} AVAX</p>
                    <p className="text-xs text-gray-500">
                      {new Date(purchase.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">Seller: {purchase.sellerAddress}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoadingListings ? (
          <p className="col-span-4 text-center text-gray-500 py-12">Loading listings...</p>
        ) : marketListings.length === 0 ? (
          <p className="col-span-4 text-center text-gray-500 py-12">No active listings yet.</p>
        ) : (
          marketListings.map((listing) => (
            <MarketCard key={listing.id} listing={listing} onClick={() => setSelectedListing(listing)} />
          ))
        )}
      </div>

      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          currentAddress={address}
          onClose={() => setSelectedListing(null)}
          onMakeOffer={() => handleMakeOffer(selectedListing)}
          onBuyNow={() => handleBuyNow(selectedListing)}
          isBuying={buyPending}
        />
      )}

      {activeNegotiationId && (
        <NegotiationChat
          negotiationId={activeNegotiationId}
          onClose={() => {
            setActiveNegotiationId(null);
            markNotificationsRead(activeNegotiationId, 'buyer');
            void markNotificationsReadRemote(activeNegotiationId, 'buyer');
          }}
          currentUserRole="buyer"
        />
      )}
    </div>
  );
};

const MarketCard = ({ listing, onClick }: any) => (
  <motion.div
    whileHover={{ y: -5 }}
    onClick={onClick}
    className="bg-avalanche-dark-light border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-avalanche-red/10 transition-all group"
  >
    <div className="relative overflow-hidden">
      {listing.images?.[0] ? (
        <img src={listing.images[0]} alt={listing.title} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="w-full h-48 bg-white/5 flex items-center justify-center">
          <ImageOff className="w-10 h-10 text-gray-600" />
        </div>
      )}
      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono border border-white/10">
        #{listing.id}
      </div>
    </div>
    <div className="p-5">
      <h3 className="text-lg font-bold mb-1 truncate">{listing.title}</h3>
      <p className="text-gray-400 text-xs mb-3">Seller: {listing.seller}</p>

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1 text-avalanche-red font-bold">
          <DollarSign className="w-4 h-4" />
          <span>{listing.price} AVAX</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{listing.stock} left</span>
          <button className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors">
            View
          </button>
        </div>
      </div>
    </div>
  </motion.div>
);

const ListingDetailModal = ({ listing, currentAddress, onClose, onMakeOffer, onBuyNow, isBuying }: any) => {
  const avaxPrice = useAvaxPrice();
  const [imgIdx, setImgIdx] = useState(0);
  const images: string[] = listing.images ?? [];
  const isOwnListing =
    !!currentAddress &&
    (listing?.seller || '').toLowerCase() === String(currentAddress).toLowerCase();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-avalanche-dark border border-white/10 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col md:flex-row"
      >
        <div className="md:w-2/5 h-56 md:h-auto md:min-h-[280px] relative shrink-0">
          <img src={images[imgIdx] ?? ''} alt={listing.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-avalanche-dark to-transparent md:hidden" />
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 p-1.5 rounded-full"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setImgIdx((i) => Math.min(images.length - 1, i + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 p-1.5 rounded-full"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {images.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-6 md:w-3/5 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div className="pr-4">
              <h2 className="text-2xl font-bold mb-1">{listing.title}</h2>
              <p className="text-gray-400 text-sm">Seller: {listing.seller}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1">
            <p className="text-gray-300 leading-relaxed mb-6">
              {listing.description || 'Securely negotiate and purchase this item using AVAX. Escrow protection included.'}
            </p>

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Asking Price</span>
                <span className="text-2xl font-bold text-avalanche-red">{listing.price} AVAX</span>
              </div>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-500">USD Estimate</span>
                <span className="text-gray-400">≈ ${(listing.price * avaxPrice).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Stock</span>
                <span className={listing.stock > 0 ? 'text-blue-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {listing.stock > 0 ? `${listing.stock} available` : 'Out of stock'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-auto flex-col">
            {isOwnListing && (
              <p className="text-xs text-yellow-300 text-center bg-yellow-500/15 border border-yellow-500/30 rounded-lg py-2 px-3">
                This listing belongs to your connected wallet. Use a different wallet to buy or negotiate.
              </p>
            )}
            <button
              onClick={onBuyNow}
              disabled={listing.stock === 0 || isBuying || isOwnListing}
              className="w-full bg-white text-avalanche-dark py-4 rounded-xl font-bold transition-colors hover:bg-gray-100 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBuying ? <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for wallet…</> : <><Zap className="w-4 h-4" /> {`Buy Now · ${listing.price} AVAX`}</>}
            </button>
            <button
              onClick={onMakeOffer}
              disabled={isOwnListing}
              className="w-full bg-avalanche-red hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Make Offer / Negotiate
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
