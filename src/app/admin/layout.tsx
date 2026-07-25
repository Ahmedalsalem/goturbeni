import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeft, BarChart3, CarFront, Receipt, Users } from "lucide-react"

import { verifySession } from "@/lib/supabase/dal"
import { checkIsAdmin } from "@/features/admin/queries"
import { buttonVariants } from "@/components/ui/button"

// verifySession() already redirects anonymous/suspended users (see
// middleware.ts, which adds /admin to the protected matcher, and
// src/lib/supabase/dal.ts). The is_admin check below is the actual
// authorization gate for this route group — it runs before any admin data
// is fetched by the pages underneath, and 404s (rather than redirecting) so
// a non-admin can't tell the route exists.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await verifySession()
  const isAdmin = await checkIsAdmin(user.id)
  if (!isAdmin) {
    notFound()
  }

  const t = await getTranslations("Admin.nav")

  const links = [
    { href: "/admin", label: t("analytics"), icon: BarChart3 },
    { href: "/admin/users", label: t("users"), icon: Users },
    { href: "/admin/rides", label: t("rides"), icon: CarFront },
    { href: "/admin/payments", label: t("payments"), icon: Receipt },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={buttonVariants({ variant: "ghost", className: "gap-1.5" })}>
              <link.icon className="size-4" aria-hidden="true" />
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("backToSite")}
        </Link>
      </div>
      {children}
    </div>
  )
}
