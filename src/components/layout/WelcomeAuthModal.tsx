"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import { Dialog, DialogPopup, DialogCloseIcon, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const STORAGE_KEY = "welcome-auth-modal-seen"

// Base UI's Dialog is modal by default (backdrop blocks pointer events on
// everything behind it) — showing this on the auth pages themselves would
// trap a first-time visitor who lands directly on /register or /login
// behind an unrelated "please register or log in" prompt, unable to reach
// the very form it's telling them to use. Caught by e2e/new-features.spec.ts
// and e2e/booking-chat-review.spec.ts both hanging on the #gender select.
const SKIP_PATH_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/verify-phone", "/auth"]

// Shown once per device to logged-out visitors, on whichever page they land
// on first — not once per session, so returning visitors aren't nagged again.
export function WelcomeAuthModal({ isGuest }: { isGuest: boolean }) {
  const t = useTranslations("WelcomeModal")
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const skip = SKIP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  useEffect(() => {
    if (!isGuest || skip) return
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return
    window.localStorage.setItem(STORAGE_KEY, "1")
    setOpen(true)
  }, [isGuest, skip])

  if (!isGuest || skip) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup>
        <DialogCloseIcon />
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/register" className={buttonVariants({ className: "flex-1" })} onClick={() => setOpen(false)}>
            {t("register")}
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "outline", className: "flex-1" })} onClick={() => setOpen(false)}>
            {t("login")}
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground mt-4 w-full text-center text-sm"
        >
          {t("dismiss")}
        </button>
      </DialogPopup>
    </Dialog>
  )
}
