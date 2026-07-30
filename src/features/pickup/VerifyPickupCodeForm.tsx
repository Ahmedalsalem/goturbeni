"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { verifyPickupCode } from "@/features/pickup/actions"

// Driver-facing: asks the passenger for the 4-digit code shown on their own
// screen (features/pickup/queries.ts::getMyPickupCode) and types it in here.
// verify_pickup_code (0048_pickup_verification_code.sql) does the actual
// comparison server-side — this component never sees the real code.
export function VerifyPickupCodeForm({ bookingId, rideId, alreadyVerified }: { bookingId: string; rideId: string; alreadyVerified: boolean }) {
  const t = useTranslations("Pickup.driver")
  const tSuccess = useTranslations("Pickup.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [code, setCode] = useState("")

  if (alreadyVerified) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t("verified")}
      </Badge>
    )
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await verifyPickupCode(bookingId, rideId, { code })
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("verified"))
        setCode("")
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder={t("codePlaceholder")}
        aria-label={t("codeInputLabel")}
        inputMode="numeric"
        className="w-24"
        disabled={isPending}
      />
      <Button size="sm" variant="outline" onClick={onSubmit} disabled={isPending || code.length !== 4}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
        {t("verify")}
      </Button>
    </div>
  )
}
