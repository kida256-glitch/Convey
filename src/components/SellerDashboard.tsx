import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, DollarSign, X, MessageSquare, Eye, Pencil, Bell, PackageCheck, ChevronLeft, ChevronRight, Trash2, ImageOff, Loader2 } from 'lucide-react';
import { Listing, useAppStore } from '../store/useAppStore';
import { NegotiationChat } from './NegotiationChat';
import { useAccount } from 'wagmi';
import { publishListing, editListing, deleteListing } from '../lib/listingsApi';

type ListingFormData = {
    title: string;
    price: string;
    stock: string;
    description: string;
    images: string[];
    status: 'Active' | 'Sold';
};

type Toast = {
    type: 'success' | 'error';
    message: string;
};

const EMPTY_FORM: ListingFormData = {
    title: '',
    price: '',
    stock: '',
    description: '',
    images: [],
    status: 'Active',
};

export const SellerDashboard = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingListing, setEditingListing] = useState<Listing | null>(null);
    const [viewingListing, setViewingListing] = useState<Listing | null>(null);
    const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    const seenNotifIds = useRef<Set<string>>(new Set());
    const { address } = useAccount();
    const { listings, negotiations, notifications, markNotificationsRead, purchases, removeListing } = useAppStore();

    const sellerId = address || '0xSeller';
    const [confirmUnlistId, setConfirmUnlistId] = useState<number | null>(null);
    const myListings = useMemo(() => listings.filter((listing) => listing.seller === sellerId), [listings, sellerId]);
    const myNegotiations = negotiations.filter((negotiation) =>
        myListings.some((listing) => listing.id === negotiation.listingId || listing.onChainId === negotiation.listingId)
    );
    const mySales = purchases.filter((p) => p.sellerAddress === sellerId);

    // Unread notification counts per negotiation for the seller
    const sellerNotifs = notifications.filter((n) => n.forRole === 'seller' && !n.read);
    const unreadByNeg = (negId: string) => sellerNotifs.filter((n) => n.negotiationId === negId).length;
    const totalUnread = sellerNotifs.length;

    // Watch for new seller notifications and surface a popup, once per notification
    useEffect(() => {
        const newest = sellerNotifs
            .filter((n) => !seenNotifIds.current.has(n.id))
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (!newest) return;
        seenNotifIds.current.add(newest.id);
        if (activeNegotiationId !== newest.negotiationId) {
            setToast({ type: 'success', message: `New message: "${newest.preview.slice(0, 60)}"` });
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

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {toast && (
                <div className="fixed top-6 right-6 z-[60]">
                    <div
                        className={`px-4 py-3 rounded-xl border text-sm font-medium shadow-lg ${toast.type === 'success'
                            ? 'bg-green-500/20 border-green-400/40 text-green-300'
                            : 'bg-red-500/20 border-red-400/40 text-red-300'
                            }`}
                    >
                        {toast.message}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Seller Dashboard</h1>
                <div className="flex items-center gap-3">
                    {totalUnread > 0 && (
                        <div className="relative">
                            <Bell className="w-6 h-6 text-gray-400" />
                            <span className="absolute -top-1.5 -right-1.5 bg-avalanche-red text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {totalUnread > 9 ? '9+' : totalUnread}
                            </span>
                        </div>
                    )}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-avalanche-red hover:bg-red-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-5 h-5" /> Create Listing
                    </button>
                </div>
            </div>

            {myNegotiations.length > 0 && (
                <div className="mb-12">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-avalanche-red" /> Active Negotiations
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myNegotiations.map((negotiation) => {
                            const unread = unreadByNeg(negotiation.id);
                            return (
                                <div
                                    key={negotiation.id}
                                    onClick={() => {
                                        setActiveNegotiationId(negotiation.id);
                                        markNotificationsRead(negotiation.id, 'seller');
                                    }}
                                    className="bg-avalanche-dark-light border border-white/10 p-5 rounded-2xl cursor-pointer hover:border-avalanche-red/50 transition-all relative"
                                >
                                    {unread > 0 && (
                                        <span className="absolute top-3 right-3 bg-avalanche-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                            {unread} new
                                        </span>
                                    )}
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-lg">Listing #{negotiation.listingId}</span>
                                        <span
                                            className={`text-xs px-2 py-1 rounded-full ${negotiation.status === 'accepted' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                                }`}
                                        >
                                            {negotiation.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400 mb-2">Buyer: {negotiation.buyerAddress.substring(0, 6)}...</p>
                                    <div className="flex justify-between items-center">
                                        <span className="text-avalanche-red font-bold">{negotiation.currentOffer} AVAX</span>
                                        <span className="text-xs text-gray-500">{negotiation.messages.length} messages</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <h2 className="text-xl font-bold mb-4">My Listings</h2>
            {myListings.length === 0 ? (
                <div className="bg-avalanche-dark-light border border-white/10 rounded-2xl p-8 text-center text-gray-400">
                    No listings yet. Create your first listing to start selling.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {myListings.map((listing) => (
                        <ListingCard
                            key={listing.id}
                            listing={listing}
                            onView={() => setViewingListing(listing)}
                            onEdit={() => setEditingListing(listing)}
                            onUnlist={() => setConfirmUnlistId(listing.id)}
                        />
                    ))}
                </div>
            )
            }

            {/* Sold Items */}
            {
                mySales.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <PackageCheck className="w-5 h-5 text-green-400" /> Sold Items
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {mySales.map((sale) => {
                                const item = listings.find((l) => l.id === sale.listingId);
                                return (
                                    <motion.div
                                        key={sale.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="bg-avalanche-dark-light border border-green-500/20 rounded-2xl overflow-hidden"
                                    >
                                        {item?.images?.[0] && (
                                            <img src={item.images[0]} alt={item?.title} className="w-full h-36 object-cover" />
                                        )}
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <h3 className="font-bold truncate">{item?.title ?? `Item #${sale.listingId}`}</h3>
                                                <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">SOLD</span>
                                            </div>
                                            <p className="text-avalanche-red font-bold text-sm mb-1">{sale.amount} AVAX</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(sale.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-0.5">Buyer: {sale.buyerAddress}</p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                )
            }

            {
                showCreateModal && (
                    <ListingModal
                        mode="create"
                        onClose={() => setShowCreateModal(false)}
                        sellerAddress={sellerId}
                        onActionResult={setToast}
                    />
                )
            }

            {
                editingListing && (
                    <ListingModal
                        mode="edit"
                        listing={editingListing}
                        onClose={() => setEditingListing(null)}
                        sellerAddress={sellerId}
                        onActionResult={setToast}
                    />
                )
            }

            {viewingListing && <ViewListingModal listing={viewingListing} onClose={() => setViewingListing(null)} />}

            {
                confirmUnlistId !== null && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-avalanche-dark border border-white/10 rounded-2xl p-8 max-w-sm w-full"
                        >
                            <h3 className="text-lg font-bold mb-2">Unlist this item?</h3>
                            <p className="text-gray-400 text-sm mb-6">
                                The listing will be removed from the marketplace. Buyers will no longer be able to find or purchase it.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmUnlistId(null)}
                                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl text-sm font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        const idToRemove = confirmUnlistId!;
                                        setConfirmUnlistId(null);
                                        try {
                                            await deleteListing(idToRemove);
                                        } catch {
                                            // Continue with local removal even if the call fails.
                                        }
                                        removeListing(idToRemove);
                                        setToast({ type: 'success', message: 'Listing removed from marketplace.' });
                                    }}
                                    className="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl text-sm font-bold transition-colors"
                                >
                                    Yes, Unlist
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )
            }

            {
                activeNegotiationId && (
                    <NegotiationChat
                        negotiationId={activeNegotiationId}
                        onClose={() => setActiveNegotiationId(null)}
                        currentUserRole="seller"
                    />
                )
            }
        </div >
    );
};

const ListingCard = ({
    listing,
    onView,
    onEdit,
    onUnlist,
}: {
    key?: React.Key;
    listing: Listing;
    onView: () => void;
    onEdit: () => void;
    onUnlist: () => void;
}) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-avalanche-dark-light border border-white/5 rounded-2xl overflow-hidden hover:border-avalanche-red/50 transition-colors"
    >
        {listing.images[0] ? (
            <img src={listing.images[0]} alt={listing.title} className="w-full h-48 object-cover" />
        ) : (
            <div className="w-full h-48 bg-white/5 flex items-center justify-center">
                <ImageOff className="w-10 h-10 text-gray-600" />
            </div>
        )}
        <div className="p-5">
            <div className="flex justify-between items-start mb-2 gap-3">
                <h3 className="text-xl font-bold truncate">{listing.title}</h3>
                <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${listing.status === 'Active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                        }`}
                >
                    {listing.status}
                </span>
            </div>
            <div className="flex items-center justify-between text-gray-300 mb-4">
                <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-avalanche-red" />
                    <span>{listing.price} AVAX</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${listing.stock > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {listing.stock > 0 ? `${listing.stock} in stock` : 'Out of stock'}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <button
                    onClick={onView}
                    className="bg-white/5 hover:bg-white/10 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                    <Eye className="w-4 h-4" /> View
                </button>
                <button
                    onClick={onEdit}
                    className="bg-avalanche-red/90 hover:bg-avalanche-red py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1"
                >
                    <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                    onClick={onUnlist}
                    className="bg-white/5 hover:bg-red-600/30 border border-white/10 hover:border-red-500/40 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 text-gray-400 hover:text-red-400"
                >
                    <Trash2 className="w-4 h-4" /> Unlist
                </button>
            </div>
        </div>
    </motion.div>
);

const ListingModal = ({
    mode,
    listing,
    onClose,
    sellerAddress,
    onActionResult,
}: {
    mode: 'create' | 'edit';
    listing?: Listing;
    onClose: () => void;
    sellerAddress: string;
    onActionResult: (toast: Toast) => void;
}) => {
    const { addListing, updateListing, upsertListing } = useAppStore();
    const [isPublishing, setIsPublishing] = useState(false);
    const [formData, setFormData] = useState<ListingFormData>(() => {
        if (!listing) {
            return EMPTY_FORM;
        }

        return {
            title: listing.title,
            price: listing.price.toString(),
            stock: listing.stock.toString(),
            description: listing.description,
            images: listing.images,
            status: listing.status,
        };
    });
    const [urlInput, setUrlInput] = useState('');

    const isEdit = mode === 'edit';

    const onPickImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(event.target.files ?? []);
        if (!files.length) return;
        const results = await Promise.all(
            files.map(
                (file: File) =>
                    new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () =>
                            resolve(typeof reader.result === 'string' ? reader.result : '');
                        reader.readAsDataURL(file);
                    }),
            ),
        );
        setFormData((prev) => ({ ...prev, images: [...prev.images, ...results.filter(Boolean)] }));
    };

    const onAddUrl = () => {
        if (!urlInput.trim()) return;
        setFormData((prev) => ({ ...prev, images: [...prev.images, urlInput.trim()] }));
        setUrlInput('');
    };

    const onRemoveImage = (index: number) => {
        setFormData((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
    };

    const onSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        const payload = {
            title: formData.title.trim(),
            price: Number(formData.price),
            stock: Number(formData.stock),
            description: formData.description.trim(),
            images: formData.images,
            status: formData.status,
            seller: sellerAddress,
        };

        if (!payload.title || Number.isNaN(payload.price) || payload.price <= 0 || Number.isNaN(payload.stock) || payload.stock < 1) {
            onActionResult({
                type: 'error',
                message: 'Enter a valid title, a price (> 0), and a stock quantity (≥ 1).',
            });
            return;
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(sellerAddress)) {
            onActionResult({
                type: 'error',
                message: 'Connect a wallet before listing so buyers have a valid payment address.',
            });
            return;
        }

        if (isEdit && listing) {
            // Push the update to the shared data source (Supabase or local API).
            setIsPublishing(true);
            editListing(listing.id, payload)
                .then((updated) => {
                    upsertListing(updated);
                })
                .catch((err: Error) => {
                    // Show real error; only fall back to local update on network failures.
                    const isNetworkFailure =
                        err.message.toLowerCase().includes('fetch') ||
                        err.message.toLowerCase().includes('network') ||
                        err.message.toLowerCase().includes('unavailable');
                    if (isNetworkFailure) {
                        updateListing(listing.id, payload);
                    } else {
                        onActionResult({ type: 'error', message: err.message || 'Failed to update listing.' });
                        return;
                    }
                })
                .finally(() => {
                    setIsPublishing(false);
                    onActionResult({ type: 'success', message: 'Listing updated successfully.' });
                    onClose();
                });
        } else {
            // Publish to shared data source (Supabase or local API).
            setIsPublishing(true);
            publishListing(payload)
                .then((created) => {
                    upsertListing(created);
                    onActionResult({ type: 'success', message: 'Listing published — visible to all buyers instantly.' });
                    onClose();
                })
                .catch((err: Error) => {
                    // Only save locally if it's a network/connectivity failure, not a validation error.
                    // A validation error (e.g. missing field) must be shown as-is so the seller can fix it.
                    const isNetworkFailure =
                        err.message.toLowerCase().includes('fetch') ||
                        err.message.toLowerCase().includes('network') ||
                        err.message.toLowerCase().includes('unavailable') ||
                        err.message.toLowerCase().includes('failed to fetch');

                    if (isNetworkFailure) {
                        addListing(payload);
                        onActionResult({
                            type: 'error',
                            message: 'Server unreachable. Listing saved locally — set up Supabase in .env so buyers on other devices can see it.',
                        });
                        onClose();
                    } else {
                        // Validation or auth error — show the actual message, don’t close the modal.
                        onActionResult({
                            type: 'error',
                            message: err.message || 'Failed to publish listing. Check all required fields.',
                        });
                    }
                })
                .finally(() => {
                    setIsPublishing(false);
                });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-avalanche-dark border border-white/10 p-6 rounded-3xl max-w-lg w-full relative overflow-y-auto max-h-[90vh]"
            >
                <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-white">
                    <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Listing' : 'Create New Listing'}</h2>

                <form className="space-y-4" onSubmit={onSubmit}>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Title</label>
                        <input
                            required
                            type="text"
                            value={formData.title}
                            onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                            placeholder="e.g. Web3 Consultation"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Price (AVAX)</label>
                        <input
                            required
                            min="0.0001"
                            step="0.0001"
                            type="number"
                            value={formData.price}
                            onChange={(event) => setFormData((prev) => ({ ...prev, price: event.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Stock Quantity</label>
                        <input
                            required
                            min="1"
                            step="1"
                            type="number"
                            value={formData.stock}
                            onChange={(event) => setFormData((prev) => ({ ...prev, stock: event.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                            placeholder="e.g. 10"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Description</label>
                        <textarea
                            required
                            value={formData.description}
                            onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors h-32"
                            placeholder="Describe your item..."
                        />
                    </div>

                    {isEdit && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Status</label>
                            <select
                                value={formData.status}
                                onChange={(event) =>
                                    setFormData((prev) => ({ ...prev, status: event.target.value as 'Active' | 'Sold' }))
                                }
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                            >
                                <option value="Active">Active</option>
                                <option value="Sold">Sold</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Upload Images From Device</label>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={onPickImages}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Or Add Image URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddUrl())}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 focus:border-avalanche-red outline-none transition-colors"
                                placeholder="https://..."
                            />
                            <button
                                type="button"
                                onClick={onAddUrl}
                                className="bg-white/10 hover:bg-white/20 px-4 rounded-xl text-sm font-medium transition-colors"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {formData.images.length > 0 && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">
                                Images ({formData.images.length})
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {formData.images.map((src, idx) => (
                                    <div key={idx} className="relative group">
                                        <img
                                            src={src}
                                            alt={`preview-${idx}`}
                                            className="w-full h-20 object-cover rounded-lg border border-white/10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onRemoveImage(idx)}
                                            className="absolute top-1 right-1 bg-black/70 hover:bg-black p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                        {idx === 0 && (
                                            <span className="absolute bottom-1 left-1 bg-avalanche-red text-[9px] font-bold px-1.5 py-0.5 rounded">
                                                COVER
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isPublishing}
                        className="w-full bg-avalanche-red hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold mt-4 transition-colors flex items-center justify-center gap-2"
                    >
                        {isPublishing ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
                        ) : isEdit ? 'Save Changes' : 'Publish Listing'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

const ViewListingModal = ({ listing, onClose }: { listing: Listing; onClose: () => void }) => {
    const [imgIdx, setImgIdx] = useState(0);
    const images = listing.images;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-avalanche-dark border border-white/10 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col md:flex-row"
            >
                <div className="md:w-2/5 h-56 md:h-auto md:min-h-[280px] relative shrink-0">
                    <img src={images[imgIdx] ?? ''} alt={listing.title} className="w-full h-full object-cover" />
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
                                {images.map((_, i) => (
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

                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-400">Asking Price</span>
                            <span className="text-xl font-bold text-avalanche-red">{listing.price} AVAX</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="text-gray-500">Status</span>
                            <span className={listing.status === 'Active' ? 'text-green-400' : 'text-gray-400'}>{listing.status}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Stock</span>
                            <span className={listing.stock > 0 ? 'text-blue-400' : 'text-red-400'}>{listing.stock} remaining</span>
                        </div>
                    </div>

                    <p className="text-gray-300 leading-relaxed text-sm">{listing.description}</p>
                </div>
            </motion.div>
        </div>
    );
};
