import { describe, expect, it } from "vitest"

import { computeReceiptRiskTier, TRUSTED_ACCOUNT_MIN_AGE_DAYS } from "@/features/admin/risk"

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

const BASE_PARAMS = {
  passengerId: "user-1",
  passengerCreatedAt: daysAgoIso(TRUSTED_ACCOUNT_MIN_AGE_DAYS + 1),
  passengerSuspended: false,
  rejectCount: 0,
  suspiciousUserIds: new Set<string>(),
  disputedUserIds: new Set<string>(),
}

describe("computeReceiptRiskTier", () => {
  it("is low risk when every trust signal is clean", () => {
    expect(computeReceiptRiskTier(BASE_PARAMS)).toBe("low")
  })

  it("is high risk for a brand-new account", () => {
    expect(computeReceiptRiskTier({ ...BASE_PARAMS, passengerCreatedAt: daysAgoIso(1) })).toBe("high")
  })

  it("is high risk for a suspended user", () => {
    expect(computeReceiptRiskTier({ ...BASE_PARAMS, passengerSuspended: true })).toBe("high")
  })

  it("is high risk after a prior rejection", () => {
    expect(computeReceiptRiskTier({ ...BASE_PARAMS, rejectCount: 1 })).toBe("high")
  })

  it("is high risk when flagged by suspicious-account rules", () => {
    expect(computeReceiptRiskTier({ ...BASE_PARAMS, suspiciousUserIds: new Set(["user-1"]) })).toBe("high")
  })

  it("is high risk while a dispute involving the user is open", () => {
    expect(computeReceiptRiskTier({ ...BASE_PARAMS, disputedUserIds: new Set(["user-1"]) })).toBe("high")
  })
})
