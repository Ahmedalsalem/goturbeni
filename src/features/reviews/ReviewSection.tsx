import { getTranslations } from "next-intl/server"
import { MessageSquare } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { ReviewCard } from "@/features/reviews/ReviewCard"
import { StarRating } from "@/features/reviews/StarRating"
import { getReviewsForUser, getReviewStats } from "@/features/reviews/queries"

// Shared between /profile ("Yorumlar", full list) and /rides/[id] ("Son
// yorumlar", limited list) — see Faz 6 spec.
export async function ReviewSection({ userId, limit, hideStats }: { userId: string; limit?: number; hideStats?: boolean }) {
  const t = await getTranslations("Reviews")
  const [stats, reviews] = await Promise.all([getReviewStats(userId), getReviewsForUser(userId, limit)])

  return (
    <div className="flex flex-col gap-4">
      {!hideStats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {stats.averageRating !== null && (
            <div className="flex items-center gap-2">
              <StarRating rating={stats.averageRating} />
              <span className="text-sm font-medium">{stats.averageRating.toFixed(1)}</span>
            </div>
          )}
          <span className="text-muted-foreground text-sm">{t("totalReviews", { count: stats.reviewCount })}</span>
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} unknownLabel={t("unknownReviewer")} />
          ))}
        </div>
      )}
    </div>
  )
}
