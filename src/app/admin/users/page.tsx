import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { ShieldAlert, Users } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SuspendToggleButton } from "@/features/admin/SuspendToggleButton"
import { getAdminUsers, getSuspiciousAccounts } from "@/features/admin/queries"
import { verifySession } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.users")
  return { title: t("title") }
}

export default async function AdminUsersPage() {
  const currentUser = await verifySession()
  const t = await getTranslations("Admin.users")
  const tSuspicious = await getTranslations("Admin.suspicious")
  const format = await getFormatter()
  const [users, suspiciousAccounts] = await Promise.all([getAdminUsers(), getSuspiciousAccounts()])

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
                    {account.user_id !== currentUser.id && <SuspendToggleButton userId={account.user_id} isSuspended={account.is_suspended} />}
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
                      <p className="text-muted-foreground text-xs">{format.dateTime(new Date(user.created_at), { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={user.verification_status === "verified" ? "success" : "secondary"}>
                      {t(`verificationStatus.${user.verification_status}`)}
                    </Badge>
                    <Badge variant={user.phone_verified === null ? "outline" : user.phone_verified ? "success" : "secondary"}>
                      {user.phone_verified === null ? t("phoneUnknown") : user.phone_verified ? t("phoneVerified") : t("phoneUnverified")}
                    </Badge>
                    {user.is_admin && <Badge>{t("adminBadge")}</Badge>}
                    {user.is_suspended && <Badge variant="destructive">{t("suspendedBadge")}</Badge>}
                  </div>

                  {user.id === currentUser.id ? (
                    <span className="text-muted-foreground text-xs">{t("thatsYou")}</span>
                  ) : (
                    <SuspendToggleButton userId={user.id} isSuspended={user.is_suspended} />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
