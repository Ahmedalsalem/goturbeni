import { describe, expect, it } from "vitest"

import { buildMessageSchema, MAX_MESSAGE_LENGTH } from "@/features/chat/schemas"

const t = ((key: string) => key) as Parameters<typeof buildMessageSchema>[0]

describe("buildMessageSchema", () => {
  const schema = buildMessageSchema(t)

  it("accepts a non-empty message", () => {
    expect(schema.safeParse({ message: "hello" }).success).toBe(true)
  })

  it("rejects an empty message", () => {
    expect(schema.safeParse({ message: "" }).success).toBe(false)
  })

  it("rejects a message that is only whitespace", () => {
    expect(schema.safeParse({ message: "   " }).success).toBe(false)
  })

  it("accepts a message at the max length", () => {
    expect(schema.safeParse({ message: "a".repeat(MAX_MESSAGE_LENGTH) }).success).toBe(true)
  })

  it("rejects a message beyond the max length", () => {
    expect(schema.safeParse({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) }).success).toBe(false)
  })
})
