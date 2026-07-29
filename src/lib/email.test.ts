import { createTranslator } from "next-intl"
import { describe, expect, it } from "vitest"

import trMessages from "../../messages/tr.json"
import arMessages from "../../messages/ar.json"

// Regression test for a real production bug: the verification email body
// rendered the literal string "Email.verificationCodeBody" instead of the
// actual code. Root cause: `t()` (plain translator) can't format a message
// containing a <strong> tag — next-intl treats that as an INVALID_MESSAGE
// and falls back to the raw "namespace.key" string. Fixed in src/lib/email.ts
// by switching to `t.rich()`, exercised here directly against the real
// message catalogs (bypassing next-intl's server/client entrypoint, which
// vitest can't resolve outside a Next.js RSC build).
describe("Email.verificationCodeBody translation", () => {
  it.each([
    ["tr", trMessages],
    ["ar", arMessages],
  ])("%s: t.rich() renders the code, not the literal key", (locale, messages) => {
    const t = createTranslator({ locale, messages, namespace: "Email" })

    const rendered = t.rich("verificationCodeBody", {
      code: "123456",
      strong: (chunks) => `<strong>${chunks}</strong>`,
    })

    expect(rendered).not.toContain("Email.verificationCodeBody")
    expect(rendered).toContain("123456")
    expect(rendered).toContain("<strong>123456</strong>")
  })
})
