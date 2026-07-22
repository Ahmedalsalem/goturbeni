import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { CalendarCheck, CarFront, ChevronDown, LogOut, Menu, User } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { getCurrentUser } from "@/lib/supabase/dal"
import { signOut } from "@/features/auth/actions"
import { getUnreadMessages } from "@/features/chat/queries"

export async function Header() {
  const t = await getTranslations("Nav")
  const user = await getCurrentUser()
  const hasUnreadMessages = user ? (await getUnreadMessages(user.id)).count > 0 : false

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
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl shadow-sm shadow-primary/30">
            <CarFront className="size-4.5" aria-hidden="true" />
          </span>
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
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon", className: "md:hidden" })} aria-label={t("menu")}>
              <Menu />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {links.map((link) => (
                <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
                  {link.label}
                </DropdownMenuItem>
              ))}
              {/* Auth actions collapse into this mobile menu too — the
                  standalone login/register links below are hidden below sm
                  purely to stop the header overflowing on narrow screens. */}
              {!user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href="/login" />}>{t("login")}</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/register" />}>{t("register")}</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={buttonVariants({ variant: "outline", className: "relative gap-1.5 ps-3 pe-2.5" })}
                aria-label={t("profile")}
              >
                <User className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("profile")}</span>
                <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
                {hasUnreadMessages && (
                  <>
                    <span className="bg-destructive ring-background absolute end-0.5 top-0.5 size-2.5 rounded-full ring-2" aria-hidden="true" />
                    <span className="sr-only">{t("unreadMessages")}</span>
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <User /> {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/rides/mine" />}>
                  <CarFront /> {t("myRides")}
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/bookings" />}>
                  <CalendarCheck /> {t("bookings")}
                </DropdownMenuItem>
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
          ) : (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                {t("login")}
              </Link>
              <Link href="/register" className={buttonVariants()}>
                {t("register")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
