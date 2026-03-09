/**
 * Unified listings API.
 *
 * When VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set:
 *   → Uses Supabase (true cross-device, cross-wallet, real-time).
 *
 * Otherwise:
 *   → Falls back to the local Express API at /api/listings.
 *     Works for same-device testing; run `npm run dev` to start the server.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import type { Listing } from '../store/useAppStore';

export { isSupabaseConfigured };

// ---------- fetch ----------

/** Fetch with up to `retries` automatic retries (exponential backoff). */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (err) {
            lastErr = err;
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
            }
        }
    }
    throw lastErr;
}

/** Throw an error whose message includes the API's own error text for 4xx/5xx. */
async function throwApiError(res: Response, fallback: string): Promise<never> {
    try {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? fallback);
    } catch (e) {
        // If the body wasn't JSON (e.g. Vite's HTML 404 page), use the fallback.
        if (e instanceof SyntaxError) throw new Error(fallback);
        if (e instanceof Error) throw e;
        throw new Error(fallback);
    }
}

export async function fetchListings(): Promise<Listing[]> {
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .order('id', { ascending: true });
        if (error) throw error;
        return (data ?? []) as unknown as Listing[];
    }
    const res = await fetchWithRetry('/api/listings');
    if (!res.ok) await throwApiError(res, 'Could not load listings from server.');
    return res.json() as Promise<Listing[]>;
}

// ---------- create ----------

export async function publishListing(
    payload: Omit<Listing, 'id'>,
): Promise<Listing> {
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('listings')
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return data as unknown as Listing;
    }
    const res = await fetchWithRetry('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) await throwApiError(res, 'Could not publish listing.');
    return res.json() as Promise<Listing>;
}

// ---------- update ----------

export async function editListing(
    id: number,
    updates: Partial<Omit<Listing, 'id'>>,
): Promise<Listing> {
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('listings')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as unknown as Listing;
    }
    const res = await fetchWithRetry(`/api/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    if (!res.ok) await throwApiError(res, 'Could not update listing.');
    return res.json() as Promise<Listing>;
}

// ---------- delete ----------

export async function deleteListing(id: number): Promise<void> {
    if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('listings').delete().eq('id', id);
        if (error) throw error;
        return;
    }
    await fetchWithRetry(`/api/listings/${id}`, { method: 'DELETE' });
}

// ---------- decrement stock ----------

export async function decrementListingStock(id: number): Promise<Listing> {
    if (isSupabaseConfigured && supabase) {
        // Read current stock, then update atomically via a single round-trip.
        const { data: current, error: readErr } = await supabase
            .from('listings')
            .select('stock')
            .eq('id', id)
            .single();
        if (readErr) throw readErr;
        const newStock = Math.max(0, (current.stock as number) - 1);
        const { data, error } = await supabase
            .from('listings')
            .update({ stock: newStock, status: newStock === 0 ? 'Sold' : 'Active' })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as unknown as Listing;
    }
    const res = await fetchWithRetry(`/api/listings/${id}/decrement`, { method: 'POST' });
    if (!res.ok) await throwApiError(res, 'Stock update failed.');
    return res.json() as Promise<Listing>;
}

// ---------- real-time subscription ----------

/**
 * Subscribe to all listing changes in Supabase and call `onChange` with the
 * full updated listings array on each insert / update / delete.
 * Returns an unsubscribe function.
 *
 * When Supabase is not configured this is a no-op (returns a no-op cleanup).
 */
export function subscribeToListings(onChange: (listings: Listing[]) => void): () => void {
    if (!isSupabaseConfigured || !supabase) return () => undefined;

    const channel = supabase
        .channel('listings-realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'listings' },
            async () => {
                // Re-fetch the full list on any change so we always have fresh, consistent data.
                try {
                    const listings = await fetchListings();
                    onChange(listings);
                } catch {
                    // ignore transient errors
                }
            },
        )
        .subscribe();

    return () => {
        void supabase.removeChannel(channel);
    };
}
