"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Share, SquarePlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"

const STORAGE_KEY = "ios-install-prompt-dismissed"

// iOS Safari never fires `beforeinstallprompt` (see InstallAppButton.tsx),
// so it's the one platform where that button silently does nothing — this
// gives iOS Safari visitors an explicit "Share -> Add to Home Screen" guide
// instead of no install affordance at all.
function isIosSafariBrowserTab(): boolean {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIos && !isStandalone
}

export function IOSInstallPrompt() {
  const t = useTranslations("Pwa.iosPrompt")
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return
    if (isIosSafariBrowserTab()) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label={t("title")}
      className="bg-card border-border pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 shadow-lg sm:px-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-start gap-3 sm:max-w-md sm:items-center">
        <div className="flex-1 text-sm">
          <p className="font-medium">{t("title")}</p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-1">
            <span>{t("step1")}</span>
            <Share className="inline size-3.5" aria-hidden="true" />
            <span>{t("step2")}</span>
            <SquarePlus className="inline size-3.5" aria-hidden="true" />
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("dismiss")} onClick={dismiss}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
