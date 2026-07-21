import { getTranslations } from "next-intl/server"
import { CarFront } from "lucide-react"

export async function Footer() {
  const t = await getTranslations("Footer")
  const year = new Date().getFullYear()

  return (
    <footer className="border-border/70 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:gap-2 sm:text-start">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CarFront className="text-muted-foreground size-4" aria-hidden="true" />
          GötürBeni
        </div>
        <p className="text-muted-foreground text-sm">{t("tagline")}</p>
        <p className="text-muted-foreground text-sm">
          © {year} GötürBeni — {t("rights")}
        </p>
      </div>
    </footer>
  )
}
