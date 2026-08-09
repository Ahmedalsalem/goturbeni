import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted lets these mock fns exist before the vi.mock factories below run
// (vi.mock calls are hoisted to the top of the file by vitest).
const { rpcMock, fromMock, createClientMock, verifySessionMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  verifySessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}))

vi.mock("@/lib/supabase/dal", () => ({
  verifySession: verifySessionMock,
  requireVerifiedProfile: verifySessionMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

// createRide/updateRide call redirect() on success — Next.js's real
// redirect() throws a framework-specific digest error that's unreliable to
// catch in a test environment, so it's mocked directly to a no-op instead.
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
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

import { createRide, updateRide } from "@/features/rides/actions"
import type { RideFormValues } from "@/features/rides/schemas"

const FAKE_USER = { id: "user-1" }

function futureDateTimeParts(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  const departureDate = date.toISOString().slice(0, 10)
  const departureTime = date.toISOString().slice(11, 16)
  return { departureDate, departureTime }
}

function validRideValues(overrides: Partial<RideFormValues> = {}): RideFormValues {
  const { departureDate, departureTime } = futureDateTimeParts(24)
  return {
    departureCity: "Ankara",
    arrivalCity: "İstanbul",
    departureDistrict: undefined,
    arrivalDistrict: undefined,
    departureDate,
    departureTime,
    seatCount: 2,
    costShare: 100,
    description: undefined,
    petsAllowed: false,
    smokingAllowed: false,
    vipSolo: false,
    repeatWeekly: false,
    ...overrides,
  }
}

const VALID_RIDE_VALUES = validRideValues()

describe("rides/actions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    verifySessionMock.mockResolvedValue(FAKE_USER)
    createClientMock.mockResolvedValue({ rpc: rpcMock, from: fromMock })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  describe("createRide", () => {
    it("inserts posted_by_role and posted_by alongside driver_id", async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: () => ({ single: async () => ({ data: { id: "ride-1" }, error: null }) }),
      })
      fromMock.mockImplementation((table: string) => {
        if (table === "rides") return { insert: insertMock }
        if (table === "profiles_private") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { iban: "TR1", iban_holder_name: "Ad" } }) }) }) }
        if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { car_plate: "34 ABC 123" } }) }) }) }
        return {}
      })

      await createRide(VALID_RIDE_VALUES)

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ driver_id: FAKE_USER.id, posted_by_role: "driver", posted_by: FAKE_USER.id })
      )
    })
  })

  describe("updateRide", () => {
    it("filters update by posted_by, not driver_id", async () => {
      const eqMock = vi.fn().mockReturnThis()
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      eqMock.mockReturnValue({ eq: eqMock }) // zincirlenen üç .eq() çağrısı için
      fromMock.mockReturnValue({ update: updateMock })

      await updateRide("ride-1", VALID_RIDE_VALUES)

      expect(eqMock).toHaveBeenCalledWith("posted_by", FAKE_USER.id)
    })
  })
})
