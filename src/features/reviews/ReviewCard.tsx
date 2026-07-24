"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { Loader2, MoreVertical } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { StarRating } from "@/features/reviews/StarRating"
import { StarRatingInput } from "@/features/reviews/StarRatingInput"
import { deleteReview, updateReview } from "@/features/reviews/actions"
import { MAX_COMMENT_LENGTH } from "@/features/reviews/schemas"
import { isWithinEditWindow } from "@/utils/edit-window"
import type { ReviewWithReviewer } from "@/types/review"

export function ReviewCard({
  review,
  unknownLabel,
  isOwn,
}: {
  review: ReviewWithReviewer
  unknownLabel: string
  isOwn: boolean
}) {
  const format = useFormatter()
  const t = useTranslations("Reviews.form")
  const tActions = useTranslations("Reviews.actions")
  const router = useRouter()
  const [mode, setMode] = useState<"view" | "editing" | "confirmDelete">("view")
  const [rating, setRating] = useState(review.rating)
  const [comment, setComment] = useState(review.comment ?? "")
  const [isPending, startTransition] = useTransition()

  const reviewerName = review.reviewer?.full_name ?? unknownLabel
  const reviewerInitials = reviewerName.slice(0, 2).toUpperCase()
  const isDeleted = review.deleted_at !== null
  // Client-side only — a UX gate to hide the affordance once the window is
  // obviously closed. The edit_review/soft_delete_review RPCs are the real
  // enforcement (see 0013_editable_messages_reviews.sql).
  const canModify = isOwn && !isDeleted && isWithinEditWindow(review.created_at)

  function resetDraft() {
    setRating(review.rating)
    setComment(review.comment ?? "")
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateReview(review.id, review.ride_id, { rating, comment: comment.trim() || undefined })
      if (result?.error) {
        toast.error(result.error)
      } else {
        setMode("view")
        router.refresh()
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteReview(review.id, review.ride_id)
      if (result?.error) {
        toast.error(result.error)
      } else {
        router.refresh()
      }
      setMode("view")
    })
  }

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
        <div className="flex items-center gap-1">
          {mode === "editing" ? (
            <StarRatingInput value={rating} onChange={setRating} label={t("ratingLabel")} />
          ) : (
            <StarRating rating={review.rating} size="sm" />
          )}
          {canModify && mode === "view" && (
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-xs" })} aria-label={tActions("edit")}>
                <MoreVertical className="size-3.5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMode("editing")}>{tActions("edit")}</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setMode("confirmDelete")}>
                  {tActions("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isDeleted ? (
        <p className="text-muted-foreground text-sm italic">{tActions("deletedPlaceholder")}</p>
      ) : mode === "editing" ? (
        <div className="flex flex-col gap-2">
          <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={MAX_COMMENT_LENGTH} rows={2} />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                resetDraft()
                setMode("view")
              }}
              disabled={isPending}
            >
              {tActions("cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : tActions("save")}
            </Button>
          </div>
        </div>
      ) : (
        review.comment && <p className="text-muted-foreground text-sm">{review.comment}</p>
      )}

      {mode === "confirmDelete" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{tActions("confirmDelete")}</span>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={isPending}>
            {tActions("cancel")}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : tActions("delete")}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <p className="text-muted-foreground text-xs">
          {format.dateTime(new Date(review.created_at), { day: "2-digit", month: "2-digit", year: "numeric" })}
        </p>
        {review.edited_at && !isDeleted && <span className="text-muted-foreground text-xs">{tActions("edited")}</span>}
      </div>
    </div>
  )
}
