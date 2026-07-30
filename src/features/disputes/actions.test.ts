import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { rpcMock, createClientMock, verifySessionMock, revalidatePathMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
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

import { adminSetDisputeStatus, openDispute } from "@/features/disputes/actions"

const FAKE_USER = { id: "user-1" }

describe("disputes/actions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    verifySessionMock.mockResolvedValue(FAKE_USER)
    createClientMock.mockResolvedValue({ rpc: rpcMock })
    rpcMock.mockReset()
    revalidatePathMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("openDispute", () => {
    it("rejects a description shorter than the minimum", async () => {
      const result = await openDispute("booking-1", { reason: "other", description: "too short" })
      expect(result.error).toBeTruthy()
      expect(rpcMock).not.toHaveBeenCalled()
    })

    it("calls open_dispute with the booking id, reason, and description", async () => {
      rpcMock.mockResolvedValue({ data: "dispute-1", error: null })
      const result = await openDispute("booking-1", { reason: "payment_not_received", description: "Ödemeyi gönderdim ama onaylanmadı." })
      expect(result.success).toBe(true)
      expect(rpcMock).toHaveBeenCalledWith("open_dispute", {
        p_booking_id: "booking-1",
        p_reason: "payment_not_received",
        p_description: "Ödemeyi gönderdim ama onaylanmadı.",
      })
    })

    it("surfaces a friendly error when a dispute is already open", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: "dispute_already_open" } })
      const result = await openDispute("booking-1", { reason: "other", description: "Ödemeyi gönderdim ama onaylanmadı." })
      expect(result.error).toBe("Disputes.errors.alreadyOpen")
    })

    it("surfaces a friendly error when the caller isn't a party to the booking", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: "not_authorized" } })
      const result = await openDispute("booking-1", { reason: "other", description: "Ödemeyi gönderdim ama onaylanmadı." })
      expect(result.error).toBe("Disputes.errors.notAuthorized")
    })
  })

  describe("adminSetDisputeStatus", () => {
    it("calls admin_set_dispute_status with the dispute id, status, and note", async () => {
      rpcMock.mockResolvedValue({ data: null, error: null })
      const result = await adminSetDisputeStatus("dispute-1", "resolved", "İade yapıldı.")
      expect(result.success).toBe(true)
      expect(rpcMock).toHaveBeenCalledWith("admin_set_dispute_status", {
        p_dispute_id: "dispute-1",
        p_status: "resolved",
        p_resolution_note: "İade yapıldı.",
      })
    })

    it("surfaces a friendly error for a non-admin caller", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: "not_admin" } })
      const result = await adminSetDisputeStatus("dispute-1", "resolved")
      expect(result.error).toBe("Disputes.errors.notAdmin")
    })
  })
})
