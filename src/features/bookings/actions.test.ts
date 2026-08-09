import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Ride } from "@/types/ride"

// vi.hoisted lets these mock fns exist before the vi.mock factories below run
// (vi.mock calls are hoisted to the top of the file by vitest).
const { rpcMock, fromMock, createClientMock, verifySessionMock, getRideMock, revalidatePathMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  verifySessionMock: vi.fn(),
  getRideMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}))

vi.mock("@/lib/supabase/dal", () => ({
  verifySession: verifySessionMock,
  requireVerifiedProfile: verifySessionMock,
}))

vi.mock("@/features/rides/queries", () => ({
  getRide: getRideMock,
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

import { approveBooking, cancelBooking, confirmRemainingPayment, createBooking, createOffer, rejectBooking, reportNoShow } from "@/features/bookings/actions"

const FAKE_USER = { id: "user-1" }

// Matches the .select("passenger_id").eq("id", ...).single() chain used by
// getBookingPassengerId (called after a successful approve/reject RPC to
// find out who to push-notify) — and, since approveBooking also always calls
// getBookingRideId first now, includes ride_id too (default "ride-1" matches
// the rideId most tests in this file pass to approveBooking) so that lookup
// doesn't silently resolve to null and skip the IBAN/plate check for the
// wrong reason.
function fromReturningPassengerId(passengerId: string | null, rideId = "ride-1") {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: passengerId ? { passenger_id: passengerId, ride_id: rideId } : null }),
      }),
    }),
  }
}

function fakeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: "ride-1",
    driver_id: "driver-1",
    posted_by_role: "driver",
    posted_by: "driver-1",
    departure_city: "Ankara",
    arrival_city: "İstanbul",
    departure_district: null,
    arrival_district: null,
    departure_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    seat_count: 4,
    available_seats: 3,
    cost_share: 100,
    description: null,
    pets_allowed: false,
    smoking_allowed: false,
    vip_solo: false,
    status: "active",
    series_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe("bookings/actions", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key")
    verifySessionMock.mockResolvedValue(FAKE_USER)
    createClientMock.mockResolvedValue({ rpc: rpcMock, from: fromMock })
    // Default: any unmocked .from(...).select(...).eq(...).single()/maybeSingle()
    // chain (e.g. approveBooking's unconditional getBookingRideId lookup)
    // resolves to no row, rather than throwing on an unconfigured mock.
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  describe("createBooking", () => {
    it("rejects when the ride is not active", async () => {
      getRideMock.mockResolvedValue(fakeRide({ status: "full" }))

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.rideNotActive")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("rejects booking your own ride", async () => {
      getRideMock.mockResolvedValue(fakeRide({ driver_id: FAKE_USER.id }))

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.ownRide")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("rejects when requested seats exceed available seats", async () => {
      getRideMock.mockResolvedValue(fakeRide({ available_seats: 2 }))

      const result = await createBooking("ride-1", { seatCount: 3 })

      expect(result.error).toBe("Bookings.errors.notEnoughSeats")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("maps a 23505 unique-violation to the already-booked error", async () => {
      getRideMock.mockResolvedValue(fakeRide())
      const insertMock = vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } })
      fromMock.mockReturnValue({ insert: insertMock })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.alreadyBooked")
      expect(fromMock).toHaveBeenCalledWith("bookings")
      expect(insertMock).toHaveBeenCalledWith({
        ride_id: "ride-1",
        passenger_id: FAKE_USER.id,
        seat_count: 1,
      })
    })

    it("maps any other insert error to createFailed", async () => {
      getRideMock.mockResolvedValue(fakeRide())
      const insertMock = vi.fn().mockResolvedValue({ error: { code: "500", message: "db down" } })
      fromMock.mockReturnValue({ insert: insertMock })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.createFailed")
    })

    it("succeeds and revalidates the ride path when the insert succeeds", async () => {
      getRideMock.mockResolvedValue(fakeRide())
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      fromMock.mockReturnValue({ insert: insertMock })
      // recordNotificationEvent (src/lib/notifications.ts) calls supabase.rpc
      // unconditionally (unlike push/email, it has no third-party "configured"
      // gate to no-op through) — needs a resolved rpc call like the
      // approve/reject/cancel tests below already set up.
      rpcMock.mockResolvedValue({ error: null })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1")
    })

    it("rejects when the ride has no driver_id yet (passenger-posted ride awaiting an offer)", async () => {
      getRideMock.mockResolvedValue(fakeRide({ driver_id: null }))

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.createFailed")
      expect(fromMock).not.toHaveBeenCalled()
    })
  })

  describe("createOffer", () => {
    it("rejects when the ride is not a passenger listing", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.notPassengerListing")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("rejects offering on your own passenger listing", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", posted_by: FAKE_USER.id, driver_id: null }))

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.ownRide")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("inserts a driver-role booking with the ride's full seat_count", async () => {
      getRideMock.mockResolvedValue(
        fakeRide({ posted_by_role: "passenger", posted_by: "passenger-1", driver_id: null, seat_count: 3 })
      )
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      fromMock.mockReturnValue({ insert: insertMock })
      // recordNotificationEvent (src/lib/notifications.ts) calls supabase.rpc
      // unconditionally — needs a resolved rpc call.
      rpcMock.mockResolvedValue({ error: null })

      const result = await createOffer("ride-1")

      expect(result).toEqual({ success: true })
      expect(insertMock).toHaveBeenCalledWith({
        ride_id: "ride-1",
        passenger_id: "passenger-1",
        booker_role: "driver",
        driver_id: FAKE_USER.id,
        seat_count: 3,
      })
    })

    it("maps a unique-violation to alreadyOffered", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", posted_by: "passenger-1", driver_id: null }))
      fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }) })

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.alreadyOffered")
    })
  })

  describe("approveBooking", () => {
    it("calls supabase.rpc with approve_booking and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      await approveBooking("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("approve_booking", { p_booking_id: "booking-1" })
    })

    it("maps a not_enough_seats RPC error to the notEnoughSeats error path", async () => {
      rpcMock.mockResolvedValue({ error: { message: "not_enough_seats: only 0 left" } })

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.notEnoughSeats")
    })

    it("maps any other RPC error to approveFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "some other db error" } })

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.approveFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1")
    })

    it("rejects approving an offer when the offering driver has no IBAN", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", driver_id: null }))
      fromMock.mockImplementation((table: string) => {
        if (table === "bookings")
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1", ride_id: "ride-1" } }) }) }),
          }
        if (table === "profiles_private") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
        return {}
      })

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
      expect(rpcMock).not.toHaveBeenCalled()
    })

    it("derives the IBAN/plate check's ride from the booking's real ride_id, not the passed rideId parameter", async () => {
      // The booking's authoritative ride ("real-ride-1") is a passenger
      // listing missing the offering driver's IBAN — the caller-supplied
      // rideId ("malicious-ride-2") is a driver-posted ride, which would
      // skip the IBAN check entirely if it were trusted instead.
      getRideMock.mockImplementation((rideId: string) =>
        Promise.resolve(
          rideId === "real-ride-1" ? fakeRide({ posted_by_role: "passenger", driver_id: null }) : fakeRide({ posted_by_role: "driver" })
        )
      )
      fromMock.mockImplementation((table: string) => {
        if (table === "bookings")
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1", ride_id: "real-ride-1" } }) }) }),
          }
        if (table === "profiles_private") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
        return {}
      })

      const result = await approveBooking("booking-1", "malicious-ride-2")

      expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
      expect(rpcMock).not.toHaveBeenCalled()
    })

    it("proceeds to the RPC when the offer is on a driver-posted ride (no IBAN check)", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(rpcMock).toHaveBeenCalledWith("approve_booking", { p_booking_id: "booking-1" })
    })
  })

  describe("rejectBooking", () => {
    it("calls supabase.rpc with reject_booking and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      await rejectBooking("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("reject_booking", { p_booking_id: "booking-1" })
    })

    it("maps an RPC error to rejectFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "boom" } })

      const result = await rejectBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.rejectFailed")
    })
  })

  describe("cancelBooking", () => {
    it("calls supabase.rpc with cancel_booking and the booking id", async () => {
      rpcMock.mockResolvedValue({ data: false, error: null })

      await cancelBooking("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("cancel_booking", { p_booking_id: "booking-1" })
    })

    it("maps an RPC error to cancelFailed", async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } })

      const result = await cancelBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.cancelFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ data: false, error: null })

      const result = await cancelBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1")
    })

    it("succeeds when cancel_booking reports a seat was freed (a previously-approved booking)", async () => {
      // VAPID/Resend aren't configured in this test env, so
      // sendSeatOpenedPushNotifications/sendSeatOpenedEmailNotifications
      // no-op before ever calling supabase.rpc for the waitlist lookups —
      // this test only proves cancelBooking still succeeds cleanly when the
      // RPC reports data: true, not the notification content itself.
      rpcMock.mockResolvedValue({ data: true, error: null })

      const result = await cancelBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
    })
  })

  describe("reportNoShow", () => {
    it("calls supabase.rpc with report_no_show and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })

      await reportNoShow("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("report_no_show", { p_booking_id: "booking-1" })
    })

    it("maps an RPC error to actionFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "boom" } })

      const result = await reportNoShow("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.actionFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })

      const result = await reportNoShow("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1/bookings")
    })
  })

  describe("confirmRemainingPayment", () => {
    it("calls supabase.rpc with confirm_remaining_payment and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })

      await confirmRemainingPayment("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("confirm_remaining_payment", { p_booking_id: "booking-1" })
    })

    it("maps a driver_no_show RPC error to the driverNoShow error path", async () => {
      rpcMock.mockResolvedValue({ error: { message: "driver_no_show" } })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.driverNoShow")
    })

    it("maps any other RPC error to settleFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "ride_not_completed" } })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.settleFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1/bookings")
    })
  })
})
