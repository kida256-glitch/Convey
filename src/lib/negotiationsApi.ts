import { configReady, isSupabaseConfigured, supabase } from './supabase';
import type { AppNotification, Message, Negotiation, Purchase } from '../store/useAppStore';

type NegotiationRow = {
    id: string;
    listing_id: number;
    on_chain_listing_id: number | null;
    buyer_address: string;
    seller_address: string;
    status: Negotiation['status'];
    current_offer: number;
    messages: Message[] | null;
    on_chain_offer_id: number | null;
    payment_tx_hash: string | null;
};

type NotificationRow = {
    id: string;
    negotiation_id: string;
    for_role: AppNotification['forRole'];
    preview: string;
    read: boolean;
    timestamp: number;
};

type PurchaseRow = {
    id: string;
    negotiation_id: string;
    listing_id: number;
    buyer_address: string;
    seller_address: string;
    amount: number;
    completed_at: number;
    tx_hash: string | null;
};

let syncDisabled = false;

function isMissingSchemaError(err: unknown): boolean {
    const msg = (err as { message?: string } | null)?.message?.toLowerCase() ?? '';
    return msg.includes('does not exist') || msg.includes('relation') || msg.includes('column');
}

function disableSyncIfSchemaMissing(err: unknown): void {
    if (isMissingSchemaError(err)) {
        syncDisabled = true;
        console.warn('[Convey] Negotiation realtime sync disabled. Required Supabase tables are missing.');
    }
}

async function canUseSupabaseSync(): Promise<boolean> {
    await configReady;
    return !!(isSupabaseConfigured && supabase && !syncDisabled);
}

function fromNegotiationRow(row: NegotiationRow): Negotiation {
    return {
        id: row.id,
        listingId: row.listing_id,
        onChainListingId: row.on_chain_listing_id ?? undefined,
        buyerAddress: row.buyer_address,
        sellerAddress: row.seller_address,
        status: row.status,
        currentOffer: Number(row.current_offer ?? 0),
        messages: Array.isArray(row.messages) ? row.messages : [],
        onChainOfferId: row.on_chain_offer_id ?? undefined,
        paymentTxHash: row.payment_tx_hash ?? undefined,
    };
}

function toNegotiationRow(negotiation: Negotiation): NegotiationRow {
    return {
        id: negotiation.id,
        listing_id: negotiation.listingId,
        on_chain_listing_id: negotiation.onChainListingId ?? null,
        buyer_address: negotiation.buyerAddress,
        seller_address: negotiation.sellerAddress,
        status: negotiation.status,
        current_offer: negotiation.currentOffer,
        messages: negotiation.messages,
        on_chain_offer_id: negotiation.onChainOfferId ?? null,
        payment_tx_hash: negotiation.paymentTxHash ?? null,
    };
}

function fromNotificationRow(row: NotificationRow): AppNotification {
    return {
        id: row.id,
        negotiationId: row.negotiation_id,
        forRole: row.for_role,
        preview: row.preview,
        read: !!row.read,
        timestamp: Number(row.timestamp ?? Date.now()),
    };
}

function toNotificationRow(notification: AppNotification): NotificationRow {
    return {
        id: notification.id,
        negotiation_id: notification.negotiationId,
        for_role: notification.forRole,
        preview: notification.preview,
        read: notification.read,
        timestamp: notification.timestamp,
    };
}

function fromPurchaseRow(row: PurchaseRow): Purchase {
    return {
        id: row.id,
        negotiationId: row.negotiation_id,
        listingId: row.listing_id,
        buyerAddress: row.buyer_address,
        sellerAddress: row.seller_address,
        amount: Number(row.amount ?? 0),
        completedAt: Number(row.completed_at ?? Date.now()),
        txHash: row.tx_hash ?? undefined,
    };
}

function toPurchaseRow(purchase: Purchase): PurchaseRow {
    return {
        id: purchase.id,
        negotiation_id: purchase.negotiationId,
        listing_id: purchase.listingId,
        buyer_address: purchase.buyerAddress,
        seller_address: purchase.sellerAddress,
        amount: purchase.amount,
        completed_at: purchase.completedAt,
        tx_hash: purchase.txHash ?? null,
    };
}

export async function fetchNegotiations(): Promise<Negotiation[] | null> {
    if (!(await canUseSupabaseSync())) return null;
    const { data, error } = await supabase!.from('negotiations').select('*').order('id', { ascending: true });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return null;
    }
    return ((data ?? []) as NegotiationRow[]).map(fromNegotiationRow);
}

export async function fetchNotifications(): Promise<AppNotification[] | null> {
    if (!(await canUseSupabaseSync())) return null;
    const { data, error } = await supabase!.from('notifications').select('*').order('timestamp', { ascending: true });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return null;
    }
    return ((data ?? []) as NotificationRow[]).map(fromNotificationRow);
}

export async function fetchPurchases(): Promise<Purchase[] | null> {
    if (!(await canUseSupabaseSync())) return null;
    const { data, error } = await supabase!.from('purchases').select('*').order('completed_at', { ascending: true });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return null;
    }
    return ((data ?? []) as PurchaseRow[]).map(fromPurchaseRow);
}

export async function syncNegotiationState(): Promise<{
    negotiations: Negotiation[];
    notifications: AppNotification[];
    purchases: Purchase[];
} | null> {
    const [negotiations, notifications, purchases] = await Promise.all([
        fetchNegotiations(),
        fetchNotifications(),
        fetchPurchases(),
    ]);

    if (!negotiations || !notifications || !purchases) return null;
    return { negotiations, notifications, purchases };
}

export async function upsertNegotiationRemote(negotiation: Negotiation): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;
    const { error } = await supabase!.from('negotiations').upsert(toNegotiationRow(negotiation), {
        onConflict: 'id',
        ignoreDuplicates: false,
    });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }
    return true;
}

export async function updateNegotiationRemote(id: string, updates: Partial<Negotiation>): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;

    const payload: Partial<NegotiationRow> = {};
    if (updates.listingId !== undefined) payload.listing_id = updates.listingId;
    if (updates.onChainListingId !== undefined) payload.on_chain_listing_id = updates.onChainListingId ?? null;
    if (updates.buyerAddress !== undefined) payload.buyer_address = updates.buyerAddress;
    if (updates.sellerAddress !== undefined) payload.seller_address = updates.sellerAddress;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.currentOffer !== undefined) payload.current_offer = updates.currentOffer;
    if (updates.messages !== undefined) payload.messages = updates.messages;
    if (updates.onChainOfferId !== undefined) payload.on_chain_offer_id = updates.onChainOfferId ?? null;
    if (updates.paymentTxHash !== undefined) payload.payment_tx_hash = updates.paymentTxHash ?? null;

    const { error } = await supabase!.from('negotiations').update(payload).eq('id', id);
    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }
    return true;
}

export async function appendMessageRemote(negotiationId: string, message: Message, extraUpdates?: Partial<Negotiation>): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;

    // Fast path: caller already computed full message list, so avoid select+update.
    if (Array.isArray(extraUpdates?.messages)) {
        return updateNegotiationRemote(negotiationId, extraUpdates);
    }

    const { data, error } = await supabase!
        .from('negotiations')
        .select('messages')
        .eq('id', negotiationId)
        .single<{ messages: Message[] | null }>();

    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }

    const nextMessages = [...(Array.isArray(data?.messages) ? data.messages : []), message];
    return updateNegotiationRemote(negotiationId, { ...(extraUpdates ?? {}), messages: nextMessages });
}

export async function addNotificationRemote(notification: AppNotification): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;
    const { error } = await supabase!.from('notifications').upsert(toNotificationRow(notification), {
        onConflict: 'id',
        ignoreDuplicates: false,
    });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }
    return true;
}

export async function markNotificationsReadRemote(negotiationId: string, role: 'buyer' | 'seller'): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;
    const { error } = await supabase!
        .from('notifications')
        .update({ read: true })
        .eq('negotiation_id', negotiationId)
        .eq('for_role', role);

    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }
    return true;
}

export async function addPurchaseRemote(purchase: Purchase): Promise<boolean> {
    if (!(await canUseSupabaseSync())) return false;
    const { error } = await supabase!.from('purchases').upsert(toPurchaseRow(purchase), {
        onConflict: 'id',
        ignoreDuplicates: false,
    });
    if (error) {
        disableSyncIfSchemaMissing(error);
        return false;
    }
    return true;
}

export async function subscribeToNegotiationState(onChange: (state: {
    negotiations: Negotiation[];
    notifications: AppNotification[];
    purchases: Purchase[];
}) => void): Promise<() => void> {
    if (!(await canUseSupabaseSync())) return () => undefined;

    const push = async () => {
        const state = await syncNegotiationState();
        if (state) onChange(state);
    };

    await push();

    const channel = supabase!
        .channel('negotiations-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'negotiations' }, push)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, push)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, push)
        .subscribe();

    return () => {
        void supabase!.removeChannel(channel);
    };
}
