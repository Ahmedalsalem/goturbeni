"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, PauseCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { pauseRideSeries } from "@/features/rides/actions"

export function PauseSeriesButton({ seriesId }: { seriesId: string }) {
  const t = useTranslations("Rides.myRides")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await pauseRideSeries(seriesId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("seriesStopped"))
        router.refresh()
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PauseCircle className="size-4" aria-hidden="true" />}
      {t("stopSeries")}
    </Button>
  )
}
