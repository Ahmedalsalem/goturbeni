import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ShieldAlert } from "lucide-react"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SuspendedPage")
  return { title: t("title") }
}

// Reached via verifySession() redirecting suspended users away from
// protected pages (see src/lib/supabase/dal.ts). Purely informational — no
// appeal form, no way out from here other than contacting support out of
// band.
export default async function SuspendedPage() {
  const t = await getTranslations("SuspendedPage")

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <ShieldAlert className="text-destructive size-10" aria-hidden="true" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </div>
  )
}
