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

import { verifyPickupCode } from "@/features/pickup/actions"

const FAKE_USER = { id: "driver-1" }

describe("pickup/actions", () => {
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

  it("rejects a code that isn't exactly 4 digits", async () => {
    const result = await verifyPickupCode("booking-1", "ride-1", { code: "12" } as never)
    expect(result.error).toBeTruthy()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("calls verify_pickup_code with the booking id and code", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    const result = await verifyPickupCode("booking-1", "ride-1", { code: "1234" })
    expect(result.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith("verify_pickup_code", { p_booking_id: "booking-1", p_code: "1234" })
  })

  it("surfaces a friendly error for a wrong code", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "invalid_code" } })
    const result = await verifyPickupCode("booking-1", "ride-1", { code: "0000" })
    expect(result.error).toBe("Pickup.errors.invalidCode")
  })

  it("surfaces a friendly error when already verified", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "already_verified" } })
    const result = await verifyPickupCode("booking-1", "ride-1", { code: "1234" })
    expect(result.error).toBe("Pickup.errors.alreadyVerified")
  })

  it("stops after 5 attempts on the same booking within the rate-limit window", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "invalid_code" } })
    for (let i = 0; i < 5; i++) {
      await verifyPickupCode("booking-rate-limit", "ride-1", { code: "0000" })
    }
    const result = await verifyPickupCode("booking-rate-limit", "ride-1", { code: "0000" })
    expect(result.error).toBe("Pickup.errors.tooManyRequests")
  })
})
