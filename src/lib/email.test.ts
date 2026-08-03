import { createTranslator } from "next-intl"
import { describe, expect, it } from "vitest"

import trMessages from "../../messages/tr.json"
import arMessages from "../../messages/ar.json"

// Regression test for a real production bug: the verification email body
// used to embed a <strong> tag directly in the translated message and render
// it with `t.rich()` — next-intl's rich-tag parser rejects any tag with an
// attribute (INVALID_TAG) and falls back to the literal "namespace.key"
// string, so switching that tag to include inline styling (or adding a
// <br>) would have silently broken every verification email. Fixed by
// keeping translated strings tag-free (verificationCodeIntro/Outro) and
// doing all HTML/styling in src/lib/email.ts instead — exercised here with
// the real message catalogs (bypassing next-intl's server/client entrypoint,
// which vitest can't resolve outside a Next.js RSC build).
describe("Email verification code messages", () => {
  it.each([
    ["tr", trMessages],
    ["ar", arMessages],
  ])("%s: verificationCodeIntro/Outro are tag-free plain text", (locale, messages) => {
    const t = createTranslator({ locale, messages, namespace: "Email" })

    const intro = t("verificationCodeIntro")
    const outro = t("verificationCodeOutro")

    expect(intro).not.toContain("Email.verificationCodeIntro")
    expect(outro).not.toContain("Email.verificationCodeOutro")
    expect(intro).not.toMatch(/<[^>]+>/)
    expect(outro).not.toMatch(/<[^>]+>/)
  })
})
