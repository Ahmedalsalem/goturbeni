import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted lets these mock fns exist before the vi.mock factories below run
// (vi.mock calls are hoisted to the top of the file by vitest).
const { rpcMock, fromMock, createClientMock, verifySessionMock, revalidatePathMock, redirectMock, afterMock, getRideMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  verifySessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
  afterMock: vi.fn(),
  getRideMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}))

vi.mock("@/features/rides/queries", () => ({
  getRide: getRideMock,
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

// createRide defers the new-ride broadcast email into after() (see the same
// pattern already mocked in bookings/actions.test.ts) — after() throws when
// called outside a real Next.js request scope, which this plain-vitest
// environment never provides.
vi.mock("next/server", () => ({
  after: afterMock,
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
    postedByRole: "driver",
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
    largeLuggageOk: false,
    childSeatAvailable: false,
    wheelchairAccessible: false,
    paymentMethods: ["bank_transfer"],
    instantBooking: false,
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
    getRideMock.mockResolvedValue({ posted_by: FAKE_USER.id, status: "active", seat_count: 2, available_seats: 2 })
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
        if (table === "profiles")
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { car_plate: "34 ABC 123", car_color: "Beyaz" } }) }) }),
          }
        return {}
      })

      await createRide(VALID_RIDE_VALUES)

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ driver_id: FAKE_USER.id, posted_by_role: "driver", posted_by: FAKE_USER.id })
      )
    })

    it("creates a passenger listing with null driver_id and no IBAN/plate check", async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: () => ({ single: async () => ({ data: { id: "ride-1" }, error: null }) }),
      })
      // profiles_private/profiles hiç sorgulanmamalı (IBAN/plaka kontrolü atlanıyor) —
      // fromMock'u sadece "rides" için kur, başka bir table sorgulanırsa boş dön.
      fromMock.mockImplementation((table: string) => {
        if (table === "rides") return { insert: insertMock }
        return {}
      })

      await createRide(validRideValues({ postedByRole: "passenger" }))

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          driver_id: null,
          posted_by_role: "passenger",
          posted_by: FAKE_USER.id,
          pets_allowed: false,
          smoking_allowed: false,
        })
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

    it("recomputes available_seats around already-approved bookings instead of overwriting it with seatCount", async () => {
      // 4 total seats, 3 already taken by an approved booking (available_seats=1)
      // — widening the listing back up to 4 should leave those 3 seats taken
      // and free up the difference, not just reset available_seats to 4.
      getRideMock.mockResolvedValue({ posted_by: FAKE_USER.id, status: "active", seat_count: 2, available_seats: 2 - 1 })
      const eqMock = vi.fn().mockReturnThis()
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
      fromMock.mockReturnValue({ update: updateMock })

      await updateRide("ride-1", validRideValues({ seatCount: 4 }))

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ seat_count: 4, available_seats: 3 }))
    })

    it("refuses to shrink seatCount below the number of already-approved passengers", async () => {
      // 4 total seats, 3 already approved (available_seats=1) — dropping to 2
      // would understate the 3 real passengers as only 2 fitting.
      getRideMock.mockResolvedValue({ posted_by: FAKE_USER.id, status: "active", seat_count: 4, available_seats: 1 })
      const updateMock = vi.fn()
      fromMock.mockReturnValue({ update: updateMock })

      const result = await updateRide("ride-1", validRideValues({ seatCount: 2 }))

      expect(result?.error).toBeTruthy()
      expect(updateMock).not.toHaveBeenCalled()
    })
  })
})
