import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are both set.
 * When true, all listing operations go through Supabase (cross-device / cross-wallet).
 * When false, the app falls back to the local Express API (/api/listings).
 */
export const isSupabaseConfigured = !!(
    url &&
    key &&
    url.startsWith('https://') &&
    key.length > 10
);

export const supabase = isSupabaseConfigured
    ? createClient(url!, key!)
    : null;
