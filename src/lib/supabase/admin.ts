import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/supabase';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * WARNING: This client uses the service role key and bypasses Row Level Security (RLS).
 * Only use in trusted server-side contexts (API routes, server actions, background jobs).
 * Never expose this client or its key to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
