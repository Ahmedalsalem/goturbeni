import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

// Server Components, Route Handlers, and Server Actions only — respects RLS as
// the currently signed-in user (or anon). Create a new client per request;
// never cache/share this across requests.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component render — cookies can't be set there.
          // middleware.ts refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  })
}
