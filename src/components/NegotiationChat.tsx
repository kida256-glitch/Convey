import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, X, Check, AlertCircle, DollarSign, HandshakeIcon, MessageCircle, ShoppingCart, PackageCheck, Loader2 } from 'lucide-react';
import { useAppStore, Message, Purchase } from '../store/useAppStore';
import { useMakeOffer, useAcceptOffer, useAllOnChainListings, parseConveyTxError, useWithdraw } from '../lib/useConvey';
import { CONVEY_ADDRESS } from '../lib/contract';
import { addNotificationRemote, addPurchaseRemote, appendMessageRemote, updateNegotiationRemote, upsertNegotiationRemote } from '../lib/negotiationsApi';
import { useAccount } from 'wagmi';

interface NegotiationChatProps {
  negotiationId: string;
  onClose: () => void;
  currentUserRole: 'buyer' | 'seller';
}

export const NegotiationChat = ({ negotiationId, onClose, currentUserRole }: NegotiationChatProps) => {
  const { negotiations, listings: storeListings, addMessage, updateNegotiation, addNotification, purchases, addPurchase, decrementStock } = useAppStore();
  const { address } = useAccount();
  const { listings: onChainListings } = useAllOnChainListings();
  const negotiation = negotiations.find((n) => n.id === negotiationId);
  // Look up listing from on-chain data first, fall back to store
  const allListings = onChainListings.length > 0 ? onChainListings : storeListings;
  const listing = allListings.find((l) => l.id === negotiation?.listingId || l.onChainId === negotiation?.onChainListingId);

  // On-chain hooks
  const {
    offer: makeOfferOnChain,
    hash: offerTxHash,
    isAwaitingWallet: offerAwaitingWallet,
    isTransactionPending: offerTxPending,
    isPending: offerPending,
    isSuccess: offerSuccess,
    error: offerError,
  } = useMakeOffer();
  const {
    accept: acceptOfferOnChain,
    isAwaitingWallet: releaseAwaitingWallet,
    isTransactionPending: releaseTxPending,
    isPending: releasePending,
    isSuccess: releaseSuccess,
    error: releaseError,
  } = useAcceptOffer();
  const {
    withdraw,
    isAwaitingWallet: withdrawAwaitingWallet,
    isTransactionPending: withdrawTxPending,
    isPending: withdrawPending,
    isSuccess: withdrawSuccess,
    error: withdrawError,
  } = useWithdraw();

  const [offerAmount, setOfferAmount] = useState('');
  const [textInput, setTextInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'offer'>('offer');
  const [purchaseDone, setPurchaseDone] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [releaseDone, setReleaseDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [negotiation?.messages]);

  useEffect(() => {
    if (!offerSuccess || !negotiation) return;

    const purchase: Purchase = {
      id: `${Date.now()}-purchase`,
      negotiationId,
      listingId: negotiation.listingId,
      buyerAddress: negotiation.buyerAddress,
      sellerAddress: negotiation.sellerAddress,
      amount: negotiation.currentOffer,
      completedAt: Date.now(),
      txHash: offerTxHash,
    };
    addPurchase(purchase);
    void addPurchaseRemote(purchase);
    setPurchaseDone(true);
    setDepositStatus('Transaction confirmed');
    updateNegotiation(negotiationId, { paymentTxHash: offerTxHash ?? undefined });
    void updateNegotiationRemote(negotiationId, { paymentTxHash: offerTxHash ?? undefined });

    const purchaseNotification = {
      id: `${Date.now()}-purchase-notif`,
      negotiationId,
      forRole: 'seller',
      preview: `Buyer funded escrow for "${listing?.title ?? `Item #${negotiation.listingId}`}" with ${negotiation.currentOffer} AVAX. Release to complete sale.`,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(purchaseNotification);
    void addNotificationRemote(purchaseNotification);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerSuccess]);

  useEffect(() => {
    if (offerAwaitingWallet) {
      setDepositStatus('Waiting for wallet confirmation');
      return;
    }
    if (offerTxPending) {
      setDepositStatus('Transaction pending');
      return;
    }
    if (offerError) {
      setDepositStatus(parseConveyTxError(offerError));
    }
  }, [offerAwaitingWallet, offerTxPending, offerError]);

  useEffect(() => {
    if (!releaseSuccess || !negotiation) return;
    setReleaseDone(true);
    setReleaseStatus('Transaction confirmed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseSuccess]);

  useEffect(() => {
    if (releaseAwaitingWallet) {
      setReleaseStatus('Waiting for wallet confirmation');
      return;
    }
    if (releaseTxPending) {
      setReleaseStatus('Transaction pending');
      return;
    }
    if (releaseError) {
      setReleaseStatus(parseConveyTxError(releaseError));
    }
  }, [releaseAwaitingWallet, releaseTxPending, releaseError]);

  useEffect(() => {
    if (withdrawAwaitingWallet) {
      setWithdrawStatus('Waiting for wallet confirmation');
      return;
    }
    if (withdrawTxPending) {
      setWithdrawStatus('Transaction pending');
      return;
    }
    if (withdrawError) {
      setWithdrawStatus(parseConveyTxError(withdrawError));
      return;
    }
    if (withdrawSuccess) {
      setWithdrawStatus('Transaction confirmed');
    }
  }, [withdrawAwaitingWallet, withdrawTxPending, withdrawError, withdrawSuccess]);

  useEffect(() => {
    if (!withdrawSuccess || !negotiation) return;
    decrementStock(negotiation.listingId);
    const releaseNotification = {
      id: `${Date.now()}-released-notif`,
      negotiationId,
      forRole: 'buyer',
      preview: `Seller released and withdrew escrow for "${listing?.title}". Order complete.`,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(releaseNotification);
    void addNotificationRemote(releaseNotification);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawSuccess]);

  if (!negotiation) return null;

  // Check if this negotiation already has a completed purchase
  const existingPurchase = purchases.find((p) => p.negotiationId === negotiationId);
  const isTransactionComplete = purchaseDone || !!existingPurchase;

  const messages = negotiation.messages;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isDone = negotiation.status === 'accepted' || negotiation.status === 'rejected';

  // Determine if the current user's offer is "live" (i.e. the last offer/counter was theirs so other party must respond)
  const lastOfferMsg = [...messages].reverse().find((m) => m.type === 'offer' || m.type === 'counter');
  const isMyOfferPending = lastOfferMsg?.sender === currentUserRole;

  // The other party's latest offer amount (for the Accept button)
  const pendingOffer = !isMyOfferPending && lastOfferMsg ? lastOfferMsg.amount : null;

  // Which turn-state label to show
  const getTurnLabel = () => {
    if (isDone) return null;
    if (messages.length === 0) {
      return currentUserRole === 'buyer'
        ? 'Make your opening offer to start the negotiation.'
        : 'Waiting for the buyer to make an opening offer…';
    }
    if (isMyOfferPending) {
      return `Waiting for the ${currentUserRole === 'buyer' ? 'seller' : 'buyer'} to respond…`;
    }
    return `Your turn — accept, counter, or send a message.`;
  };

  const handleCompletePurchase = () => {
    if (!negotiation || existingPurchase) return;

    if (CONVEY_ADDRESS) {
      const escrowListingId = listing?.onChainId ?? negotiation.onChainListingId;
      if (!escrowListingId || escrowListingId <= 0) {
        setPurchaseError('Escrow is only available for listings created on-chain. This listing does not have a contract listing ID yet.');
        return;
      }
      setPurchaseError(null);
      setDepositStatus('Waiting for wallet confirmation');
      // Buyer sends funds from wallet into escrow contract.
      makeOfferOnChain(escrowListingId, negotiation.currentOffer);
      return;
    }

    const purchase: Purchase = {
      id: `${Date.now()}-purchase`,
      negotiationId,
      listingId: negotiation.listingId,
      buyerAddress: negotiation.buyerAddress,
      sellerAddress: negotiation.sellerAddress,
      amount: negotiation.currentOffer,
      completedAt: Date.now(),
    };
    addPurchase(purchase);
    void addPurchaseRemote(purchase);
    decrementStock(negotiation.listingId);
    setPurchaseDone(true);

    const localPurchaseNotification = {
      id: `${Date.now()}-purchase-notif`,
      negotiationId,
      forRole: 'seller',
      preview: `Buyer completed purchase of "${listing?.title ?? `Item #${negotiation.listingId}`}" for ${negotiation.currentOffer} AVAX! Item is now sold.`,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(localPurchaseNotification);
    void addNotificationRemote(localPurchaseNotification);
  };

  const handleReleasePurchase = () => {
    const escrowListingId = listing?.onChainId ?? negotiation?.onChainListingId;
    if (!escrowListingId || !negotiation) return;
    if (!address || address.toLowerCase() !== negotiation.sellerAddress.toLowerCase()) {
      setReleaseStatus('Smart contract reverted the transaction. Check listing state and permissions.');
      return;
    }
    setReleaseStatus('Waiting for wallet confirmation');
    acceptOfferOnChain(escrowListingId);
  };

  const handleWithdraw = () => {
    setWithdrawStatus('Waiting for wallet confirmation');
    withdraw();
  };

  const handleSendOffer = () => {
    const amount = parseFloat(offerAmount);
    if (!offerAmount || isNaN(amount) || amount <= 0) return;

    const isOpening = messages.length === 0;
    const type: Message['type'] = currentUserRole === 'seller' ? 'counter' : 'offer';

    const msg: Message = {
      id: Date.now().toString(),
      sender: currentUserRole,
      text: isOpening
        ? `Opening offer: ${amount} AVAX`
        : currentUserRole === 'seller'
          ? `Counter-offer: ${amount} AVAX`
          : `New offer: ${amount} AVAX`,
      type,
      amount,
      timestamp: Date.now(),
    };

    addMessage(negotiationId, msg);
    updateNegotiation(negotiationId, {
      currentOffer: amount,
      status: currentUserRole === 'seller' ? 'countered' : 'open',
    });
    void appendMessageRemote(negotiationId, msg, {
      currentOffer: amount,
      status: currentUserRole === 'seller' ? 'countered' : 'open',
    });

    const otherRole: 'buyer' | 'seller' = currentUserRole === 'buyer' ? 'seller' : 'buyer';
    const offerNotification = {
      id: `${Date.now()}-offer`,
      negotiationId,
      forRole: otherRole,
      preview: msg.text,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(offerNotification);
    void addNotificationRemote(offerNotification);

    setOfferAmount('');
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;

    const msg: Message = {
      id: Date.now().toString(),
      sender: currentUserRole,
      text: textInput.trim(),
      type: 'text',
      timestamp: Date.now(),
    };

    addMessage(negotiationId, msg);
    void appendMessageRemote(negotiationId, msg);

    const otherRole: 'buyer' | 'seller' = currentUserRole === 'buyer' ? 'seller' : 'buyer';
    const textNotification = {
      id: `${Date.now()}-text`,
      negotiationId,
      forRole: otherRole,
      preview: msg.text,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(textNotification);
    void addNotificationRemote(textNotification);

    setTextInput('');
  };

  const handleAccept = () => {
    if (pendingOffer == null) return;

    const msg: Message = {
      id: Date.now().toString(),
      sender: currentUserRole,
      text: `Deal accepted at ${pendingOffer} AVAX! 🎉`,
      type: 'accept',
      amount: pendingOffer,
      timestamp: Date.now(),
    };

    addMessage(negotiationId, msg);
    updateNegotiation(negotiationId, { status: 'accepted', currentOffer: pendingOffer });
    void appendMessageRemote(negotiationId, msg, { status: 'accepted', currentOffer: pendingOffer });

    const otherRole: 'buyer' | 'seller' = currentUserRole === 'buyer' ? 'seller' : 'buyer';
    const acceptNotification = {
      id: `${Date.now()}-accept`,
      negotiationId,
      forRole: otherRole,
      preview: msg.text,
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(acceptNotification);
    void addNotificationRemote(acceptNotification);
  };

  const handleReject = () => {
    const msg: Message = {
      id: Date.now().toString(),
      sender: currentUserRole,
      text: `Offer declined.`,
      type: 'text',
      timestamp: Date.now(),
    };

    addMessage(negotiationId, msg);
    updateNegotiation(negotiationId, { status: 'rejected' });
    void appendMessageRemote(negotiationId, msg, { status: 'rejected' });

    const otherRole: 'buyer' | 'seller' = currentUserRole === 'buyer' ? 'seller' : 'buyer';
    const rejectNotification = {
      id: `${Date.now()}-reject`,
      negotiationId,
      forRole: otherRole,
      preview: 'Offer declined.',
      read: false,
      timestamp: Date.now(),
    } as const;
    addNotification(rejectNotification);
    void addNotificationRemote(rejectNotification);
  };

  useEffect(() => {
    // Ensure the negotiation row exists remotely whenever the chat opens.
    void upsertNegotiationRemote(negotiation);
  }, [negotiation]);

  const statusColor =
    negotiation.status === 'accepted'
      ? 'text-green-400'
      : negotiation.status === 'rejected'
        ? 'text-red-400'
        : 'text-yellow-400';

  const statusLabel =
    negotiation.status === 'accepted'
      ? 'Deal Closed'
      : negotiation.status === 'rejected'
        ? 'Negotiation Ended'
        : negotiation.status === 'countered'
          ? 'Counter Offered'
          : 'Negotiating';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-avalanche-dark border border-white/10 w-full max-w-md h-[640px] rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-avalanche-dark-light">
          <div className="min-w-0 pr-2">
            <h3 className="font-bold text-base truncate">{listing?.title ?? `Listing #${negotiation.listingId}`}</h3>
            <div className={`text-xs flex items-center gap-1 mt-0.5 ${statusColor}`}>
              {negotiation.status === 'accepted' ? (
                <Check className="w-3 h-3 shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 shrink-0" />
              )}
              {statusLabel}
              {negotiation.currentOffer > 0 && !isDone && (
                <span className="ml-2 text-gray-400">
                  · Current: <span className="text-white font-semibold">{negotiation.currentOffer} AVAX</span>
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Turn Hint */}
        {getTurnLabel() && (
          <div className="px-4 py-2 bg-white/5 border-b border-white/5 text-xs text-gray-400 text-center">
            {getTurnLabel()}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/20">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600 text-sm">
              <HandshakeIcon className="w-10 h-10 opacity-30" />
              <span>No messages yet.</span>
            </div>
          )}

          {messages.map((msg) => {
            const isMe = msg.sender === currentUserRole;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${msg.type === 'accept'
                    ? 'bg-green-600/30 border border-green-500/40 text-green-200 w-full text-center rounded-2xl'
                    : isMe
                      ? 'bg-avalanche-red text-white rounded-br-none'
                      : 'bg-white/10 text-gray-200 rounded-bl-none'
                    }`}
                >
                  {(msg.type === 'offer' || msg.type === 'counter') && (
                    <div className="flex items-center gap-1 font-bold text-base mb-1">
                      <DollarSign className="w-4 h-4 shrink-0" />
                      {msg.amount} AVAX
                      <span className="text-xs font-normal opacity-70 ml-1">
                        {msg.type === 'counter' ? '(counter)' : '(offer)'}
                      </span>
                    </div>
                  )}
                  {msg.type === 'accept' && (
                    <div className="flex items-center justify-center gap-2 font-bold mb-1">
                      <Check className="w-4 h-4" /> DEAL ACCEPTED · {msg.amount} AVAX
                    </div>
                  )}
                  <p className={msg.type === 'accept' ? 'text-green-300 text-xs' : ''}>{msg.text}</p>
                  <span className="text-[10px] opacity-40 block text-right mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {msg.sender === 'buyer' ? 'Buyer' : 'Seller'}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Deal summary when accepted */}
        {negotiation.status === 'accepted' && (
          <div className="p-4 bg-green-600/20 border-t border-green-500/30">
            <p className="text-green-300 font-bold text-center mb-3">🎉 Deal agreed at {negotiation.currentOffer} AVAX</p>
            {withdrawSuccess || (isTransactionComplete && !CONVEY_ADDRESS) ? (
              /* ── DONE ── */
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-green-400 font-bold">
                  <PackageCheck className="w-5 h-5" /> Transaction Complete!
                </div>
                {negotiation.paymentTxHash && (
                  <a
                    href={`https://testnet.snowtrace.io/tx/${negotiation.paymentTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-xs underline"
                  >
                    View on Snowtrace ↗
                  </a>
                )}
                <p className="text-green-500 text-xs">The listing has been marked as sold.</p>
              </div>
            ) : currentUserRole === 'buyer' ? (
              <>
                {offerPending ? (
                  /* Buyer: tx in-flight */
                  <div className="flex items-center justify-center gap-2 text-yellow-300 font-semibold text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending {negotiation.currentOffer} AVAX from your wallet to escrow…
                  </div>
                ) : isTransactionComplete ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                      <AlertCircle className="w-4 h-4" /> Funds left buyer wallet and are locked in escrow.
                    </div>
                    {negotiation.paymentTxHash && (
                      <a
                        href={`https://testnet.snowtrace.io/tx/${negotiation.paymentTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-xs underline"
                      >
                        Escrow Payment Tx ↗
                      </a>
                    )}
                    <p className="text-gray-500 text-xs">Waiting for seller to release escrow.</p>
                  </div>
                ) : (
                  /* Buyer: not yet paid */
                  <button
                    onClick={handleCompletePurchase}
                    className="w-full py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white"
                  >
                    <ShoppingCart className="w-4 h-4" /> Fund Escrow with {negotiation.currentOffer} AVAX
                  </button>
                )}
                {depositStatus && (
                  <p className="text-xs mt-1 text-center text-gray-300">{depositStatus}</p>
                )}
                {purchaseError && (
                  <p className="text-red-400 text-xs mt-1 text-center">{purchaseError}</p>
                )}
              </>
            ) : (
              <>
                {isTransactionComplete ? (
                  releaseDone ? (
                    withdrawPending ? (
                      <div className="flex items-center justify-center gap-2 text-yellow-300 font-semibold text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Withdrawing released funds…
                      </div>
                    ) : (
                      <button
                        onClick={handleWithdraw}
                        className="w-full py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white"
                      >
                        <PackageCheck className="w-4 h-4" /> Withdraw Released Funds
                      </button>
                    )
                  ) : releasePending ? (
                    <div className="flex items-center justify-center gap-2 text-yellow-300 font-semibold text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Releasing escrow to seller pending balance…
                    </div>
                  ) : (
                    <button
                      onClick={handleReleasePurchase}
                      className="w-full py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      <PackageCheck className="w-4 h-4" /> Release Escrow
                    </button>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
                      <AlertCircle className="w-4 h-4" /> Waiting for buyer to fund escrow…
                    </div>
                    <p className="text-gray-500 text-xs">You can release funds once buyer payment tx confirms.</p>
                  </div>
                )}
                {releaseStatus && (
                  <p className="text-xs mt-1 text-center text-gray-300">{releaseStatus}</p>
                )}
                {withdrawStatus && (
                  <p className="text-xs mt-1 text-center text-gray-300">{withdrawStatus}</p>
                )}
              </>
            )}
          </div>
        )}

        {negotiation.status === 'rejected' && (
          <div className="p-4 bg-red-600/10 border-t border-red-500/20 text-center">
            <p className="text-red-400 font-semibold text-sm">Negotiation closed. You can start a new one.</p>
          </div>
        )}

        {/* Action Area — only when negotiation is active */}
        {!isDone && (
          <div className="bg-avalanche-dark-light border-t border-white/10">
            {/* Accept / Reject — only shown when other party's offer is pending */}
            {pendingOffer != null && (
              <div className="flex gap-2 px-4 pt-4">
                <button
                  onClick={handleAccept}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-1"
                >
                  <Check className="w-4 h-4" /> Accept {pendingOffer} AVAX
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 py-2 rounded-xl font-bold text-sm transition-colors"
                >
                  Decline
                </button>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3">
              <button
                onClick={() => setActiveTab('offer')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${activeTab === 'offer' ? 'bg-avalanche-red text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
              >
                <DollarSign className="w-3 h-3" />
                {messages.length === 0 && currentUserRole === 'buyer' ? 'Opening Offer' : 'Counter Offer'}
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${activeTab === 'chat' ? 'bg-avalanche-red text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
              >
                <MessageCircle className="w-3 h-3" /> Message
              </button>
            </div>

            <div className="p-4 pt-2">
              {activeTab === 'offer' ? (
                /* Offer input — seller always enabled, buyer only if not waiting */
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOffer()}
                    placeholder="Amount in AVAX…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm focus:border-avalanche-red outline-none"
                  />
                  <button
                    onClick={handleSendOffer}
                    disabled={!offerAmount || parseFloat(offerAmount) <= 0}
                    className="bg-avalanche-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 rounded-xl flex items-center justify-center transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                /* Text chat input */
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    placeholder="Type a message…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm focus:border-avalanche-red outline-none"
                  />
                  <button
                    onClick={handleSendText}
                    disabled={!textInput.trim()}
                    className="bg-avalanche-red hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 rounded-xl flex items-center justify-center transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
