"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Languages } from "lucide-react"

import { setUserLocale } from "@/i18n/locale"
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locale-config"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_LABELS: Record<AppLocale, string> = {
  tr: "Türkçe",
  ar: "العربية",
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations("LocaleSwitcher")
  const router = useRouter()
  const [, startTransition] = useTransition()

  function onSelect(next: AppLocale) {
    startTransition(() => {
      setUserLocale(next).then(() => router.refresh())
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("label")}>
        <Languages />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((value) => (
          <DropdownMenuItem key={value} onClick={() => onSelect(value)} aria-current={value === locale}>
            {LOCALE_LABELS[value]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
