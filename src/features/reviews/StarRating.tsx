import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

// Read-only display — see StarRatingInput for the interactive form control.
export function StarRating({ rating, size = "default" }: { rating: number; size?: "default" | "sm" }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            size === "sm" ? "size-3.5" : "size-4",
            value <= Math.round(rating) ? "fill-warning text-warning" : "text-muted-foreground/30"
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
