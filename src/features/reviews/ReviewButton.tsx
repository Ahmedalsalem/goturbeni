"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { MessageSquarePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ReviewForm } from "@/features/reviews/ReviewForm"

// Shown on a completed booking row (see /bookings and /rides/[id]/bookings)
// once the ride has departed and the current user hasn't reviewed the other
// party yet.
export function ReviewButton({ rideId, revieweeId }: { rideId: string; revieweeId: string }) {
  const t = useTranslations("Reviews.actions")
  const [open, setOpen] = useState(false)

  if (open) {
    return <ReviewForm rideId={rideId} revieweeId={revieweeId} />
  }

  return (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
      <MessageSquarePlus className="size-4" aria-hidden="true" />
      {t("leaveReview")}
    </Button>
  )
}
