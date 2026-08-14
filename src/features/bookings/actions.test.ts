import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Ride } from "@/types/ride"

// vi.hoisted lets these mock fns exist before the vi.mock factories below run
// (vi.mock calls are hoisted to the top of the file by vitest).
const { rpcMock, fromMock, createClientMock, verifySessionMock, getRideMock, revalidatePathMock, afterMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  verifySessionMock: vi.fn(),
  getRideMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  // approveBooking/rejectBooking now schedule their notification fan-out via
  // next/server's after() (see the same pattern already used by
  // submitSettlementReceipt, which this file doesn't test). after() throws
  // if called outside a real Next.js request scope
  // (no AsyncLocalStorage work store — see node_modules/next/dist/server/
  // after/after.js), which this plain-vitest environment never provides, so
  // it must be mocked. It's intentionally a bare recorder that never invokes
  // the scheduled callback: actually running it would fire a second,
  // unawaited round of fromMock/rpcMock calls (via recordNotificationEvent)
  // racing against whatever the NEXT test configures those shared mocks to
  // do — exactly the cross-test mock-state bleed this file has been bitten
  // by before. No test here asserts on notification content, so not
  // executing the callback costs nothing.
  afterMock: vi.fn(),
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

import { approveBooking, cancelBooking, confirmRemainingPayment, createBooking, createOffer, rejectBooking, reportNoShow } from "@/features/bookings/actions"

const FAKE_USER = { id: "user-1" }

// Matches the .select("ride_id, driver_id, passenger_id").eq("id", ...).single()
// chain used by getBookingParties (both approveBooking and rejectBooking now
// call it exactly once — for the pre-RPC IBAN/plate ride lookup and the
// post-RPC notification-recipient lookup alike) — default "ride-1" matches
// the rideId most tests in this file pass to approveBooking/rejectBooking so
// that lookup doesn't silently resolve to null and skip the IBAN/plate check
// for the wrong reason.
function fromReturningPassengerId(passengerId: string | null, rideId = "ride-1") {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: passengerId ? { passenger_id: passengerId, ride_id: rideId, driver_id: null } : null }),
      }),
    }),
  }
}

// approveBooking's offer IBAN/plate check now goes through the
// get_offer_driver_readiness RPC (0063_offer_driver_readiness_rpc.sql)
// instead of directly querying profiles_private (which RLS blocks for
// anyone but the row's own owner — see that migration's comment). rpcMock
// is shared across every RPC name approveBooking/rejectBooking might call,
// so this branches on the first arg the same way fromMock branches on the
// table name; approve_booking itself is awaited directly (no .maybeSingle()
// chain), so it falls through to the plain resolved-value default.
function rpcMockWithReadiness(ibanOk: boolean, plateOk: boolean) {
  return (fn: string) => {
    if (fn === "get_offer_driver_readiness") {
      return { maybeSingle: async () => ({ data: { iban_ok: ibanOk, plate_ok: plateOk }, error: null }) }
    }
    return Promise.resolve({ error: null })
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
    payment_method: "bank_transfer",
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
    // chain (e.g. approveBooking/rejectBooking's unconditional getBookingParties
    // lookup) resolves to no row, rather than throwing on an unconfigured mock.
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
      // Explicit even though a prior test may leave a compatible value behind
      // (vi.clearAllMocks() doesn't reset mockResolvedValue) — this test's
      // correctness shouldn't depend on file execution order.
      getRideMock.mockResolvedValue(fakeRide())
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
        return {}
      })
      // Valid plate alongside the missing IBAN, same reasoning as the
      // dedicated ordering test below: proves the IBAN half of the RPC
      // result is what's being checked, not just "readiness is falsy".
      rpcMock.mockImplementation(rpcMockWithReadiness(false, true))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
      expect(rpcMock).toHaveBeenCalledWith("get_offer_driver_readiness", { p_booking_id: "booking-1" })
      expect(rpcMock).not.toHaveBeenCalledWith("approve_booking", expect.anything())
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
        return {}
      })
      rpcMock.mockImplementation(rpcMockWithReadiness(false, true))

      const result = await approveBooking("booking-1", "malicious-ride-2")

      expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
      expect(rpcMock).not.toHaveBeenCalledWith("approve_booking", expect.anything())
    })

    it("reports the IBAN error (not the plate error) when both the IBAN and the plate are missing", async () => {
      // get_offer_driver_readiness returns both booleans in one RPC call
      // (unlike the old two-query version, there's no positional-ordering
      // subtlety to prove here) — but the code still must check iban_ok
      // before plate_ok. This test gives both flags false — only "IBAN is
      // checked first" produces offerDriverIbanRequired instead of
      // offerDriverCarPlateRequired.
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", driver_id: null }))
      fromMock.mockImplementation((table: string) => {
        if (table === "bookings")
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1", ride_id: "ride-1" } }) }) }),
          }
        return {}
      })
      rpcMock.mockImplementation(rpcMockWithReadiness(false, false))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
      expect(rpcMock).not.toHaveBeenCalledWith("approve_booking", expect.anything())
    })

    it("rejects approving an offer when the offering driver's IBAN is set but the plate isn't", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", driver_id: null }))
      fromMock.mockImplementation((table: string) => {
        if (table === "bookings")
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1", ride_id: "ride-1" } }) }) }),
          }
        return {}
      })
      rpcMock.mockImplementation(rpcMockWithReadiness(true, false))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.offerDriverCarPlateRequired")
      expect(rpcMock).not.toHaveBeenCalledWith("approve_booking", expect.anything())
    })

    it("proceeds to approve_booking when the offering driver's IBAN and plate are both ready", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", driver_id: null }))
      fromMock.mockImplementation((table: string) => {
        if (table === "bookings")
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1", ride_id: "ride-1" } }) }) }),
          }
        return {}
      })
      rpcMock.mockImplementation(rpcMockWithReadiness(true, true))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(rpcMock).toHaveBeenCalledWith("get_offer_driver_readiness", { p_booking_id: "booking-1" })
      expect(rpcMock).toHaveBeenCalledWith("approve_booking", { p_booking_id: "booking-1" })
    })

    it("proceeds to the RPC when the offer is on a driver-posted ride (no IBAN check)", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      const result = await approveBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(rpcMock).toHaveBeenCalledWith("approve_booking", { p_booking_id: "booking-1" })

      // The notification fan-out is deferred into after() (see the afterMock
      // comment at the top of this file) — nothing above actually exercised
      // it. Manually invoke the recorded callback here, inside this test's
      // own await chain, to prove both that approveBooking schedules exactly
      // one deferred notification and that getBookingParties's field mapping
      // ({ passengerId: data.passenger_id, ... }) correctly identifies
      // "passenger-1" (this ride is driver-posted, so the approving party is
      // the driver and the notification recipient is the passenger) as the
      // create_notification_event recipient — a driverId/passengerId swap in
      // that mapping would otherwise fail zero tests.
      expect(afterMock).toHaveBeenCalledTimes(1)
      await afterMock.mock.calls[0][0]()
      expect(rpcMock).toHaveBeenCalledWith("create_notification_event", expect.objectContaining({ p_recipient_id: "passenger-1" }))
    })
  })

  describe("rejectBooking", () => {
    it("calls supabase.rpc with reject_booking and the booking id", async () => {
      // Explicitly a driver-posted ride (rather than relying on whatever
      // getRideMock was last set to by an earlier test) so the notification
      // recipient below is deterministic regardless of test execution order.
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))
      rpcMock.mockResolvedValue({ error: null })
      fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

      await rejectBooking("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("reject_booking", { p_booking_id: "booking-1" })

      // Same as approveBooking's "succeeds and revalidates" test above —
      // manually invoke the deferred after() callback, inside this test's
      // own await chain, to prove rejectBooking schedules exactly one
      // deferred notification and that getBookingParties correctly resolves
      // "passenger-1" (this ride is driver-posted, so the rejecting party is
      // the driver and the notification recipient is the passenger) as the
      // create_notification_event recipient.
      expect(afterMock).toHaveBeenCalledTimes(1)
      await afterMock.mock.calls[0][0]()
      expect(rpcMock).toHaveBeenCalledWith("create_notification_event", expect.objectContaining({ p_recipient_id: "passenger-1" }))
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
