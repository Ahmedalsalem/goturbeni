import Link from "next/link"
import Image from "next/image"
import { getTranslations } from "next-intl/server"
import { CalendarCheck, CarFront, ChevronDown, LogOut, MoreHorizontal, ShieldCheck, User } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InstallAppButton } from "@/components/layout/InstallAppButton"
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher"
import { getCurrentUser } from "@/lib/supabase/dal"
import { signOut } from "@/features/auth/actions"
import { checkIsAdmin } from "@/features/admin/queries"
import { getUnreadMessages } from "@/features/chat/queries"
import { getUnreadNavBadges } from "@/features/notifications/queries"
import { PushNotificationToggle } from "@/features/push/PushNotificationToggle"

export async function Header() {
  const t = await getTranslations("Nav")
  const user = await getCurrentUser()
  // getUnreadMessages runs first (not in the same Promise.all as the other
  // two) — getUnreadNavBadges needs its rideIds to fold unread chat messages
  // into the "İlanlarım"/"Rezervasyonlarım" dots themselves, see there.
  const unreadMessages = user ? await getUnreadMessages(user.id) : null
  const [isAdmin, navBadges] = user
    ? await Promise.all([checkIsAdmin(user.id), getUnreadNavBadges(user.id, unreadMessages!.rideIds)])
    : [false, { myRides: false, myBookings: false }]
  const hasUnreadMessages = unreadMessages ? unreadMessages.count > 0 : false
  // The trigger's own dot must reflect EVERYTHING inside the menu — otherwise
  // a booking-related notification (navBadges) lights up "Rezervasyonlarım"
  // once the menu is opened, but gives no visible reason to open it in the
  // first place.
  const hasAnyUnread = hasUnreadMessages || navBadges.myRides || navBadges.myBookings

  const links = [
    { href: "/rides", label: t("rides") },
    { href: "/create-ride", label: t("createRide") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/support", label: t("support") },
  ]

  return (
    <header className="border-border/70 bg-background/75 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Image src="/brand/logo-mark.png" alt="" width={32} height={32} priority className="size-8" />
          GötürBeni
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={buttonVariants({ variant: "ghost", className: "text-muted-foreground hover:text-foreground font-normal" })}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <InstallAppButton />
          {user && <PushNotificationToggle />}
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={buttonVariants({ variant: "outline", className: "relative gap-1.5 ps-3 pe-2.5" })}
                  aria-label={t("profile")}
                >
                  <User className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("profile")}</span>
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
                  {hasAnyUnread && (
                    <>
                      <span className="bg-destructive ring-background absolute end-0.5 top-0.5 size-2.5 rounded-full ring-2" aria-hidden="true" />
                      <span className="sr-only">{t("unreadNotifications")}</span>
                    </>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem render={<Link href="/profile" />}>
                    <User /> {t("profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/rides/mine" />}>
                    <CarFront /> {t("myRides")}
                    {navBadges.myRides && (
                      <>
                        <span className="bg-destructive ms-auto size-2 rounded-full" aria-hidden="true" />
                        <span className="sr-only">{t("unreadNotifications")}</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/bookings" />}>
                    <CalendarCheck /> {t("bookings")}
                    {navBadges.myBookings && (
                      <>
                        <span className="bg-destructive ms-auto size-2 rounded-full" aria-hidden="true" />
                        <span className="sr-only">{t("unreadNotifications")}</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem render={<Link href="/admin" />}>
                      <ShieldCheck /> {t("admin")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden [&_svg]:size-4 [&_svg]:text-destructive"
                    >
                      <LogOut /> {t("logout")}
                    </button>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile-only nav trigger, last (rightmost) icon in the header
                  — the desktop bar above already shows these links, so this
                  only renders under md. Kept separate from the profile menu
                  so both are reachable at a glance on mobile. */}
              <DropdownMenu>
                <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon", className: "md:hidden" })} aria-label={t("menu")}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {links.map((link) => (
                    <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
                      {link.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            // No mobile menu trigger here on purpose — a guest's header only
            // needs to get them to login/register. The 4 nav links (visible
            // in the desktop bar above, md:flex) are reachable on mobile via
            // the homepage's own CTAs and the Footer (which now also carries
            // "Nasıl Çalışır"/"Destek", the two that had no other entry
            // point) — see Footer.tsx. "Giriş Yap"/"Kayıt Ol" are both
            // visible at every width so there's always a way to register
            // even without the old fallback menu item (and /login itself
            // has a "Hesabınız yok mu?" cross-link either way).
            <div className="flex items-center gap-1.5">
              <Link href="/login" className={buttonVariants({ variant: "ghost", className: "px-2.5 sm:px-4" })}>
                {t("login")}
              </Link>
              <Link href="/register" className={buttonVariants({ className: "px-2.5 sm:px-4" })}>
                {t("register")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
