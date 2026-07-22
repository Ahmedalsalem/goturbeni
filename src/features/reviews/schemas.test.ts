import { describe, expect, it } from "vitest"

import { buildReviewSchema, MAX_COMMENT_LENGTH, MAX_RATING, MIN_RATING } from "@/features/reviews/schemas"

const t = ((key: string) => key) as Parameters<typeof buildReviewSchema>[0]

describe("buildReviewSchema", () => {
  const schema = buildReviewSchema(t)

  it("accepts ratings within bounds", () => {
    expect(schema.safeParse({ rating: MIN_RATING }).success).toBe(true)
    expect(schema.safeParse({ rating: MAX_RATING }).success).toBe(true)
    expect(schema.safeParse({ rating: 3 }).success).toBe(true)
  })

  it("rejects a rating below the minimum", () => {
    expect(schema.safeParse({ rating: MIN_RATING - 1 }).success).toBe(false)
  })

  it("rejects a rating above the maximum", () => {
    expect(schema.safeParse({ rating: MAX_RATING + 1 }).success).toBe(false)
  })

  it("accepts a review without a comment", () => {
    const result = schema.safeParse({ rating: 4 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comment).toBeUndefined()
    }
  })

  it("rejects a comment longer than the max length", () => {
    expect(schema.safeParse({ rating: 4, comment: "a".repeat(MAX_COMMENT_LENGTH + 1) }).success).toBe(false)
  })

  it("transforms a blank comment to undefined", () => {
    const result = schema.safeParse({ rating: 4, comment: "   " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.comment).toBeUndefined()
    }
  })
})
