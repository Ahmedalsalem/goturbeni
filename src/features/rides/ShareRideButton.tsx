"use client"

import { useEffect, useState } from "react"
import { Share2, MessageCircle, Link as LinkIcon, Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Native paylaşım sayfası (Web Share API) mobilde WhatsApp/Instagram/Mesajlar
// dahil cihazdaki her uygulamayı listeler — Instagram'ın kendi bir "paylaş
// linki" API'si olmadığından, bu, gerçekten Instagram'a paylaşabilmenin tek
// pratik yolu. Desteklemeyen tarayıcılarda (çoğunlukla masaüstü Firefox)
// açık WhatsApp linki + "bağlantıyı kopyala" menüsüne düşer.
//
// navigator.share desteği yalnızca mount sonrası (useEffect) okunuyor —
// sunucu render'ında `navigator` hiç yok, doğrudan render sırasında
// okumak sunucu/istemci HTML'i uyuşmayınca hydration hatası verirdi.
export function ShareRideButton({ title, url }: { title: string; url: string }) {
  const t = useTranslations("Rides.share")
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  async function onShareClick() {
    try {
      await navigator.share({ title, url })
    } catch {
      // Kullanıcı paylaşım sayfasını iptal etti — sessizce yok say.
    }
  }

  function onShareWhatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank", "noopener,noreferrer")
  }

  async function onCopyLink() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success(t("linkCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  if (canNativeShare) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onShareClick} className="gap-1.5">
        <Share2 className="size-4" aria-hidden="true" />
        {t("share")}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
        <Share2 className="size-4" aria-hidden="true" />
        {t("share")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onShareWhatsapp}>
          <MessageCircle className="size-4" aria-hidden="true" />
          {t("shareWhatsapp")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyLink}>
          {copied ? <Check className="size-4" aria-hidden="true" /> : <LinkIcon className="size-4" aria-hidden="true" />}
          {t("copyLink")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
