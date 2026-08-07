import Link from "next/link"
import Image from "next/image"
import { getTranslations } from "next-intl/server"

import { SOCIAL_LINKS } from "@/lib/social-links"

const SOCIAL_ICONS: Record<(typeof SOCIAL_LINKS)[number]["name"], React.ReactNode> = {
  Facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M12 2c-2.72 0-3.06.01-4.12.06-1.06.05-1.79.22-2.43.47-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.25.64-.42 1.37-.47 2.43C2 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.06.22 1.79.47 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.64.25 1.37.42 2.43.47C8.94 22 9.28 22 12 22s3.06-.01 4.12-.06c1.06-.05 1.79-.22 2.43-.47.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.25-.64.42-1.37.47-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.06-.22-1.79-.47-2.43a4.9 4.9 0 0 0-1.16-1.77 4.9 4.9 0 0 0-1.77-1.16c-.64-.25-1.37-.42-2.43-.47C15.06 2.01 14.72 2 12 2Zm0 1.8c2.67 0 2.99.01 4.04.06.98.04 1.5.21 1.86.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.13.36.3.88.34 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.04.98-.21 1.5-.34 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.13-.88.3-1.86.34-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.98-.04-1.5-.21-1.86-.34a3.1 3.1 0 0 1-1.15-.75 3.1 3.1 0 0 1-.75-1.15c-.13-.36-.3-.88-.34-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.04-.98.21-1.5.34-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.13.88-.3 1.86-.34C9.01 3.81 9.33 3.8 12 3.8Zm0 3.06a5.14 5.14 0 1 0 0 10.28 5.14 5.14 0 0 0 0-10.28Zm0 8.48a3.34 3.34 0 1 1 0-6.68 3.34 3.34 0 0 1 0 6.68Zm5.34-8.69a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <path d="M16.6 2h-3.3v13.6a2.87 2.87 0 1 1-2.03-2.75V9.5a6.1 6.1 0 1 0 5.33 6.05V8.3a7.6 7.6 0 0 0 4.4 1.4V6.4a4.3 4.3 0 0 1-4.4-4.4Z" />
    </svg>
  ),
}

export async function Footer() {
  const t = await getTranslations("Footer")
  const tNav = await getTranslations("Nav")
  const year = new Date().getFullYear()

  return (
    <footer className="border-border/70 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:gap-2 sm:text-start">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Image src="/brand/logo-mark.png" alt="" width={20} height={20} className="size-5" />
          GötürBeni
        </div>
        <p className="text-muted-foreground text-sm">{t("tagline")}</p>
        <nav className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link href="/rota" className="text-muted-foreground hover:text-foreground">
            {tNav("routes")}
          </Link>
          <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground">
            {tNav("howItWorks")}
          </Link>
          <Link href="/support" className="text-muted-foreground hover:text-foreground">
            {tNav("support")}
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            {t("privacyLink")}
          </Link>
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">
            {t("termsLink")}
          </Link>
          <Link href="/kvkk" className="text-muted-foreground hover:text-foreground">
            {t("kvkkLink")}
          </Link>
        </nav>
        <p className="text-muted-foreground text-sm">
          © {year} GötürBeni — {t("rights")}
        </p>
      </div>
      <div className="border-border/70 flex flex-col items-center gap-3 border-t px-4 py-3 text-center">
        <p className="text-muted-foreground mx-auto max-w-3xl text-xs">{t("paymentDisclaimer")}</p>
        <div className="flex items-center gap-4">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("socialAriaLabel", { platform: link.name })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {SOCIAL_ICONS[link.name]}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
