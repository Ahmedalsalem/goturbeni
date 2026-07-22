import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { WifiOff } from "lucide-react"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Offline")
  return { title: t("title") }
}

// Cached by the service worker (public/sw.js) at install time and served for
// any navigation request that fails while offline — see also the "temel
// düzey" (basic-level) offline fallback requirement in the Faz 7 brief.
export default async function OfflinePage() {
  const t = await getTranslations("Offline")

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <WifiOff className="text-muted-foreground size-10" aria-hidden="true" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </div>
  )
}
