import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

// Handles two kinds of links, distinguished by which params are present:
// - `code` (PKCE): email confirmation / OAuth. Requires exchanging on the
//   same browser that started the flow (the code verifier lives in a
//   cookie there), which is fine for those flows.
// - `token_hash` + `type` (OTP): password recovery. Verified directly
//   against Supabase's Auth service with no code-verifier requirement,
//   which matters because recovery links are routinely opened on a
//   different device/browser/email client than the one that requested
//   them — exchangeCodeForSession would fail with "Auth session missing"
//   in that (extremely common) case.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/profile"

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
