import { getTranslations } from "next-intl/server"
import { UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ShareRideButton } from "@/features/rides/ShareRideButton"
import { getReferralCount } from "@/features/referrals/queries"

// Referral kodu ayrı bir kolon/üretim mantığı gerektirmiyor — her profilin
// zaten benzersiz olan id'sinin (uuid) ilk 8 karakteri kod olarak kullanılıyor
// (bkz. 0080_referrals.sql'in handle_new_user'daki eşleştirmesi).
export async function ReferralSection({ userId, siteUrl }: { userId: string; siteUrl: string }) {
  const t = await getTranslations("Referrals")
  const count = await getReferralCount(userId)
  const referralCode = userId.slice(0, 8)
  const link = `${siteUrl}/register?ref=${referralCode}`

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("description")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="bg-muted text-foreground max-w-full truncate rounded-md px-3 py-2 text-sm">{link}</code>
        <ShareRideButton title={t("shareTitle")} url={link} />
      </div>
      {count > 0 && (
        <Badge variant="secondary" className="w-fit gap-1.5">
          <UserPlus className="size-3.5" aria-hidden="true" />
          {t("badge", { count })}
        </Badge>
      )}
    </div>
  )
}
