import { describe, expect, it } from "vitest"

import { buildAuthSchemas } from "@/features/auth/schemas"

const t = ((key: string) => key) as Parameters<typeof buildAuthSchemas>[0]

describe("buildAuthSchemas", () => {
  const { signInSchema, signUpSchema, forgotPasswordSchema, resetPasswordSchema } = buildAuthSchemas(t)

  describe("signInSchema", () => {
    it("accepts a valid email and non-empty password", () => {
      const result = signInSchema.safeParse({ email: "user@example.com", password: "anything" })
      expect(result.success).toBe(true)
    })

    it("rejects an invalid email", () => {
      const result = signInSchema.safeParse({ email: "not-an-email", password: "anything" })
      expect(result.success).toBe(false)
    })

    it("rejects an empty password", () => {
      const result = signInSchema.safeParse({ email: "user@example.com", password: "" })
      expect(result.success).toBe(false)
    })
  })

  describe("signUpSchema", () => {
    function validSignUp(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        email: "user@example.com",
        password: "password1",
        confirmPassword: "password1",
        gender: "female",
        phone: "05551234567",
        termsAccepted: "on",
        ...overrides,
      }
    }

    it("rejects a missing terms acceptance", () => {
      const result = signUpSchema.safeParse(validSignUp({ termsAccepted: undefined }))
      expect(result.success).toBe(false)
    })

    it("accepts matching passwords, a gender, and a valid phone", () => {
      const result = signUpSchema.safeParse(validSignUp())
      expect(result.success).toBe(true)
    })

    it("rejects a password shorter than 8 characters", () => {
      const result = signUpSchema.safeParse(validSignUp({ password: "short1", confirmPassword: "short1" }))
      expect(result.success).toBe(false)
    })

    it("rejects mismatched confirmPassword", () => {
      const result = signUpSchema.safeParse(validSignUp({ confirmPassword: "password2" }))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["confirmPassword"])
      }
    })

    it("rejects a missing gender", () => {
      const result = signUpSchema.safeParse(validSignUp({ gender: undefined }))
      expect(result.success).toBe(false)
    })

    it("rejects an invalid phone number", () => {
      const result = signUpSchema.safeParse(validSignUp({ phone: "123" }))
      expect(result.success).toBe(false)
    })

    it("rejects a missing phone number", () => {
      const result = signUpSchema.safeParse(validSignUp({ phone: "" }))
      expect(result.success).toBe(false)
    })
  })

  describe("forgotPasswordSchema", () => {
    it("accepts a valid email", () => {
      expect(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success).toBe(true)
    })

    it("rejects an invalid email", () => {
      expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false)
    })
  })

  describe("resetPasswordSchema", () => {
    it("accepts matching passwords", () => {
      const result = resetPasswordSchema.safeParse({ password: "password1", confirmPassword: "password1" })
      expect(result.success).toBe(true)
    })

    it("rejects mismatched confirmPassword", () => {
      const result = resetPasswordSchema.safeParse({ password: "password1", confirmPassword: "different1" })
      expect(result.success).toBe(false)
    })

    it("rejects a password shorter than 8 characters", () => {
      const result = resetPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" })
      expect(result.success).toBe(false)
    })
  })
})
