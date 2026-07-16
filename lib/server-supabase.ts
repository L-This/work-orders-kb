import { createClient } from '@supabase/supabase-js';

function required(name: string, fallback?: string) {
  const value = process.env[name] || fallback || '';
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function createWorkOrdersAdminClient() {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function createIrrigationAdminClient() {
  return createClient(
    required('IRRIGATION_SUPABASE_URL'),
    required('IRRIGATION_SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
