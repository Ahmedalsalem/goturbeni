import Link from "next/link"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"

// Server-rendered prev/next pager for the admin list pages — plain ?<param>=N
// links, no client state. paramName + currentSearchParams let /admin/payments
// run two independent pagers on one URL (settlementsPage/refundsPage): each
// link preserves the OTHER pager's current param instead of dropping it.
export function AdminPager({
  page,
  hasMore,
  paramName = "page",
  currentSearchParams = {},
}: {
  page: number
  hasMore: boolean
  paramName?: string
  currentSearchParams?: Record<string, string | string[] | undefined>
}) {
  const t = useTranslations("Admin.pager")

  if (page === 1 && !hasMore) {
    return null
  }

  function hrefFor(targetPage: number): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(currentSearchParams)) {
      if (key !== paramName && typeof value === "string") {
        params.set(key, value)
      }
    }
    params.set(paramName, String(targetPage))
    return `?${params.toString()}`
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-xs">{t("pageLabel", { page })}</span>
      {hasMore ? (
        <Link href={hrefFor(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
