import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type UserRole = 'buyer' | 'seller' | null;

export interface Message {
  id: string;
  sender: 'buyer' | 'seller';
  text: string;
  type: 'text' | 'offer' | 'counter' | 'accept';
  amount?: number;
  timestamp: number;
}

export interface Negotiation {
  id: string;
  listingId: number;
  buyerAddress: string;
  sellerAddress: string;
  status: 'open' | 'countered' | 'accepted' | 'rejected';
  currentOffer: number;
  messages: Message[];
  /** On-chain offer ID returned by makeOffer() — set once buyer sends payment */
  onChainOfferId?: number;
  /** On-chain listing ID to use for makeOffer / acceptOffer calls */
  onChainListingId?: number;
  /** Tx hash of the buyer's makeOffer / buyDirect tx — confirms payment was sent */
  paymentTxHash?: string;
}

export interface Purchase {
  id: string;
  negotiationId: string;
  listingId: number;
  buyerAddress: string;
  sellerAddress: string;
  amount: number;
  completedAt: number;
  /** On-chain transaction hash, present when settled on Fuji */
  txHash?: string;
}

export interface AppNotification {
  id: string;
  negotiationId: string;
  forRole: 'buyer' | 'seller';
  preview: string;
  read: boolean;
  timestamp: number;
}

export interface Listing {
  id: number;
  /** On-chain listingId returned by createListing() — set after tx confirms */
  onChainId?: number;
  title: string;
  price: number;
  stock: number;
  status: 'Active' | 'Sold';
  images: string[];
  seller: string;
  description: string;
}

interface AppState {
  role: UserRole;
  setRole: (role: UserRole) => void;
  currentView: 'landing' | 'role-selection' | 'dashboard' | 'marketplace';
  setCurrentView: (view: 'landing' | 'role-selection' | 'dashboard' | 'marketplace') => void;

  negotiations: Negotiation[];
  addNegotiation: (negotiation: Negotiation) => void;
  updateNegotiation: (id: string, updates: Partial<Negotiation>) => void;
  addMessage: (negotiationId: string, message: Message) => void;

  listings: Listing[];
  setListings: (listings: Listing[]) => void;
  upsertListing: (listing: Listing) => void;
  addListing: (listing: Omit<Listing, 'id'>) => void;
  updateListing: (id: number, updates: Partial<Omit<Listing, 'id'>>) => void;
  removeListing: (id: number) => void;
  decrementStock: (id: number) => void;
  setListingOnChainId: (localId: number, onChainId: number) => void;

  notifications: AppNotification[];
  addNotification: (n: AppNotification) => void;
  markNotificationsRead: (negotiationId: string, role: 'buyer' | 'seller') => void;

  purchases: Purchase[];
  addPurchase: (purchase: Purchase) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      role: null,
      setRole: (role) => set({ role }),
      currentView: 'landing',
      setCurrentView: (view) => set({ currentView: view }),

      negotiations: [],
      addNegotiation: (negotiation) => set((state) => ({ negotiations: [...state.negotiations, negotiation] })),
      updateNegotiation: (id, updates) => set((state) => ({
        negotiations: state.negotiations.map((n) => n.id === id ? { ...n, ...updates } : n)
      })),
      addMessage: (negotiationId, message) => set((state) => ({
        negotiations: state.negotiations.map((n) =>
          n.id === negotiationId ? { ...n, messages: [...n.messages, message] } : n
        )
      })),

      purchases: [],
      addPurchase: (purchase) =>
        set((state) => ({ purchases: [...state.purchases, purchase] })),

      notifications: [],
      addNotification: (n) =>
        set((state) => ({ notifications: [...state.notifications, n] })),
      markNotificationsRead: (negotiationId, role) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.negotiationId === negotiationId && n.forRole === role ? { ...n, read: true } : n
          ),
        })),

      listings: [],
      setListings: (listings) => set(() => ({ listings })),
      upsertListing: (listing) =>
        set((state) => {
          const exists = state.listings.some((l) => l.id === listing.id);
          return {
            listings: exists
              ? state.listings.map((l) => (l.id === listing.id ? listing : l))
              : [...state.listings, listing],
          };
        }),
      addListing: (listing) =>
        set((state) => {
          const nextId = state.listings.length
            ? Math.max(...state.listings.map((item) => item.id)) + 1
            : 1;

          return {
            listings: [...state.listings, { ...listing, id: nextId }],
          };
        }),
      updateListing: (id, updates) =>
        set((state) => ({
          listings: state.listings.map((listing) =>
            listing.id === id ? { ...listing, ...updates } : listing
          ),
        })),
      removeListing: (id) =>
        set((state) => ({
          listings: state.listings.filter((l) => l.id !== id),
        })),
      decrementStock: (id) =>
        set((state) => ({
          listings: state.listings.map((l) => {
            if (l.id !== id) return l;
            const newStock = Math.max(0, l.stock - 1);
            return { ...l, stock: newStock, status: newStock === 0 ? 'Sold' : l.status };
          }),
        })),
      setListingOnChainId: (localId, onChainId) =>
        set((state) => ({
          listings: state.listings.map((l) => l.id === localId ? { ...l, onChainId } : l),
        })),
    }),
    {
      name: 'convey-app-store',
      storage: createJSONStorage(() => localStorage),
      // Keep marketplace data across wallet reconnects; avoid persisting transient navigation state.
      partialize: (state) => ({
        role: state.role,
        listings: state.listings,
        negotiations: state.negotiations,
        notifications: state.notifications,
        purchases: state.purchases,
      }),
    },
  ),
);
