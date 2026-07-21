// Guards against the app hard-crashing on every request (via middleware.ts and
// any getCurrentUser() calls) when Supabase env vars haven't been set up yet —
// e.g. local dev before pasting real project credentials into .env.local.
// Guest browsing must keep working even when auth isn't configured.
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
