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
    it("accepts matching passwords of at least 8 characters", () => {
      const result = signUpSchema.safeParse({
        email: "user@example.com",
        password: "password1",
        confirmPassword: "password1",
      })
      expect(result.success).toBe(true)
    })

    it("rejects a password shorter than 8 characters", () => {
      const result = signUpSchema.safeParse({
        email: "user@example.com",
        password: "short1",
        confirmPassword: "short1",
      })
      expect(result.success).toBe(false)
    })

    it("rejects mismatched confirmPassword", () => {
      const result = signUpSchema.safeParse({
        email: "user@example.com",
        password: "password1",
        confirmPassword: "password2",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["confirmPassword"])
      }
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
