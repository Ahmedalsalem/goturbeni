import { createBrowserClient } from "@supabase/ssr"

// Browser-only — the one place in this codebase that talks to Supabase
// outside a Server Component/Action/Route Handler. Needed for Realtime
// (postgres_changes/broadcast subscriptions run over a client-side
// websocket, which server.ts's cookie-bound client can't do). Respects RLS
// as the currently signed-in user, same as the server client.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
