"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

// Used only from RideCard's SEO-landing-page usage ([slug]/page.tsx), which
// is statically rendered with `revalidate = 3600` — a server-side guest
// check there would get baked into the cached HTML and served to every
// visitor (guest or not) until the next revalidation, so the guest/member
// decision has to happen client-side, at click time, instead.
export function GuestGateLink({
  href,
  loginHref,
  className,
  children,
}: {
  href: string
  loginHref: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  async function handleClick(event: React.MouseEvent) {
    event.preventDefault()
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    router.push(session ? href : loginHref)
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  )
}
