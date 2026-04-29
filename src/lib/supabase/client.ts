import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/types/supabase';

/**
 * Browser-side Supabase client.
 *
 * IMPORTANT: Next.js webpack DefinePlugin only inlines
 * `process.env.NEXT_PUBLIC_*` references when accessed STATICALLY at the
 * source. Dynamic forms like `process.env[name]` are NOT inlined and
 * evaluate to undefined in the browser bundle, even when the env var is
 * set in Vercel.
 *
 * Older code used a generic getEnvVar(name) helper which broke client-side
 * Supabase initialisation (chat inbox / any page using this) with
 * "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL" even
 * though the var was correctly configured. Fixed to use static access.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error(
      'Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL',
    );
  }
  if (!key) {
    throw new Error('Missing Supabase anon/publishable key');
  }

  return createBrowserClient<Database>(url, key);
}
