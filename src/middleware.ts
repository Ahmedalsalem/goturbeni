import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured } from "@/lib/supabase/is-configured"

const SIGNUP_SOURCE_COOKIE = "gb_src"
const SIGNUP_SOURCE_COOKIE_MAX_AGE = 90 * 24 * 60 * 60

// First-touch attribution for the admin "kullanıcı nereden geldi" metric
// (features/admin/queries.ts, signup_source column, 0088_signup_source.sql):
// utm_source wins if present, else the external referrer's host, else
// "direct". Written once per visitor — never overwritten once set, so a
// later same-site navigation (e.g. clicking "Kayıt ol" from /rides) doesn't
// clobber the campaign that actually brought them in.
function resolveSignupSource(request: NextRequest): string {
  const utmSource = request.nextUrl.searchParams.get("utm_source")
  if (utmSource) {
    return utmSource.slice(0, 100)
  }
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      const referrerHost = new URL(referer).host
      if (referrerHost && referrerHost !== request.nextUrl.host) {
        return referrerHost.slice(0, 100)
      }
    } catch {
      // Malformed Referer header — fall through to "direct".
    }
  }
  return "direct"
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rebuilds request headers from the current (possibly cookie-mutated) request
  // and stamps the pathname so generateMetadata() can read it via headers().
  function nextResponse() {
    const headers = new Headers(request.headers)
    headers.set("x-pathname", pathname)
    return NextResponse.next({ request: { headers } })
  }

  // Guest browsing must keep working even before Supabase credentials are set up.
  if (!isSupabaseConfigured()) {
    return nextResponse()
  }

  let response = nextResponse()

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
          response = nextResponse()
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refreshes the session token if needed and writes it back to the response
  // cookies. Keep this call here even though most routes don't check the
  // result — omitting it causes random logouts as tokens silently expire.
  // A stale/revoked refresh-token cookie (seen live: AuthApiError "Invalid
  // Refresh Token: Refresh Token Not Found", 8 occurrences from one browser
  // over ~1.5 months) makes getUser() throw rather than resolve with a null
  // user — uncaught, that crashes the middleware invocation on every request
  // for that visitor instead of just falling through to the normal
  // logged-out/redirect path below.
  let user = null
  try {
    ;({
      data: { user },
    } = await supabase.auth.getUser())
  } catch {
    user = null
  }

  // Middleware-level gating is intentionally minimal (cheap, cookie-based) —
  // it is not the sole authorization boundary. Each protected page also calls
  // verifySession() server-side, which is the real guard.
  const isProtected =
    pathname.startsWith("/profile") ||
    pathname.startsWith("/verify-phone") ||
    pathname.startsWith("/create-ride") ||
    pathname.startsWith("/rides/mine") ||
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/admin") ||
    /^\/rides\/[^/]+\/edit$/.test(pathname) ||
    /^\/rides\/[^/]+\/bookings$/.test(pathname) ||
    /^\/rides\/[^/]+\/chat$/.test(pathname)

  if (!user && isProtected) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Set last (after the supabase client's own setAll calls above, which
  // replace `response` wholesale on every auth-cookie write) so this cookie
  // always survives on the response actually returned.
  if (!request.cookies.get(SIGNUP_SOURCE_COOKIE)) {
    response.cookies.set(SIGNUP_SOURCE_COOKIE, resolveSignupSource(request), {
      maxAge: SIGNUP_SOURCE_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
