import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { getExperienceLevel } from "@/features/reviews/experienceLevel"

// Purely presentational — derives its own level from the count it's given,
// so every caller that already has a completedRideCount (DriverTrustInfo
// consumers) can drop this in with no new data fetch.
export function ExperienceLevelBadge({ completedRideCount }: { completedRideCount: number }) {
  const t = useTranslations("ExperienceLevel")
  const level = getExperienceLevel(completedRideCount)
  return (
    <Badge variant="outline" className="text-xs">
      {t(level)}
    </Badge>
  )
}
