import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { fromMock, createClientMock, verifySessionMock, revalidatePathMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  verifySessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}))

vi.mock("@/lib/supabase/dal", () => ({
  verifySession: verifySessionMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
  }),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => `${namespace}.${key}`,
}))

import { sendMessage } from "@/features/chat/actions"

describe("chat/actions sendMessage", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    createClientMock.mockResolvedValue({ from: fromMock })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("inserts into the messages table on a normal call", async () => {
    verifySessionMock.mockResolvedValue({ id: "sender-normal" })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ insert: insertMock })

    const result = await sendMessage("ride-1", "receiver-1", { message: "hello there" })

    expect(result).toEqual({ success: true })
    expect(fromMock).toHaveBeenCalledWith("messages")
    expect(insertMock).toHaveBeenCalledWith({
      ride_id: "ride-1",
      sender_id: "sender-normal",
      receiver_id: "receiver-1",
      message: "hello there",
    })
  })

  it("rejects with tooManyRequests once the rate limit is exceeded for the same user", async () => {
    // Unique sender id so this test's rate-limit bucket (module-level state
    // in src/lib/rate-limit.ts) doesn't interact with the other tests here.
    verifySessionMock.mockResolvedValue({ id: "sender-rate-limited" })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ insert: insertMock })

    // SEND_MESSAGE_RATE_LIMIT is 30 per 10 minutes — send 30 successful
    // messages to exhaust the window, then the 31st must be rejected.
    for (let i = 0; i < 30; i++) {
      const result = await sendMessage("ride-1", "receiver-1", { message: `msg ${i}` })
      expect(result.error).toBeUndefined()
    }

    const result = await sendMessage("ride-1", "receiver-1", { message: "one too many" })

    expect(result.error).toBe("Chat.errors.tooManyRequests")
  })

  it("maps an insert error to sendFailed", async () => {
    verifySessionMock.mockResolvedValue({ id: "sender-failed-insert" })
    const insertMock = vi.fn().mockResolvedValue({ error: { message: "db down" } })
    fromMock.mockReturnValue({ insert: insertMock })

    const result = await sendMessage("ride-1", "receiver-1", { message: "hello" })

    expect(result.error).toBe("Chat.errors.sendFailed")
  })
})
