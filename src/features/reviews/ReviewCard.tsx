import { getFormatter } from "next-intl/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StarRating } from "@/features/reviews/StarRating"
import type { ReviewWithReviewer } from "@/types/review"

export async function ReviewCard({ review, unknownLabel }: { review: ReviewWithReviewer; unknownLabel: string }) {
  const format = await getFormatter()
  const reviewerName = review.reviewer?.full_name ?? unknownLabel
  const reviewerInitials = reviewerName.slice(0, 2).toUpperCase()

  return (
    <div className="border-border/70 flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarImage src={review.reviewer?.avatar_url ?? undefined} alt={reviewerName} />
            <AvatarFallback className="text-xs">{reviewerInitials}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{reviewerName}</span>
        </div>
        <StarRating rating={review.rating} size="sm" />
      </div>
      {review.comment && <p className="text-muted-foreground text-sm">{review.comment}</p>}
      <p className="text-muted-foreground text-xs">
        {format.dateTime(new Date(review.created_at), { day: "2-digit", month: "2-digit", year: "numeric" })}
      </p>
    </div>
  )
}
