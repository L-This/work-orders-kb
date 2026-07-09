import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(url && anon);

export const supabase = createClient(
  url || 'https://example.supabase.co',
  anon || 'placeholder-anon-key'
);
