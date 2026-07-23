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

import { approveBooking, cancelBooking, createBooking, rejectBooking } from "@/features/bookings/actions"

const FAKE_USER = { id: "user-1" }

// Matches the .select("passenger_id").eq("id", ...).single() chain used by
// getBookingPassengerId (called after a successful approve/reject RPC to
// find out who to push-notify).
function fromReturningPassengerId(passengerId: string | null) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: passengerId ? { passenger_id: passengerId } : null }),
      }),
    }),
  }
}

function fakeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: "ride-1",
    driver_id: "driver-1",
    departure_city: "Ankara",
    arrival_city: "İstanbul",
    departure_district: null,
    arrival_district: null,
    departure_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    seat_count: 4,
    available_seats: 3,
    cost_share: 100,
    description: null,
    status: "active",
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

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1")
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
      rpcMock.mockResolvedValue({ error: null })

      await cancelBooking("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("cancel_booking", { p_booking_id: "booking-1" })
    })

    it("maps an RPC error to cancelFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "boom" } })

      const result = await cancelBooking("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.cancelFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })

      const result = await cancelBooking("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1")
    })
  })
})
