import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { ShieldAlert, Users } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AdminPager } from "@/features/admin/AdminPager"
import { SuspendToggleButton } from "@/features/admin/SuspendToggleButton"
import { ResendVerificationButton } from "@/features/admin/ResendVerificationButton"
import { getAdminUsers, getSuspiciousAccounts } from "@/features/admin/queries"
import { verifySession } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.users")
  return { title: t("title") }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const currentUser = await verifySession()
  const t = await getTranslations("Admin.users")
  const tSuspicious = await getTranslations("Admin.suspicious")
  const format = await getFormatter()
  const dateTimeOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } as const
  const resolvedSearchParams = await searchParams
  const page = Math.max(1, Number(resolvedSearchParams.page) || 1)
  const [{ rows: users, hasMore }, suspiciousAccounts] = await Promise.all([
    getAdminUsers(page),
    getSuspiciousAccounts(),
  ])

  return (
    <div>
      <div className="mb-8">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
          <ShieldAlert className="text-destructive size-5" aria-hidden="true" />
          {tSuspicious("title")}
        </h2>
        <p className="text-muted-foreground mb-3 text-sm">{tSuspicious("description")}</p>
        {suspiciousAccounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{tSuspicious("none")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {suspiciousAccounts.map((account, index) => (
              <Card key={`${account.user_id}-${account.reason}-${index}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{account.full_name ?? t("unknownUser")}</p>
                    <p className="text-muted-foreground text-xs">
                      {tSuspicious(`reason.${account.reason}`)} — {account.detail}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.is_suspended && <Badge variant="destructive">{t("suspendedBadge")}</Badge>}
                    {account.user_id !== currentUser.id && (
                      <SuspendToggleButton userId={account.user_id} isSuspended={account.is_suspended} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => {
            const name = user.full_name ?? t("unknownUser")
            const initials = name.slice(0, 2).toUpperCase()

            return (
              <Card key={user.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={user.avatar_url ?? undefined} alt={name} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-muted-foreground text-xs">{user.email ?? "—"}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("registeredAt", { date: format.dateTime(new Date(user.created_at), dateTimeOptions) })}
                        {" · "}
                        {user.last_sign_in_at
                          ? t("lastSignInAt", { date: format.dateTime(new Date(user.last_sign_in_at), dateTimeOptions) })
                          : t("neverSignedIn")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {user.is_admin && <Badge>{t("adminBadge")}</Badge>}
                    {user.is_suspended && <Badge variant="destructive">{t("suspendedBadge")}</Badge>}
                    <Badge variant={user.email_verified ? "success" : "warning"}>
                      {user.email_verified ? t("verificationStatus.verified") : t("verificationStatus.unverified")}
                    </Badge>
                  </div>

                  {user.id === currentUser.id ? (
                    <span className="text-muted-foreground text-xs">{t("thatsYou")}</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {!user.email_verified && <ResendVerificationButton userId={user.id} />}
                      <SuspendToggleButton userId={user.id} isSuspended={user.is_suspended} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      <AdminPager page={page} hasMore={hasMore} currentSearchParams={resolvedSearchParams} />
    </div>
  )
}
