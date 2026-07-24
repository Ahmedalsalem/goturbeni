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

import { deleteMessage, editMessage, sendMessage } from "@/features/chat/actions"

describe("chat/actions sendMessage", () => {
  const rpcMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    createClientMock.mockResolvedValue({ from: fromMock, rpc: rpcMock })
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

describe("chat/actions editMessage", () => {
  const rpcMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    verifySessionMock.mockResolvedValue({ id: "sender-1" })
    createClientMock.mockResolvedValue({ from: fromMock, rpc: rpcMock })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("calls edit_message with the trimmed text and succeeds", async () => {
    rpcMock.mockResolvedValue({ error: null })

    const result = await editMessage("ride-1", "message-1", "  edited text  ")

    expect(result).toEqual({ success: true })
    expect(rpcMock).toHaveBeenCalledWith("edit_message", { p_message_id: "message-1", p_new_text: "edited text" })
  })

  it("rejects an empty edit without calling the RPC", async () => {
    const result = await editMessage("ride-1", "message-1", "   ")

    expect(result.error).toBe("Chat.validation.messageRequired")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("maps an edit_window_expired RPC error to editWindowExpired", async () => {
    rpcMock.mockResolvedValue({ error: { message: "edit_window_expired" } })

    const result = await editMessage("ride-1", "message-1", "too late")

    expect(result.error).toBe("Chat.errors.editWindowExpired")
  })

  it("maps any other RPC error to actionFailed", async () => {
    rpcMock.mockResolvedValue({ error: { message: "not_message_sender" } })

    const result = await editMessage("ride-1", "message-1", "not mine")

    expect(result.error).toBe("Chat.errors.actionFailed")
  })
})

describe("chat/actions deleteMessage", () => {
  const rpcMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    verifySessionMock.mockResolvedValue({ id: "sender-1" })
    createClientMock.mockResolvedValue({ from: fromMock, rpc: rpcMock })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("calls soft_delete_message and succeeds", async () => {
    rpcMock.mockResolvedValue({ error: null })

    const result = await deleteMessage("ride-1", "message-1")

    expect(result).toEqual({ success: true })
    expect(rpcMock).toHaveBeenCalledWith("soft_delete_message", { p_message_id: "message-1" })
  })

  it("maps an edit_window_expired RPC error to editWindowExpired", async () => {
    rpcMock.mockResolvedValue({ error: { message: "edit_window_expired" } })

    const result = await deleteMessage("ride-1", "message-1")

    expect(result.error).toBe("Chat.errors.editWindowExpired")
  })

  it("maps any other RPC error to actionFailed", async () => {
    rpcMock.mockResolvedValue({ error: { message: "message_deleted" } })

    const result = await deleteMessage("ride-1", "message-1")

    expect(result.error).toBe("Chat.errors.actionFailed")
  })
})
