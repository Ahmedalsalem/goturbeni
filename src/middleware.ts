import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured } from "@/lib/supabase/is-configured"

export async function middleware(request: NextRequest) {
  // Guest browsing must keep working even before Supabase credentials are set up.
  if (!isSupabaseConfigured()) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refreshes the session token if needed and writes it back to the response
  // cookies. Keep this call here even though most routes don't check the
  // result — omitting it causes random logouts as tokens silently expire.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware-level gating is intentionally minimal (cheap, cookie-based) —
  // it is not the sole authorization boundary. Each protected page also calls
  // verifySession() server-side, which is the real guard.
  const { pathname } = request.nextUrl
  const isProtected =
    pathname.startsWith("/profile") ||
    pathname.startsWith("/create-ride") ||
    pathname.startsWith("/rides/mine") ||
    pathname.startsWith("/bookings") ||
    /^\/rides\/[^/]+\/edit$/.test(pathname) ||
    /^\/rides\/[^/]+\/bookings$/.test(pathname) ||
    /^\/rides\/[^/]+\/chat$/.test(pathname)

  if (!user && isProtected) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
