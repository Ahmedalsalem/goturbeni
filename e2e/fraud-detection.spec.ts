import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { makeAdminForTest, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the simplest of the three fraud-detection-v2 signals added in
// 0046_suspicious_accounts_fraud_v2.sql (duplicate_iban — the other two,
// disputed_repeatedly and repeated_receipt_rejection, need a dispute or
// reject-count history to set up and are exercised indirectly by
// disputes.spec.ts / payment-review.spec.ts instead), previously verified
// only via the migration's own SQL, never through the UI. Two otherwise
// unrelated accounts register the exact same IBAN — a fresh random one, not
// this repo's shared "TR330006100519786457841326" test IBAN (nearly every
// other e2e spec's driver profile already reuses that one, which would make
// a duplicate_iban assertion here flaky/inflated by unrelated test runs).
function uniqueIban(): string {
  const digits = `${Date.now()}${Math.floor(Math.random() * 10000)}`.padStart(24, "0").slice(-24)
  return `TR${digits}`
}

test.describe.serial("fraud detection — duplicate IBAN", () => {
  test.describe.configure({ retries: 1 })

  let userAEmail: string
  let userBEmail: string
  let adminEmail: string
  let userAContext: BrowserContext
  let userBContext: BrowserContext
  let adminContext: BrowserContext
  let userAPage: Page
  let userBPage: Page
  let adminPage: Page
  const sharedIban = uniqueIban()

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    userAEmail = uniqueEmail("fraudA")
    userBEmail = uniqueEmail("fraudB")
    adminEmail = uniqueEmail("fraudAdmin")
    userAContext = await browser.newContext()
    userBContext = await browser.newContext()
    adminContext = await browser.newContext()
    userAPage = await userAContext.newPage()
    userBPage = await userBContext.newPage()
    adminPage = await adminContext.newPage()
  })

  test.afterAll(async () => {
    await userAContext.close()
    await userBContext.close()
    await adminContext.close()
  })

  test("two unrelated accounts register the same IBAN", async () => {
    await signUpAndVerify(userAPage, userAEmail)
    await signUpAndVerify(userBPage, userBEmail)
    await signUpAndVerify(adminPage, adminEmail)
    await makeAdminForTest(adminEmail)

    await userAPage.goto("/profile")
    await userAPage.locator("#fullName").fill("E2E Fraud A")
    await userAPage.locator("#iban").fill(sharedIban)
    await userAPage.locator("#ibanHolderName").fill("E2E Fraud A")
    await userAPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(userAPage.getByText("Profil güncellendi.")).toBeVisible()

    await userBPage.goto("/profile")
    await userBPage.locator("#fullName").fill("E2E Fraud B")
    await userBPage.locator("#iban").fill(sharedIban)
    await userBPage.locator("#ibanHolderName").fill("E2E Fraud B")
    await userBPage.getByRole("button", { name: "Kaydet" }).click()
    await expect(userBPage.getByText("Profil güncellendi.")).toBeVisible()
  })

  test("admin sees both accounts flagged as duplicate_iban on /admin/users", async () => {
    await adminPage.goto("/admin/users")
    await expect(adminPage.getByText("E2E Fraud A")).toBeVisible()
    await expect(adminPage.getByText("E2E Fraud B")).toBeVisible()
    // Exactly one flagged row per account (admin_get_suspicious_accounts
    // emits one duplicate_iban row per matching profile) — this IBAN is
    // unique to this test run, so a count other than 2 means either a false
    // negative (rule didn't fire) or the rule matched unrelated accounts.
    await expect(adminPage.getByText("Aynı IBAN birden fazla hesapta")).toHaveCount(2)
    await expect(adminPage.getByText("Aynı IBAN 2 hesapta kayıtlı")).toHaveCount(2)
  })
})
