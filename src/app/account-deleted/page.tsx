import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { UserX } from "lucide-react"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AccountDeletedPage")
  return { title: t("title") }
}

// Reached via verifySession()/signIn() redirecting a session whose profile
// carries deleted_at (see src/lib/supabase/dal.ts, deleteOwnAccount in
// features/profile/actions.ts). Purely informational, same shape as
// /suspended — no recovery flow, a deleted account is gone for good.
export default async function AccountDeletedPage() {
  const t = await getTranslations("AccountDeletedPage")

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <UserX className="text-destructive size-10" aria-hidden="true" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </div>
  )
}
