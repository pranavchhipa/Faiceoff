import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/types/supabase';

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? (() => { throw new Error('Missing Supabase anon/publishable key'); })();
}

export function createClient() {
  return createBrowserClient<Database>(
    getEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
    getSupabaseAnonKey(),
  );
}
