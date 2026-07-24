"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { logError } from "@/lib/logger"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function InstallAppButton() {
  const t = useTranslations("Pwa")
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    function onAppInstalled() {
      setInstallEvent(null)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [])

  async function onInstall() {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      await installEvent.userChoice
    } catch (error) {
      logError(error, "pwa.install")
    } finally {
      setInstallEvent(null)
    }
  }

  if (!installEvent) return null

  return (
    <Button variant="ghost" size="icon" aria-label={t("install")} onClick={onInstall}>
      <Download className="size-4" aria-hidden="true" />
    </Button>
  )
}
