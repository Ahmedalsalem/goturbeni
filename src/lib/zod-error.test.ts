import { describe, expect, it } from "vitest"
import { z } from "zod"

import { firstIssueMessage } from "@/lib/zod-error"

describe("firstIssueMessage", () => {
  it("returns the first issue's message when validation fails", () => {
    const schema = z.object({
      email: z.string().email("invalid email"),
      age: z.number().min(18, "too young"),
    })
    const result = schema.safeParse({ email: "not-an-email", age: 10 })
    expect(result.success).toBe(false)

    if (result.success) throw new Error("expected validation failure")
    expect(firstIssueMessage(result.error, "fallback")).toBe("invalid email")
  })

  it("returns the fallback when there are no issues", () => {
    expect(firstIssueMessage({ issues: [] }, "fallback")).toBe("fallback")
  })
})
