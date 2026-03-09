import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Fast path: env vars baked in at Vite build time (works when bundle is fresh).
const bundleUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const bundleKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Safety fallback for environments where runtime /api/config is unavailable.
// Supabase anon keys are safe for public clients and still respect RLS policies.
const fallbackUrl = 'https://dfkoyphcjgrprdvqcozn.supabase.co';
const fallbackAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma295cGhjamdycHJkdnFjb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTQ0MzEsImV4cCI6MjA4ODYzMDQzMX0.xXWaUWgirHqXgLz8KY_GGUZt_GTXWK6h0kZYnlBUvwQ';

export let supabase: SupabaseClient | null =
    bundleUrl?.startsWith('https://') && bundleKey && bundleKey.length > 10
        ? createClient(bundleUrl, bundleKey)
        : null;

export let isSupabaseConfigured: boolean = supabase !== null;

/**
 * Resolves once the Supabase client is ready.
 *
 * If env vars were baked in at build time (fresh bundle) this resolves instantly.
 * If the bundle is stale (browser cache), it fetches /api/config at runtime so
 * the app can still reach Supabase without requiring a hard reload.
 *
 * All listingsApi functions await this before touching Supabase.
 */
export const configReady: Promise<void> = isSupabaseConfigured
    ? Promise.resolve()
    : fetch('/api/config')
        .then((r) => (r.ok ? (r.json() as Promise<{ supabaseUrl?: string; supabaseAnonKey?: string }>) : null))
        .then((cfg) => {
            const url = cfg?.supabaseUrl?.startsWith('https://') ? cfg.supabaseUrl : fallbackUrl;
            const key = cfg?.supabaseAnonKey && cfg.supabaseAnonKey.length > 10 ? cfg.supabaseAnonKey : fallbackAnonKey;
            supabase = createClient(url, key);
            isSupabaseConfigured = true;
        })
        .catch(() => {
            supabase = createClient(fallbackUrl, fallbackAnonKey);
            isSupabaseConfigured = true;
        });
