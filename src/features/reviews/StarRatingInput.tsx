"use client"

import { useState } from "react"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"
import { MAX_RATING } from "@/features/reviews/schemas"

export function StarRatingInput({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const displayValue = hovered ?? value

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-pressed={value === star}
          aria-label={`${star} / ${MAX_RATING}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className="cursor-pointer p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-md"
        >
          <Star
            className={cn("size-6 transition-colors", star <= displayValue ? "fill-warning text-warning" : "text-muted-foreground/30")}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}
