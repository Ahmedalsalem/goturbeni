import { describe, expect, it } from "vitest"

import { buildProfileSchema, MAX_BIO_LENGTH, MAX_FULL_NAME_LENGTH } from "@/features/profile/schemas"

const t = ((key: string) => key) as Parameters<typeof buildProfileSchema>[0]

function validProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName: "Test Kullanıcı",
    phone: undefined,
    bio: undefined,
    language: "tr",
    ...overrides,
  }
}

describe("buildProfileSchema", () => {
  const schema = buildProfileSchema(t)

  it("accepts a fully valid profile with no phone", () => {
    expect(schema.safeParse(validProfile()).success).toBe(true)
  })

  it("rejects an empty full name", () => {
    expect(schema.safeParse(validProfile({ fullName: "  " })).success).toBe(false)
  })

  it("rejects a full name longer than the max length", () => {
    expect(schema.safeParse(validProfile({ fullName: "a".repeat(MAX_FULL_NAME_LENGTH + 1) })).success).toBe(false)
  })

  it("rejects a bio longer than the max length", () => {
    expect(schema.safeParse(validProfile({ bio: "a".repeat(MAX_BIO_LENGTH + 1) })).success).toBe(false)
  })

  it("transforms an empty phone to undefined", () => {
    const result = schema.safeParse(validProfile({ phone: "  " }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBeUndefined()
    }
  })

  it("accepts a valid Turkish mobile number without a country code", () => {
    expect(schema.safeParse(validProfile({ phone: "05551234567" })).success).toBe(true)
  })

  it("accepts a valid Turkish mobile number with the +90 country code", () => {
    expect(schema.safeParse(validProfile({ phone: "+905551234567" })).success).toBe(true)
  })

  it("accepts a valid non-Turkish number given an explicit country code", () => {
    // Egyptian mobile number, relevant for the Arabic-locale audience.
    expect(schema.safeParse(validProfile({ phone: "+201001234567" })).success).toBe(true)
  })

  it("rejects a phone number that isn't a real number", () => {
    const result = schema.safeParse(validProfile({ phone: "123" }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["phone"])
    }
  })

  it("rejects a landline-shaped string that isn't a valid Turkish number", () => {
    expect(schema.safeParse(validProfile({ phone: "not-a-phone-number" })).success).toBe(false)
  })
})
