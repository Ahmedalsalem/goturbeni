# BlaBlaCar Gap Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five feature gaps identified in a comparison against BlaBlaCar: (1) a cash payment option alongside the existing IBAN-transfer settlement flow, (2) opt-in instant booking on driver-posted rides, (3) a derived experience-level/badge shown next to driver trust signals, (4) an "air conditioning" vehicle-comfort filter, and (5) an estimated CO₂-savings display per ride.

**Architecture:** Each feature is additive and independently shippable — no existing behavior is removed. Cash payment adds a `payment_method` choice on `rides` that gates which settlement UI renders (the receipt-upload/OCR path only makes sense for bank transfers; the existing receipt-free mutual "Ödeme Tamamlandı" confirm button already works for either). Instant booking adds an `instant_booking` toggle on `rides` and a new `create_booking` RPC that does the insert and, when eligible, immediately calls the existing `_apply_booking_approval` helper in the same transaction — this closes a preexisting client-side-only seat-race check as a side effect, since the RPC's seat check is atomic where the current TS insert's is not. Experience levels and CO₂ savings are pure derived/display logic — no new tables, computed from data (completed-ride counts, province-pair distance) that already exists. The vehicle-comfort filter (`has_ac`) mirrors the existing `pets_allowed`/`smoking_allowed` filter pattern exactly. Everything ships through the codebase's established additive-migration + TS/UI/i18n/e2e task rhythm.

**Tech Stack:** Next.js server actions, Supabase Postgres (plpgsql RPCs, RLS), next-intl (tr/en/ar), Vitest, Playwright, React Hook Form + Zod (rides), FormData server actions (profile).

**Explicitly out of scope (do not attempt in this plan):**
- Instant booking on passenger-listing offers (`booker_role='driver'`) — offer approval already requires a synchronous IBAN/plate readiness check (`get_offer_driver_readiness`, `supabase/migrations/0063_offer_driver_readiness_rpc.sql`) with no clear instant-approval UX; only normal driver-posted-ride bookings (`booker_role='passenger'`, the default) get instant booking.
- Cash payment method selection for passenger-listing offers — `payment_method` is chosen once by whoever posts a driver-posted ride at creation time; passenger listings keep defaulting to `bank_transfer` (no driver is assigned at listing-creation time to ask).
- Any new payment-verification mechanism for cash — the existing receipt-free mutual `confirm_remaining_payment` RPC (`SettlePaymentButton.tsx`) is reused unmodified.
- Fixing the two pre-existing stale "Yarı-Yarı Ödeme Akışı" ("half-and-half payment flow") comments found in `src/features/rides/actions.ts:67-74` and `e2e/utils.ts:94-99` during this plan's investigation — real but unrelated to any of the 5 features; leave a note for a future cleanup pass, don't fix here.

## Global Constraints

- Never edit a past migration file — only add new ones. Next available number is `0064` (confirmed via `ls supabase/migrations/`, last is `0063_offer_driver_readiness_rpc.sql`). This plan adds three: `0064_ride_payment_method.sql`, `0065_instant_booking.sql`, `0066_profile_has_ac.sql`.
- Every SQL function this plan touches must be redefined with its **full latest body** (this codebase's own established convention). Where the existing function's parameter list changes, use the codebase's own established `drop function old_signature; create function new_signature` pattern (see `0018_ride_trip_preferences.sql`/`0050_car_plate.sql` for `update_own_profile`'s precedent) — do NOT use `create or replace` when the parameter list changes, Postgres rejects it.
- Turkish is the source-of-truth locale; English and Arabic copy must be updated to the same meaning in the same commit as the Turkish string. For Arabic strings specifically, double-check hamza placement and MSA-vs-dialect correctness word-by-word (not just fluency) — this project has been burned by sloppy Arabic copy before, multiple times, confirmed as recently as this same worktree's session history.
- New `rides`/`profiles` boolean/enum columns follow the existing naming convention exactly: snake_case, `_allowed`/`_only`/`has_`-prefixed booleans (e.g. `pets_allowed`, `has_ac`), enums as a dedicated `create type public.<name> as enum (...)` (see `ride_posted_by_role`, `booking_booker_role`).
- Run `npx tsc --noEmit` after every backend/type task; don't move to the next task with a red typecheck. Run `npx vitest run` before every commit that touches `src/features/bookings/actions.ts` or `src/features/rides/actions.ts` (these already have unit test coverage that must stay green).
- Docker/local Supabase may not be available in the execution environment (it was not, for the entire prior session in this worktree) — if `npx supabase db reset` cannot run, every SQL task must instead do rigorous **static** verification: read the actual current body of every function being redefined from the real migration files (never assume from this plan's text, which may have drifted), and cross-check column/table names against the real current schema the same way.
- Playwright e2e specs in this repo run against `next dev --turbopack` (see `playwright.config.ts`), which has a documented, real cold-compile flake pattern the very first time any code path is exercised live — new spec files covering genuinely new UI paths should ship with `test.describe.configure({ retries: 1 })` and per-attempt-fresh `beforeAll`-generated emails from the start (see `payment-review.spec.ts`, `passenger-listing.spec.ts`, `settlement-ocr-auto-approval.spec.ts` for the established pattern), not added reactively after a CI failure.
- `src/features/rides/actions.ts`'s `buildRideRow` helper is shared by both `createRide` and `updateRide` — any new `rides` column driven by `RideFormValues` should be added there once, not duplicated in both functions.

---

## Task 1: Migration — `payment_method` on `rides`

**Files:**
- Create: `supabase/migrations/0064_ride_payment_method.sql`

**Interfaces:**
- Produces: `public.ride_payment_method` enum (`'bank_transfer' | 'cash'`), `rides.payment_method` column (not null, default `'bank_transfer'`).

- [x] **Step 1: Write the migration**

```sql
-- Nakit ödeme seçeneği: sürücü ilan verirken ödeme yöntemini seçer
-- ('bank_transfer' | 'cash'). Yolcu ilanlarında (posted_by_role='passenger')
-- henüz bir sürücü atanmamış olduğundan bu seçim anlamsız — RideForm bu
-- alanı yolcu modunda hiç göstermiyor, kayıt her zaman varsayılan
-- 'bank_transfer' ile açılıyor (Task 3, buildRideSchema'nın transform'u).
--
-- 'cash' seçilen yolculuklarda mevcut dekont/OCR akışı (SettlementReceiptUpload,
-- submit_settlement_receipt/_ocr) hiç kullanılmıyor — yalnızca zaten var olan,
-- dekontsuz karşılıklı onay (confirm_remaining_payment RPC,
-- 0017_booking_payment_flow.sql) kullanılabiliyor. O RPC zaten dekonta hiç
-- bakmıyor (salt karşılıklı "gönderdim/aldım" bayrağı), bu yüzden burada
-- hiçbir fonksiyon değişikliği gerekmiyor — sadece UI'ın hangi bileşenleri
-- gösterdiği değişiyor (Task 4/5).
create type public.ride_payment_method as enum ('bank_transfer', 'cash');

alter table public.rides
  add column payment_method public.ride_payment_method not null default 'bank_transfer';
```

- [x] **Step 2: Apply and verify**

Run: `npx supabase db reset` (or your project's normal apply-migrations command).
Expected: no errors; `payment_method` column exists on `rides`, default `'bank_transfer'`, existing rows all get the default.

If Docker/local Supabase is unavailable in this environment: skip live apply, instead confirm via `grep -c "create table public.rides\|alter table public.rides" supabase/migrations/*.sql` that no other migration already defines a `payment_method` column (name collision check), and confirm the enum type name `ride_payment_method` isn't already used (`grep -rn "ride_payment_method" supabase/migrations/*.sql` should show only this new file). Note the static-verification substitution explicitly in your report.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/0064_ride_payment_method.sql
git commit -m "db: add payment_method (bank_transfer | cash) to rides"
```

---

## Task 2: `src/types/ride.ts` — add `payment_method`

**Files:**
- Modify: `src/types/ride.ts`

**Interfaces:**
- Consumes: Task 1's `ride_payment_method` enum values.
- Produces: `RidePaymentMethod = "bank_transfer" | "cash"`, `Ride.payment_method: RidePaymentMethod`.

- [x] **Step 1: Add the type and field**

In `src/types/ride.ts`, add after the existing `RidePostedByRole` type (line 2):

```ts
export type RidePaymentMethod = "bank_transfer" | "cash"
```

Add `payment_method: RidePaymentMethod` to the `Ride` interface, right after `vip_solo: boolean` (line 20):

```ts
  vip_solo: boolean
  payment_method: RidePaymentMethod
  status: RideStatus
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this is an additive field; nothing reads it yet).

- [x] **Step 3: Commit**

```bash
git add src/types/ride.ts
git commit -m "types: add RidePaymentMethod and Ride.payment_method"
```

---

## Task 3: `RideForm.tsx` + `schemas.ts` — payment method picker

**Files:**
- Modify: `src/features/rides/schemas.ts`
- Modify: `src/features/rides/RideForm.tsx`

**Interfaces:**
- Consumes: Task 2's `RidePaymentMethod`.
- Produces: `RideFormValues.paymentMethod: "bank_transfer" | "cash"` (default `"bank_transfer"`, forced to `"bank_transfer"` in passenger-listing mode by the existing transform).

- [x] **Step 1: Add the field to the schema**

In `src/features/rides/schemas.ts`, add `paymentMethod` to the object passed to `z.object({...})` (after `vipSolo: z.boolean().default(false),`, line 58):

```ts
      vipSolo: z.boolean().default(false),
      paymentMethod: z.enum(["bank_transfer", "cash"]).default("bank_transfer"),
```

Extend the existing passenger-mode transform (lines 93-97) to also force `paymentMethod` back to the default, matching how it already resets `petsAllowed`/`smokingAllowed`/`vipSolo`:

```ts
    .transform((data) =>
      data.postedByRole === "passenger"
        ? { ...data, petsAllowed: false, smokingAllowed: false, vipSolo: false, repeatWeekly: false, paymentMethod: "bank_transfer" as const }
        : data
    )
```

- [x] **Step 2: Add the picker to the form, driver-mode only**

In `src/features/rides/RideForm.tsx`:

Add `paymentMethod: ride?.payment_method ?? "bank_transfer",` to the `defaultValues` object (after `vipSolo: ride?.vip_solo ?? false,`, line 76).

Add a picker inside the existing `{!isPassengerMode && (...)}` block (right after the `vipSolo` `Field` + its hint, before the closing `</>` at line 440):

```tsx
            <Field>
              <FieldLabel>{t("paymentMethodLabel")}</FieldLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={watch("paymentMethod") === "bank_transfer" ? "default" : "outline"}
                  onClick={() => setValue("paymentMethod", "bank_transfer")}
                >
                  {t("paymentMethodBankTransfer")}
                </Button>
                <Button
                  type="button"
                  variant={watch("paymentMethod") === "cash" ? "default" : "outline"}
                  onClick={() => setValue("paymentMethod", "cash")}
                >
                  {t("paymentMethodCash")}
                </Button>
              </div>
              <FieldDescription>{t("paymentMethodHint")}</FieldDescription>
            </Field>
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors surface in `src/features/rides/actions.ts` (`buildRideRow` doesn't yet read `paymentMethod` — that's fine, `RideFormValues` gaining a field doesn't itself break `buildRideRow`'s object literal, only strict excess-property contexts would; if `tsc` is clean here, that's expected too, not a problem — Task 4 wires it through regardless).

- [x] **Step 4: Commit**

```bash
git add src/features/rides/schemas.ts src/features/rides/RideForm.tsx
git commit -m "rides: add payment method picker (bank transfer / cash), driver-mode only"
```

---

## Task 4: `rides/actions.ts` — persist `payment_method`

**Files:**
- Modify: `src/features/rides/actions.ts`

**Interfaces:**
- Consumes: `RideFormValues.paymentMethod` (Task 3).
- Produces: `buildRideRow(...)` now includes `payment_method` — flows through both `createRide` and `updateRide` automatically (both already call `buildRideRow`).

- [x] **Step 1: Add the field to `buildRideRow`**

In `src/features/rides/actions.ts`, add `payment_method: parsed.paymentMethod,` to the object returned by `buildRideRow` (after `vip_solo: parsed.vipSolo,`, line 44):

```ts
    vip_solo: parsed.vipSolo,
    payment_method: parsed.paymentMethod,
  }
}
```

- [x] **Step 2: Typecheck and run the existing rides test suite**

Run: `npx tsc --noEmit && npx vitest run src/features/rides`
Expected: both clean — this is a pure additive field, no existing test asserts on the exact shape of the insert/update payload in a way that would break from one more key (if any test DOES assert an exact object shape and now fails, that's a real finding — read it and update the test's expected payload to include `payment_method: "bank_transfer"`, don't loosen the assertion).

- [x] **Step 3: Commit**

```bash
git add src/features/rides/actions.ts
git commit -m "rides: persist payment_method through create/update"
```

---

## Task 5: Gate `SettlementReceiptUpload` on `payment_method`, both booking-management pages

**Files:**
- Modify: `src/app/bookings/page.tsx`
- Modify: `src/app/rides/[id]/bookings/page.tsx`

**Interfaces:**
- Consumes: `booking.ride.payment_method` (via `BookingWithRide`, `src/types/booking.ts` — already embeds the full `ride:rides(*)` row, so no query change needed) and `ride.payment_method` (already fetched on `rides/[id]/bookings/page.tsx` via `getRide`).

**Design decision:** `SettlePaymentButton` (the receipt-free mutual confirm) already renders unconditionally on both pages regardless of payment method — leave it exactly as-is, it's correct for both cash and bank transfer. Only `SettlementReceiptUpload` (the receipt-upload/OCR half) needs to stop rendering for cash rides — there's no receipt to upload for a cash handoff.

- [x] **Step 1: `src/app/bookings/page.tsx`**

Find the existing `SettlementReceiptUpload` render (inside the `bookings.map(...)` loop, gated on `isCompleted && booking.payment_status !== "settled"`, around line 148). Add a `booking.ride.payment_method === "bank_transfer"` condition:

Change:
```tsx
                    {isCompleted && booking.payment_status !== "settled" && (
                      <SettlementReceiptUpload
```
to:
```tsx
                    {isCompleted && booking.payment_status !== "settled" && booking.ride.payment_method === "bank_transfer" && (
                      <SettlementReceiptUpload
```

- [x] **Step 2: `src/app/rides/[id]/bookings/page.tsx`**

Find the existing `SettlementReceiptUpload` render (gated on `isPayer && isRideOver && booking.payment_status !== "settled"`, around line 258). Add the same condition, reading `ride.payment_method` (the page already has the `ride` object in scope, fetched via `getRide(id)` at the top of the component):

Change:
```tsx
                    {isPayer && isRideOver && booking.payment_status !== "settled" && (
                      <SettlementReceiptUpload
```
to:
```tsx
                    {isPayer && isRideOver && booking.payment_status !== "settled" && ride.payment_method === "bank_transfer" && (
                      <SettlementReceiptUpload
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. `BookingWithRide`'s embedded `ride` already carries every `rides.*` column via the existing `select("*, ride:rides(*, ...))"` pattern (confirm by reading `BOOKING_WITH_RIDE_SELECT` in `src/features/bookings/queries.ts` — it should be `"*, ride:rides(*, ...)"`, meaning `payment_method` is already included with no query change; if it's an explicit column list instead of `rides(*)`, add `payment_method` to that list and note the deviation from this brief in your report).

- [x] **Step 4: Commit**

```bash
git add src/app/bookings/page.tsx "src/app/rides/[id]/bookings/page.tsx"
git commit -m "bookings: hide receipt upload for cash rides, mutual confirm still works"
```

---

## Task 6: i18n — payment method copy, tr/en/ar

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `messages/ar.json`

**Interfaces:**
- Produces: `Rides.form.paymentMethodLabel`, `Rides.form.paymentMethodBankTransfer`, `Rides.form.paymentMethodCash`, `Rides.form.paymentMethodHint` in all three files (same namespace `Rides.form` that already holds `petsAllowed`/`smokingAllowed`/`vipSolo`).

- [x] **Step 1: `messages/tr.json`**

Find the `Rides.form` object (search for `"vipSolo"` inside it, near the other ride-preference labels). Add, right after the `vipSolo`/`vipSoloHint` pair:

```json
      "paymentMethodLabel": "Ödeme yöntemi",
      "paymentMethodBankTransfer": "Banka Havalesi (IBAN)",
      "paymentMethodCash": "Nakit",
      "paymentMethodHint": "Nakit seçersen yolcu dekont yüklemez, yolculuk sonrası her iki taraf da \"Ödeme Tamamlandı\" butonuyla karşılıklı onaylar.",
```

- [x] **Step 2: `messages/en.json`**

Same position, same keys:

```json
      "paymentMethodLabel": "Payment method",
      "paymentMethodBankTransfer": "Bank Transfer (IBAN)",
      "paymentMethodCash": "Cash",
      "paymentMethodHint": "If you choose cash, the passenger won't upload a receipt — after the trip, both sides confirm with the \"Payment Complete\" button instead.",
```

- [x] **Step 3: `messages/ar.json`**

Same position, same keys. Word-by-word hamza/MSA check required before committing (this project's established quality bar):

```json
      "paymentMethodLabel": "طريقة الدفع",
      "paymentMethodBankTransfer": "تحويل بنكي (IBAN)",
      "paymentMethodCash": "نقدًا",
      "paymentMethodHint": "إذا اخترت الدفع نقدًا، لن يرفع الراكب إيصالًا — بعد الرحلة، يؤكد الطرفان الدفع بزر \"تم إكمال الدفعة\" بدلًا من ذلك.",
```

Verification notes for the implementer: `طريقة الدفع` (payment method) and `تحويل بنكي` (bank transfer) reuse vocabulary already present elsewhere in `ar.json` (`Bookings.payment`/`Admin.payments` namespaces already use `الدفعة` for "payment" and `تحويل` roots for transfer-related copy — grep `messages/ar.json` for `الدفعة` and `تحويل` before finalizing to confirm exact existing spellings and reuse them verbatim rather than re-deriving). `نقدًا` (cash, adverbial accusative with tanwin fatḥa) is standard MSA. `تم إكمال الدفعة` is the exact existing string already used for `Bookings.payment.settleCta` (verify via grep, reuse verbatim, don't rephrase).

- [x] **Step 4: Validate and verify key-set parity**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/tr.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('messages/ar.json','utf8'))"
```
Expected: no output (all parse clean). Then confirm all three files have the same new 4 keys added at the same nesting depth (`Rides.form.paymentMethod*`) — no key present in one file and missing from another.

- [x] **Step 5: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json
git commit -m "i18n: payment method picker copy (tr/en/ar)"
```

---

## Task 7: e2e — cash payment mutual-confirm flow

**Files:**
- Create: `e2e/cash-payment.spec.ts`

**Interfaces:**
- Consumes: `e2e/utils.ts`'s `signUpAndVerify`, `backdateRideDeparture`, `uniqueEmail`, `selectCombobox` (read `e2e/utils.ts` in full before writing this file — do not assume signatures, verify against the real current exports).

- [x] **Step 1: Extend `createRide` test helper to accept `paymentMethod`**

In `e2e/utils.ts`, add an optional `paymentMethod?: "bank_transfer" | "cash"` to `createRide`'s `options` parameter type, and click the new button when it's `"cash"` (mirroring the existing `postedByRole`-style button-click pattern already used elsewhere in this file for `RideForm`'s posted-by-role toggle — grep `iAmDriver\|iAmPassenger` in `e2e/utils.ts` for the exact click pattern to copy, since `paymentMethodCash`/`paymentMethodBankTransfer` are the same kind of two-button toggle, not a checkbox):

```ts
    petsAllowed?: boolean
    smokingAllowed?: boolean
    vipSolo?: boolean
    paymentMethod?: "bank_transfer" | "cash"
  }
```

Add, after the existing `vipSolo` handling block and before the form submit:

```ts
  if (options.paymentMethod === "cash") {
    await page.getByRole("button", { name: "Nakit", exact: true }).click()
  }
```

- [x] **Step 2: Write the spec**

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Cash-payment rides skip the receipt-upload/OCR path entirely (see
// src/app/bookings/page.tsx and src/app/rides/[id]/bookings/page.tsx's
// payment_method === "bank_transfer" gate, 0064_ride_payment_method.sql) —
// only the preexisting receipt-free mutual "Ödeme Tamamlandı" confirm
// button (confirm_remaining_payment RPC) is available. This test proves
// both: the upload control never appears, and the mutual-confirm path
// alone is enough to reach payment_status='settled'.
test.describe.serial("cash payment", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("cashDriver")
    passengerEmail = uniqueEmail("cashPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver creates a cash-payment ride, passenger books, driver approves", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Konya",
      arrivalCity: "Kayseri",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 90,
      paymentMethod: "cash",
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible({ timeout: 30_000 })

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("no receipt-upload control ever appears; mutual confirm alone settles the payment", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    // The mutual confirm button is present...
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).toBeVisible()
    // ...but no file input for a receipt is (SettlementReceiptUpload never renders for cash).
    await expect(passengerPage.locator('input[type="file"]')).toHaveCount(0)

    await passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.locator('input[type="file"]')).toHaveCount(0)
    await driverPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).click()

    // Both sides confirmed — payment_status is now 'settled', the mutual
    // confirm button disappears for both.
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
```

- [x] **Step 3: Typecheck, lint, and confirm the spec parses**

Run: `npx tsc --noEmit && npx eslint e2e/cash-payment.spec.ts e2e/utils.ts && npx playwright test --list`
Expected: clean; the new spec's 2 tests appear in the `--list` output.

If Docker/local Supabase is available: also run `npx playwright test cash-payment.spec.ts` and expect PASS. If unavailable, do the same static cross-check discipline as every other e2e task in this codebase's history: verify every literal button-label string against the real current `messages/tr.json` and component code (in particular, re-confirm `"Ödeme Tamamlandı"` is `Bookings.payment.settleCta`'s exact current TR string post any i18n changes still pending in this same plan).

- [x] **Step 4: Commit**

```bash
git add e2e/cash-payment.spec.ts e2e/utils.ts
git commit -m "e2e: cover cash-payment mutual-confirm flow, no receipt upload UI"
```

---

## Task 8: Migration — `instant_booking` + `create_booking` RPC

**Files:**
- Create: `supabase/migrations/0065_instant_booking.sql`

**Interfaces:**
- Produces: `rides.instant_booking` column (boolean, not null, default `false`); `public.create_booking(p_ride_id uuid, p_seat_count integer) returns uuid`.
- Consumes: `public._apply_booking_approval(uuid, uuid, integer, uuid default null)` — its exact current signature and body, as redefined in `supabase/migrations/0062_single_payment_at_settlement.sql`. **Before writing this task's SQL, read that function's actual current body from `0062_single_payment_at_settlement.sql` directly** — do not trust the copy below without checking, this plan's text may have drifted from the real file.

**Design note for the implementer:** this RPC replaces `createBooking`'s current plain `.insert()` (in `src/features/bookings/actions.ts`, Task 9) for **all** driver-posted-ride bookings, not only instant-booking ones. This is deliberate, not scope creep: the current `.insert()` path's seat-availability check (`parsed.data.seatCount > ride.available_seats`) runs entirely in application code before the insert, with no database-level atomicity — two concurrent booking requests can both pass that check and both insert, over-booking the ride (the same class of race `approve_booking`'s `available_seats < seat_count` check already guards against, but only at *approval* time, not at *request* time). Routing every booking creation through one RPC that does the seat check with `for update` locking closes that gap for free while implementing instant booking. Note this explicitly in your report as an incidental correctness fix, not a silently expanded scope — if you find it changes an existing test's expectations, that's expected and you should update the test, not treat it as a regression.

- [x] **Step 1: Write the migration**

```sql
-- Anında rezervasyon: sürücü ilan verirken "Anında Onay" açarsa, koltuk
-- müsaitse yolcunun rezervasyon talebi hiç 'pending' durumuna girmeden
-- doğrudan onaylanır. Yalnızca normal sürücü ilanlarına uygulanıyor —
-- yolcu ilanı/teklif akışında onay artık zorunlu bir IBAN/plaka hazırlık
-- kontrolünden geçiyor (get_offer_driver_readiness, 0063), bu akış bu
-- migration'ın kapsamı dışında bırakılıyor.
alter table public.rides
  add column instant_booking boolean not null default false;

-- create_booking: src/features/bookings/actions.ts'teki createBooking'in
-- düz `.insert()`'ini değiştiriyor — yalnızca anında-onay ilanları için
-- değil, TÜM normal sürücü-ilanı rezervasyonları için (booker_role
-- varsayılan olarak 'passenger'). Eskiden koltuk kontrolü sadece TS
-- tarafında, insert'ten önce yapılıyordu (gerçek bir atomiklik garantisi
-- yok — iki eşzamanlı istek ikisi de kontrolü geçip ikisi de insert
-- edebilirdi). Burada `for update` ile satır kilitlenip kontrol atomik
-- hale geliyor; anında onaysa aynı transaction içinde
-- _apply_booking_approval çağrılıyor (approve_booking'in zaten kullandığı
-- aynı helper, 0062_single_payment_at_settlement.sql — imzasını/gövdesini
-- oradan birebir doğrulayın, burada tahmin etmeyin).
create function public.create_booking(p_ride_id uuid, p_seat_count integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_booking_id uuid;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then
    raise exception 'ride_not_found';
  end if;
  if v_ride.status <> 'active' then
    raise exception 'ride_not_active';
  end if;
  if v_ride.driver_id = auth.uid() then
    raise exception 'own_ride';
  end if;
  if v_ride.available_seats < p_seat_count then
    raise exception 'not_enough_seats';
  end if;

  insert into public.bookings (ride_id, passenger_id, seat_count)
  values (p_ride_id, auth.uid(), p_seat_count)
  returning id into v_booking_id;

  if v_ride.instant_booking then
    perform public._apply_booking_approval(v_booking_id, p_ride_id, p_seat_count, null);
  end if;

  return v_booking_id;
end;
$$;
```

- [x] **Step 2: Static verification (if Docker unavailable) or live apply**

If Docker/local Supabase available: `npx supabase db reset`, then manually exercise `create_booking` twice concurrently against a 1-seat ride via `psql` (two separate sessions, both calling `select create_booking('<ride-id>', 1)` at once) to confirm only one succeeds and the other raises `not_enough_seats` — this is the exact race the migration's docstring claims it closes; verify it, don't just assert it.

If unavailable: static-verify — (a) re-read `_apply_booking_approval`'s real current signature/body from `0062_single_payment_at_settlement.sql` and confirm the 4-arg call above matches exactly (positional order: `p_booking_id, p_ride_id, p_seat_count, p_assign_driver_id`); (b) confirm the `bookings` table's partial unique index on `(ride_id, passenger_id) where status in ('pending','approved')` (check `0003_bookings.sql` and any later migration that touched it) still applies to this insert unchanged — a passenger re-booking a ride they already have an active booking on must still hit `23505`, not silently succeed; (c) confirm `bookings.seat_count` and `bookings.ride_id`/`bookings.passenger_id` column names/types match the insert exactly.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/0065_instant_booking.sql
git commit -m "db: add instant_booking to rides + create_booking RPC (atomic seat check, optional auto-approve)"
```

---

## Task 9: `src/types/ride.ts` — add `instant_booking`

**Files:**
- Modify: `src/types/ride.ts`

- [x] **Step 1: Add the field**

Add `instant_booking: boolean` to the `Ride` interface, right after the `payment_method` field Task 2 added:

```ts
  payment_method: RidePaymentMethod
  instant_booking: boolean
  status: RideStatus
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 3: Commit**

```bash
git add src/types/ride.ts
git commit -m "types: add Ride.instant_booking"
```

---

## Task 10: `RideForm.tsx` + `schemas.ts` — instant booking toggle

**Files:**
- Modify: `src/features/rides/schemas.ts`
- Modify: `src/features/rides/RideForm.tsx`

**Interfaces:**
- Produces: `RideFormValues.instantBooking: boolean` (default `false`, forced `false` in passenger-listing mode).

- [x] **Step 1: Schema**

In `src/features/rides/schemas.ts`, add next to `paymentMethod` (Task 3):

```ts
      paymentMethod: z.enum(["bank_transfer", "cash"]).default("bank_transfer"),
      instantBooking: z.boolean().default(false),
```

Extend the passenger-mode transform (already touched in Task 3) to also reset `instantBooking`:

```ts
        ? { ...data, petsAllowed: false, smokingAllowed: false, vipSolo: false, repeatWeekly: false, paymentMethod: "bank_transfer" as const, instantBooking: false }
```

- [x] **Step 2: Form field**

In `src/features/rides/RideForm.tsx`, add `instantBooking: ride?.instant_booking ?? false,` to `defaultValues` (next to `paymentMethod`).

Add a checkbox in the same `!isPassengerMode` block, after the payment-method picker added in Task 3:

```tsx
            <Field orientation="horizontal">
              <Controller
                control={control}
                name="instantBooking"
                render={({ field }) => (
                  <Checkbox id="instantBooking" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="instantBooking" className="font-normal">
                {t("instantBooking")}
              </FieldLabel>
            </Field>
            <FieldDescription>{t("instantBookingHint")}</FieldDescription>
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/features/rides/schemas.ts src/features/rides/RideForm.tsx
git commit -m "rides: add instant booking toggle, driver-mode only"
```

---

## Task 11: `rides/actions.ts` — persist `instant_booking`

**Files:**
- Modify: `src/features/rides/actions.ts`

- [x] **Step 1: Add to `buildRideRow`**

```ts
    payment_method: parsed.paymentMethod,
    instant_booking: parsed.instantBooking,
  }
}
```

- [x] **Step 2: Typecheck and run rides tests**

Run: `npx tsc --noEmit && npx vitest run src/features/rides`
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/features/rides/actions.ts
git commit -m "rides: persist instant_booking through create/update"
```

---

## Task 12: `bookings/actions.ts` — switch `createBooking` to the `create_booking` RPC

**Files:**
- Modify: `src/features/bookings/actions.ts`
- Modify: `src/features/bookings/actions.test.ts`

**Interfaces:**
- Consumes: `create_booking(p_ride_id uuid, p_seat_count integer) returns uuid` (Task 8).
- Produces: `createBooking`'s error-mapping now includes `not_enough_seats`, `ride_not_active`, `own_ride` as possible RPC-raised errors, in addition to the existing `23505` (already-booked) path.

**Before this task:** read the actual current full body of `createBooking` in `src/features/bookings/actions.ts` — the brief below assumes the shape read earlier in this plan's investigation (lines ~33-95), but re-verify line numbers and exact current wording against the real file, since earlier tasks in this same plan may have already touched nearby code.

- [x] **Step 1: Replace the insert with the RPC call**

The current function does: parse/validate → fetch `ride` via `getRide` → several `if` guard-clauses re-implementing checks the new RPC now does atomically (`ride.status !== "active"`, `ride.driver_id === user.id`, `parsed.data.seatCount > ride.available_seats`) → `.from("bookings").insert({...})`.

Keep the `getRide` fetch (still needed below, for the notification recipient and for `NOT_FOUND`-style UX before even attempting the RPC — an ride lookup returning `null` should still produce `rideNotActive`, not a raw RPC error). Keep the client-side guard clauses as a fast, cheap early-return (better UX: no round trip needed for an obviously-stale page), but they are no longer the source of truth — the RPC re-checks everything atomically regardless. Replace the insert:

Change:
```ts
  const supabase = await createClient()
  const { error } = await supabase.from("bookings").insert({
    ride_id: rideId,
    passenger_id: user.id,
    seat_count: parsed.data.seatCount,
  })

  if (error) {
    // 23505 = unique_violation — the partial unique index on (ride_id,
    // passenger_id) where status in (pending, approved).
    if (error.code !== "23505") {
      logError(error, "bookings.createBooking")
    }
    return { error: error.code === "23505" ? tErrors("alreadyBooked") : tErrors("createFailed") }
  }
```
to:
```ts
  const supabase = await createClient()
  const { error } = await supabase.rpc("create_booking", { p_ride_id: rideId, p_seat_count: parsed.data.seatCount })

  if (error) {
    // 23505 = unique_violation — the partial unique index on (ride_id,
    // passenger_id) where status in (pending, approved). Other messages are
    // create_booking's own raised exceptions (0065_instant_booking.sql) —
    // ride_not_active/own_ride/not_enough_seats duplicate the client-side
    // guard clauses above for the common case, but the RPC is the actual
    // source of truth (atomic, `for update`-locked) since two concurrent
    // requests can both pass the client-side checks.
    if (error.code === "23505") {
      return { error: tErrors("alreadyBooked") }
    }
    if (error.message.includes("not_enough_seats")) {
      return { error: tErrors("notEnoughSeats") }
    }
    logError(error, "bookings.createBooking")
    return { error: tErrors("createFailed") }
  }
```

- [x] **Step 2: Update the unit tests**

`src/features/bookings/actions.test.ts`'s `createBooking` describe block mocks `fromMock.mockReturnValue({ insert: insertMock })` and asserts on `insertMock`'s call args (see the existing "succeeds and revalidates the ride path when the insert succeeds" and 23505/other-error tests — re-read them from the real current file before editing, this plan's earlier reading may be stale by the time this task runs). Rewrite these to mock `rpcMock` instead:

Replace every test in that `describe("createBooking", ...)` block that currently does `fromMock.mockReturnValue({ insert: insertMock })` + asserts on `insertMock` with the RPC-based equivalent, e.g. the success case becomes:

```ts
    it("succeeds and revalidates the ride path when the RPC succeeds", async () => {
      getRideMock.mockResolvedValue(fakeRide())
      rpcMock.mockResolvedValue({ error: null })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result).toEqual({ success: true })
      expect(rpcMock).toHaveBeenCalledWith("create_booking", { p_ride_id: "ride-1", p_seat_count: 1 })
    })
```

and the 23505 case:

```ts
    it("maps a 23505 unique-violation to the already-booked error", async () => {
      getRideMock.mockResolvedValue(fakeRide())
      rpcMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.alreadyBooked")
    })
```

and add a new test for the RPC's atomic seat check surfacing as a distinct error from the client-side one:

```ts
    it("maps the RPC's not_enough_seats to the same error as the client-side check", async () => {
      getRideMock.mockResolvedValue(fakeRide({ available_seats: 5 }))
      rpcMock.mockResolvedValue({ error: { code: "P0001", message: "not_enough_seats" } })

      const result = await createBooking("ride-1", { seatCount: 1 })

      expect(result.error).toBe("Bookings.errors.notEnoughSeats")
    })
```

Do not delete the existing client-side-guard tests (rejects when ride is not active / rejects booking your own ride / rejects when requested seats exceed available seats) — those guard clauses still exist and still short-circuit before the RPC call, they're still worth testing independently.

- [x] **Step 3: Run the tests**

Run: `npx vitest run src/features/bookings/actions.test.ts`
Expected: all pass, including the 3 rewritten + 1 new test.

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 5: Commit**

```bash
git add src/features/bookings/actions.ts src/features/bookings/actions.test.ts
git commit -m "bookings: createBooking calls create_booking RPC (atomic seat check + instant-approve)"
```

---

## Task 13: `BookingButton.tsx` — instant-approval success copy

**Files:**
- Modify: `src/features/bookings/BookingButton.tsx`

**Design decision:** keep this minimal. The passenger's success toast currently always says `tSuccess("created")` ("Rezervasyon talebiniz gönderildi." — "your booking request was sent"). For an instantly-approved booking this is misleading (nothing is still "pending"). `router.refresh()` already runs immediately after, which re-fetches `existingBooking` and correctly shows the approved state — so the only fix needed is the toast copy itself. `BookingButton` doesn't currently know whether the booking it just created was instant-approved (the server action only returns `{ success: true } | { error: string }`) — rather than threading a new return-value shape through `createBooking`'s `BookingActionState` (broader change, more risk), thread the ride's own `instant_booking` flag down as a prop instead, since the component already receives `rideId` and is rendered from a page that already has the full `ride` object in scope.

- [x] **Step 1: Accept an `instantBooking` prop**

In `src/features/bookings/BookingButton.tsx`, add `instantBooking` to the props:

```ts
export function BookingButton({
  rideId,
  availableSeats,
  existingBooking,
  driverPaymentInfo,
  driverTrustInfo,
  instantBooking,
}: {
  rideId: string
  availableSeats: number
  existingBooking: Booking | null
  driverPaymentInfo: { iban: string; iban_holder_name: string } | null
  driverTrustInfo: DriverTrustInfo | null
  instantBooking: boolean
}) {
```

Change the success branch of `onSubmit`:

```ts
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(instantBooking ? tSuccess("createdInstant") : tSuccess("created"))
        router.refresh()
      }
```

- [x] **Step 2: Pass the prop from the caller**

In `src/app/rides/[id]/page.tsx`, find where `<BookingButton ... />` is rendered and add `instantBooking={ride.instant_booking}`.

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add src/features/bookings/BookingButton.tsx "src/app/rides/[id]/page.tsx"
git commit -m "bookings: distinct success toast when instant booking auto-approves"
```

---

## Task 14: i18n + e2e — instant booking

**Files:**
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`
- Create: `e2e/instant-booking.spec.ts`

- [x] **Step 1: i18n — `Rides.form` additions (all 3 files)**

tr.json, next to the `paymentMethod*` keys added in Task 6:
```json
      "instantBooking": "Anında Onay",
      "instantBookingHint": "Açıksa, koltuk müsaitse yolcunun rezervasyon talebi beklemeden otomatik onaylanır.",
```

en.json:
```json
      "instantBooking": "Instant Booking",
      "instantBookingHint": "When on, a passenger's request is approved automatically as soon as there's room — no waiting for you to confirm.",
```

ar.json (word-by-word hamza/MSA check required — `الفوري` reuses the standard MSA root ف-و-ر "immediate/instant" pattern, no dialect risk; verify against existing usage of `الحجز` for "booking" elsewhere in `ar.json` before finalizing):
```json
      "instantBooking": "الحجز الفوري",
      "instantBookingHint": "عند التفعيل، تتم الموافقة على طلب حجز الراكب تلقائيًا فور توفر مقعد، دون انتظار موافقتك.",
```

- [x] **Step 2: i18n — `Bookings.success.createdInstant` (all 3 files)**

Find `Bookings.success.created` in each file and add `createdInstant` next to it.

tr.json: `"createdInstant": "Rezervasyonunuz anında onaylandı.",`
en.json: `"createdInstant": "Your booking was approved instantly.",`
ar.json: `"createdInstant": "تمت الموافقة على حجزك فورًا.",`

- [x] **Step 3: Validate JSON and key-set parity**

Run the same `node -e "JSON.parse(...)"` check on all 3 files as Task 6, and confirm the 4 new keys (`instantBooking`, `instantBookingHint`, plus `createdInstant` in a different namespace) exist identically across all three.

- [x] **Step 4: Extend the `createRide` e2e helper for `instantBooking`**

In `e2e/utils.ts` (already touched in Task 7), add `instantBooking?: boolean` to the options type and click the checkbox when set, using the same `[aria-labelledby="instantBooking-label"]` pattern already used for `petsAllowed`/`smokingAllowed`/`vipSolo`:

```ts
  if (options.instantBooking) {
    await page.locator('[aria-labelledby="instantBooking-label"]').click()
  }
```

- [x] **Step 5: Write the spec**

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for create_booking's auto-approve branch (0065_instant_booking.sql):
// when a ride has instant_booking=true and seats are available, a passenger's
// booking request skips 'pending' entirely and lands as 'approved' — no
// driver action needed. Also proves the manual approve/reject UI genuinely
// never appears for this booking (BookingActions is only rendered for
// status='pending' rows, see rides/[id]/bookings/page.tsx).
test.describe.serial("instant booking", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let passengerEmail: string
  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("instantDriver")
    passengerEmail = uniqueEmail("instantPassenger")
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver creates an instant-booking ride, passenger's request is auto-approved", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Bursa",
      arrivalCity: "İzmir",
      minutesAhead: 45,
      seatCount: 3,
      costShare: 120,
      instantBooking: true,
    })
    expect(rideId).toBeTruthy()

    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyonunuz anında onaylandı.")).toBeVisible({ timeout: 30_000 })

    // Reload and confirm the durable, DB-backed state: approved badge, no
    // pending cancel-only state.
    await passengerPage.reload()
    await expect(passengerPage.getByText("Onaylandı")).toBeVisible()

    // The driver never sees an approve/reject prompt for this booking — it
    // was never 'pending'.
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByRole("button", { name: "Onayla", exact: true })).toHaveCount(0)
    await expect(driverPage.getByText("Onaylandı")).toBeVisible()
  })
})
```

- [x] **Step 6: Typecheck, lint, list**

Run: `npx tsc --noEmit && npx eslint e2e/instant-booking.spec.ts e2e/utils.ts && npx playwright test --list`
Expected: clean; new spec's test appears.

If Docker available, also run it live and expect PASS. If not, do the same static verification discipline as every prior e2e task in this plan.

- [x] **Step 7: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json e2e/instant-booking.spec.ts e2e/utils.ts
git commit -m "instant booking: i18n copy + e2e coverage"
```

---

## Task 15: Experience-level tier utility

**Files:**
- Create: `src/features/reviews/experienceLevel.ts`
- Create: `src/features/reviews/experienceLevel.test.ts`

**Interfaces:**
- Consumes: nothing (pure function of a `completedRideCount: number`).
- Produces: `type ExperienceLevel = "new" | "active" | "experienced" | "ambassador"`, `getExperienceLevel(completedRideCount: number): ExperienceLevel`.

**Design decision (tier thresholds, plan author's call — human should review/adjust if the exact cutoffs matter to them):**
- `new` ("Yeni Üye"): 0 completed rides
- `active` ("Aktif Üye"): 1-4 completed rides
- `experienced` ("Deneyimli"): 5-14 completed rides
- `ambassador` ("Elçi"): 15+ completed rides

These are display-only labels layered on top of the already-existing `completedRideCount`/rating display (`getDriverCompletedRideCount`, `src/features/rides/queries.ts`; `getReviewStats`, `src/features/reviews/queries.ts`) — no new table, no new query, purely a `number -> label` mapping plus a small UI badge (Task 16).

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"

import { getExperienceLevel } from "./experienceLevel"

describe("getExperienceLevel", () => {
  it("returns 'new' for 0 completed rides", () => {
    expect(getExperienceLevel(0)).toBe("new")
  })

  it("returns 'active' for 1 to 4 completed rides", () => {
    expect(getExperienceLevel(1)).toBe("active")
    expect(getExperienceLevel(4)).toBe("active")
  })

  it("returns 'experienced' for 5 to 14 completed rides", () => {
    expect(getExperienceLevel(5)).toBe("experienced")
    expect(getExperienceLevel(14)).toBe("experienced")
  })

  it("returns 'ambassador' for 15 or more completed rides", () => {
    expect(getExperienceLevel(15)).toBe("ambassador")
    expect(getExperienceLevel(1000)).toBe("ambassador")
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/reviews/experienceLevel.test.ts`
Expected: FAIL — `experienceLevel.ts` doesn't exist yet.

- [x] **Step 3: Implement**

```ts
export type ExperienceLevel = "new" | "active" | "experienced" | "ambassador"

// Tier thresholds are a product/design choice, not derived from any
// external spec — displayed via i18n keys ExperienceLevel.<level> (see
// Task 16). Purely a label layered on the completed-ride count that
// already exists (getDriverCompletedRideCount, src/features/rides/queries.ts)
// — no new table, no new query.
export function getExperienceLevel(completedRideCount: number): ExperienceLevel {
  if (completedRideCount >= 15) return "ambassador"
  if (completedRideCount >= 5) return "experienced"
  if (completedRideCount >= 1) return "active"
  return "new"
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/reviews/experienceLevel.test.ts`
Expected: PASS, 4/4.

- [x] **Step 5: Commit**

```bash
git add src/features/reviews/experienceLevel.ts src/features/reviews/experienceLevel.test.ts
git commit -m "reviews: add experience-level tier computation (new/active/experienced/ambassador)"
```

---

## Task 16: Experience-level badge UI + wiring

**Files:**
- Create: `src/features/reviews/ExperienceLevelBadge.tsx`
- Modify: `src/features/bookings/BookingButton.tsx`
- Modify: `src/app/rides/[id]/page.tsx`
- Modify: `src/app/rides/[id]/bookings/page.tsx`

**Interfaces:**
- Consumes: `getExperienceLevel` (Task 15), `DriverTrustInfo` (already has `completedRideCount` — no new prop needed to compute the level, the badge derives it internally from the count it's already given).

- [x] **Step 1: Write the badge component**

```tsx
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { getExperienceLevel } from "@/features/reviews/experienceLevel"

// Purely presentational — derives its own level from the count it's given,
// so every caller that already has a completedRideCount (DriverTrustInfo
// consumers) can drop this in with no new data fetch.
export function ExperienceLevelBadge({ completedRideCount }: { completedRideCount: number }) {
  const t = useTranslations("ExperienceLevel")
  const level = getExperienceLevel(completedRideCount)
  return (
    <Badge variant="outline" className="text-xs">
      {t(level)}
    </Badge>
  )
}
```

- [x] **Step 2: Wire into `BookingButton.tsx`'s trust-info alert**

In the `driverTrustInfo && (...)` block (around line 70-86), add the badge next to the existing member-since/completed-rides text:

```tsx
              {driverTrustInfo && (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2">
                  <ExperienceLevelBadge completedRideCount={driverTrustInfo.completedRideCount} />
                  <span className="text-muted-foreground text-xs">
                    {tPayment("driverMemberSince", {
```

Add the import: `import { ExperienceLevelBadge } from "@/features/reviews/ExperienceLevelBadge"`.

- [x] **Step 3: Wire into `rides/[id]/page.tsx`'s driver profile card**

Read the current file to find where `driverReviewStats`/`driverCompletedRideCount` are already rendered near the driver's profile section (the same trust-signal area BookingButton's alert mirrors — search for `StarRating` usage in this file). Add `<ExperienceLevelBadge completedRideCount={driverCompletedRideCount} />` next to the existing rating display. If `driverCompletedRideCount` isn't already computed unconditionally on this page (it's currently only fetched when `isApprovedAwaitingPayment`, per this plan's earlier investigation of the file), fetch it unconditionally instead so the badge can show on every ride detail page, not just post-approval — check the current gating condition and widen it if needed, but only for this one additional query (`getDriverCompletedRideCount`), don't otherwise touch the existing conditional-fetch structure for `driverPaymentInfo`/`driverTrustInfo`.

- [x] **Step 4: Wire into `rides/[id]/bookings/page.tsx`'s counterparty display**

Read the current file's `counterpartyOf` usage and the card header where `counterparty.name` renders (around line 145). If the counterparty is a driver (i.e. `viewerIsDriverSide` is false for the viewer, meaning the counterparty they're looking at is the driver), fetch and show `ExperienceLevelBadge` next to their name — reuse `getDriverCompletedRideCount` for the counterparty's id. Keep this fetch scoped only to rows where it's relevant (don't fetch for every row indiscriminately if the page can have many rows — batch via `Promise.all` following the same pattern already used for `counterpartyPhones`/`myDisputes`/`pickupVerified` maps in this file).

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 6: Commit**

```bash
git add src/features/reviews/ExperienceLevelBadge.tsx src/features/bookings/BookingButton.tsx "src/app/rides/[id]/page.tsx" "src/app/rides/[id]/bookings/page.tsx"
git commit -m "reviews: show experience-level badge alongside driver trust signals"
```

---

## Task 17: `RideCard.tsx` — experience badge on the poster

**Files:**
- Modify: `src/features/rides/RideCard.tsx`
- Modify: `src/features/rides/queries.ts`

**Interfaces:**
- Consumes: needs each ride's poster's completed-ride count. `RideCard` currently receives a `RideWithDriver` with only `driver: { full_name, avatar_url, car_brand, car_model, car_plate }` embedded — no completed-ride count. Fetching it per-card via a separate query for every card in a list is the wrong shape (N+1). Instead, compute it once per unique driver id in the list's parent (`/rides` page) and pass it down as a prop, matching this repo's own established `Promise.all`-over-unique-ids batching pattern already used in `rides/[id]/bookings/page.tsx`.

- [x] **Step 1: Find the `/rides` list page**

Read `src/app/rides/page.tsx` (the page that renders a list of `<RideCard>`s from `getRides()`). Confirm its current structure before editing.

- [x] **Step 2: Batch-fetch completed-ride counts**

In `src/app/rides/page.tsx`, after fetching `rides` (the `RideSearchResult.rides` array), add:

```ts
const uniqueDriverIds = [...new Set(rides.map((ride) => ride.driver_id).filter((id): id is string => id !== null))]
const completedRideCounts = new Map(
  await Promise.all(uniqueDriverIds.map(async (driverId) => [driverId, await getDriverCompletedRideCount(driverId)] as const))
)
```

Add the import: `import { getDriverCompletedRideCount } from "@/features/rides/queries"`.

Pass `completedRideCounts.get(ride.driver_id ?? "") ?? 0` as a new `driverCompletedRideCount` prop to each `<RideCard>`.

- [x] **Step 3: Accept and render the prop in `RideCard.tsx`**

Add `driverCompletedRideCount?: number` to `RideCard`'s props (optional — passenger-listing cards have no assigned driver yet, so callers that don't have a meaningful count can omit it):

```tsx
export async function RideCard({
  ride,
  actions,
  driverCompletedRideCount,
}: {
  ride: RideWithDriver
  actions?: React.ReactNode
  driverCompletedRideCount?: number
}) {
```

Render the badge in the `CardFooter`, next to the poster name, only for driver-posted rides (`!isPassengerListing`) where a count was actually provided:

```tsx
          <div>
            <span className="text-sm font-medium">{posterName}</span>
            {!isPassengerListing && driverCompletedRideCount !== undefined && (
              <ExperienceLevelBadge completedRideCount={driverCompletedRideCount} />
            )}
```

Add the import: `import { ExperienceLevelBadge } from "@/features/reviews/ExperienceLevelBadge"`.

Note: `RideCard` is an `async` Server Component; `ExperienceLevelBadge` (Task 16) uses `useTranslations` from `"next-intl"`, which requires a Client Component boundary — confirm whether `ExperienceLevelBadge` needs a `"use client"` directive (it does, since `useTranslations` from the client package is a client hook) and that this composition (Server Component rendering a Client Component) is already an established pattern elsewhere in this codebase (it is — `RideStatusBadge`, already used inside `RideCard`, follow that file's own directive as the reference).

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 5: Commit**

```bash
git add src/features/rides/RideCard.tsx src/app/rides/page.tsx
git commit -m "rides: show driver experience-level badge on ride cards"
```

---

## Task 18: i18n — experience level labels

**Files:**
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

- [x] **Step 1: Add the `ExperienceLevel` namespace to all 3 files**

Add a new top-level key (find a sensible alphabetical/logical position, e.g. near the existing `Reviews` namespace):

tr.json:
```json
  "ExperienceLevel": {
    "new": "Yeni Üye",
    "active": "Aktif Üye",
    "experienced": "Deneyimli",
    "ambassador": "Elçi"
  },
```

en.json:
```json
  "ExperienceLevel": {
    "new": "New Member",
    "active": "Active Member",
    "experienced": "Experienced",
    "ambassador": "Ambassador"
  },
```

ar.json (word-by-word hamza/MSA check required):
```json
  "ExperienceLevel": {
    "new": "عضو جديد",
    "active": "عضو نشط",
    "experienced": "ذو خبرة",
    "ambassador": "سفير"
  },
```

Verification notes: `عضو` (member) — no hamza, standard MSA, likely already used elsewhere in `ar.json` (grep to confirm and match exactly). `جديد` (new), `نشط` (active) — both standard MSA adjectives, no dialect risk. `ذو خبرة` ("possessor of experience" — idiomatic MSA construction, `ذو` + genitive noun, not a dialectal shortcut) is the standard way to express "experienced" as a noun-phrase label rather than a bare adjective, matching the noun-phrase style of the other three labels. `سفير` (ambassador) — standard MSA, no hamza.

- [x] **Step 2: Validate and verify key-set parity**

Same `node -e "JSON.parse(...)"` + key-set-diff discipline as every prior i18n task in this plan.

- [x] **Step 3: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json
git commit -m "i18n: experience level tier labels (tr/en/ar)"
```

---

## Task 19: Migration — `has_ac` on `profiles`

**Files:**
- Create: `supabase/migrations/0066_profile_has_ac.sql`

**Interfaces:**
- Consumes: `public.update_own_profile`'s exact current signature/body — **read it from `supabase/migrations/0050_car_plate.sql` directly before writing this task's SQL**, do not trust the copy below without checking (this plan's earlier investigation read it once; a prior task in this same plan does not touch it, so it should be unchanged, but verify).
- Produces: `profiles.has_ac` column (boolean, not null, default `false`); `update_own_profile` gains an 11th parameter `p_has_ac boolean`.

- [x] **Step 1: Write the migration**

```sql
-- Araç konforu filtresi: basit başlangıç, tek boolean (klima var/yok).
-- car_brand/car_model/car_plate ile aynı gerekçe (0018/0050) — hassas veri
-- değil, herkese açık (profiles, profiles_private değil).
alter table public.profiles
  add column has_ac boolean not null default false;

-- update_own_profile'a has_ac eklenir. Parametre listesi değiştiği için
-- (0018/0050'deki gibi) önce eski imza düşürülüp yeni bir overload
-- oluşturulur. Gövde 0050_car_plate.sql'deki son hâlinden birebir
-- kopyalanıp yalnızca has_ac eklendi — implementer bunu gerçek dosyayla
-- satır satır doğrulamalı.
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text);

create function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text,
  p_iban text,
  p_iban_holder_name text,
  p_car_brand text,
  p_car_model text,
  p_car_plate text,
  p_has_ac boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
    set full_name = p_full_name,
        bio = p_bio,
        language = p_language,
        avatar_url = coalesce(p_avatar_url, avatar_url),
        car_brand = p_car_brand,
        car_model = p_car_model,
        car_plate = p_car_plate,
        has_ac = p_has_ac
    where id = auth.uid();

  insert into public.profiles_private (id, phone, phone_verified, iban, iban_holder_name)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name)
  on conflict (id) do update
    set phone = excluded.phone,
        phone_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.phone_verified
        end,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name;
end;
$$;
```

- [x] **Step 2: Apply and verify**

Run: `npx supabase db reset` if Docker available; expect no errors, `profiles.has_ac` exists default `false`, `update_own_profile` callable with 11 args.

If unavailable: static-verify the dropped signature (`drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text)` — 10 `text` args) exactly matches `0050_car_plate.sql`'s `create function` parameter list (10 params: `p_full_name, p_bio, p_language, p_avatar_url, p_phone, p_iban, p_iban_holder_name, p_car_brand, p_car_model, p_car_plate` — all `text`). If any later migration between `0050` and `0063` touched `update_own_profile` again (grep `update_own_profile` across all migrations to be sure `0050` really is the latest before this plan), the drop signature must match *that* one instead — re-verify, don't assume `0050` is still current.

- [x] **Step 3: Commit**

```bash
git add supabase/migrations/0066_profile_has_ac.sql
git commit -m "db: add has_ac to profiles, thread through update_own_profile"
```

---

## Task 20: `src/types/profile.ts` + `ProfileForm.tsx` — `has_ac` field

**Files:**
- Modify: `src/types/profile.ts`
- Modify: `src/features/profile/schemas.ts`
- Modify: `src/features/profile/actions.ts`
- Modify: `src/features/profile/ProfileForm.tsx`

- [x] **Step 1: Type**

In `src/types/profile.ts`, add `has_ac: boolean` to the `Profile` interface, after `car_plate: string | null`:

```ts
  car_plate: string | null
  has_ac: boolean
```

- [x] **Step 2: Schema**

In `src/features/profile/schemas.ts`, add to the object in `buildProfileSchema`, after `carPlate`:

```ts
    hasAc: z.boolean().default(false),
```

- [x] **Step 3: Action**

In `src/features/profile/actions.ts`:

`updateProfile`'s `safeParse` call — a native HTML checkbox's `FormData` value is `"on"` when checked and **absent** (not `"off"` or `""`) when unchecked, so read it as presence, not string content:

```ts
    carPlate: formData.get("carPlate"),
    hasAc: formData.get("hasAc") === "on",
```

Pass it through to the RPC call:

```ts
    p_car_plate: parsed.data.carPlate ?? null,
    p_has_ac: parsed.data.hasAc,
  })
```

- [x] **Step 4: Form field**

In `src/features/profile/ProfileForm.tsx`, add a checkbox in the car-info section, right after the `carBrand`/`carModel`/`carPlate` grid + its `FieldDescription` (after line 177):

```tsx
        <Field orientation="horizontal">
          <Checkbox id="hasAc" name="hasAc" defaultChecked={initialProfile.has_ac} />
          <FieldLabel htmlFor="hasAc" className="font-normal">
            {t("hasAc")}
          </FieldLabel>
        </Field>
```

Add the import: `import { Checkbox } from "@/components/ui/checkbox"`. Note this is an **uncontrolled** native checkbox (`name="hasAc"`, `defaultChecked`, no `onCheckedChange`) matching `ProfileForm`'s existing FormData-based-action pattern (unlike `RideForm`'s react-hook-form `Controller`-wrapped checkboxes) — verify `@/components/ui/checkbox`'s `Checkbox` component actually supports being used as a plain native-form-participating checkbox with a `name` prop (check its implementation; if it's a fully custom (non-native-input-backed) component that only works controlled, this step needs an alternate approach — a hidden native `<input type="checkbox">` mirroring a controlled state, matching whatever pattern the rest of `ProfileForm.tsx`'s Base UI components already use for the avatar file input's interplay with a styled trigger button. Report this as a finding if the assumption doesn't hold, don't silently paper over it.)

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 6: Commit**

```bash
git add src/types/profile.ts src/features/profile/schemas.ts src/features/profile/actions.ts src/features/profile/ProfileForm.tsx
git commit -m "profile: add has_ac (air conditioning) field"
```

---

## Task 21: `RideFilters.tsx` + `filters.ts` + `rides/queries.ts` — `hasAc` filter

**Files:**
- Modify: `src/features/rides/filters.ts`
- Modify: `src/features/rides/RideFilters.tsx`
- Modify: `src/features/rides/queries.ts`

**Interfaces:**
- Produces: `RideSearchFilters.hasAc?: boolean`; both `buildRidesQuery` and `buildNearbyProvinceRidesQuery` filter on it.

**Design note:** `has_ac` lives on `profiles`, not `rides` — filtering rides by the driver's `has_ac` requires either a join or a pre-resolved id list, the same shape as the existing `femaleDriverOnly` filter (`resolveFemaleDriverRideIds`, which calls a dedicated RPC returning ride ids). Reuse that exact pattern rather than inventing a new one: `has_ac` is on the public `profiles` table (not `profiles_private`, unlike gender), so a direct `.from("rides").select("id").eq("driver_id", ...)`-style join is possible without needing a security-definer RPC at all — simpler than the gender case. Do it as a plain filtered subquery, not a new RPC.

- [x] **Step 1: `filters.ts`**

Add to `RideSearchFilters`:
```ts
  hasAc?: boolean
```

Add to `parseRideSearchParams`:
```ts
  const hasAc = firstValue(searchParams.hasAc)
```
and to the returned object:
```ts
    hasAc: hasAc === "1" ? true : undefined,
```

- [x] **Step 2: `rides/queries.ts` — resolve matching driver ids**

Add a helper mirroring `resolveFemaleDriverRideIds`'s shape but as a plain query (no RPC needed — `has_ac` is public):

```ts
// has_ac lives on profiles (public), not rides — unlike femaleDriverOnly
// (profiles_private.gender, needs a security-definer RPC to stay private),
// a plain join-by-id-list is enough here.
async function resolveHasAcRideIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: RideSearchFilters | undefined
): Promise<string[] | null> {
  if (!filters?.hasAc) {
    return null
  }
  const { data } = await supabase.from("profiles").select("id").eq("has_ac", true)
  const driverIds = (data as { id: string }[] | null)?.map((row) => row.id) ?? []
  if (driverIds.length === 0) {
    return []
  }
  const { data: rideRows } = await supabase.from("rides").select("id").in("driver_id", driverIds).eq("status", "active")
  return (rideRows as { id: string }[] | null)?.map((row) => row.id) ?? []
}
```

Wire it into both `getRides`'s call sites the same way `femaleDriverRideIds` already is — add a `hasAcRideIds` parameter to both `buildRidesQuery` and `buildNearbyProvinceRidesQuery`, computed once in `getRides` via `resolveHasAcRideIds(supabase, filters)`, and add:

```ts
  if (hasAcRideIds) {
    query = query.in("id", hasAcRideIds)
  }
```

to both functions, in the same position as the existing `femaleDriverRideIds` block. If both `femaleDriverRideIds` and `hasAcRideIds` are active at once, two separate `.in("id", ...)` calls on the same query builder — confirm this composes correctly with Supabase's query builder (it should, each `.in()` call ANDs with prior filters) by reading the Supabase JS client's own type signature for chained `.in()` calls, or by testing it directly if Docker/local Supabase is available.

- [x] **Step 3: `RideFilters.tsx`**

Mirror the `petsAllowed`/`smokingAllowed` pattern exactly, three places: the URL-serialization function (near line 42), the `useState` block (near line 81), and the checkbox JSX (near line 301):

```ts
  if (filters.hasAc) params.set("hasAc", "1")
```
```ts
  const [hasAc, setHasAc] = useState(initial.hasAc ?? false)
```
Add `hasAc` to both places the existing `petsAllowed` etc. appear in the filters object being built (lines ~99 and ~117).
```tsx
          <div className="flex items-center gap-2">
            <Checkbox id="filter-has-ac" checked={hasAc} onCheckedChange={(checked) => setHasAc(checked === true)} />
            <label htmlFor="filter-has-ac" className="text-sm">
              {t("hasAc")}
            </label>
          </div>
```

(Match the exact surrounding JSX structure of the `petsAllowed`/`smokingAllowed`/`vipOnly` checkboxes already in the file — read the real current file to copy the exact wrapper markup, className, and label association pattern rather than assuming the sketch above is pixel-exact.)

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 5: Commit**

```bash
git add src/features/rides/filters.ts src/features/rides/RideFilters.tsx src/features/rides/queries.ts
git commit -m "rides: add air-conditioning (has_ac) search filter"
```

---

## Task 22: `RideCard.tsx` — show AC badge

**Files:**
- Modify: `src/types/ride.ts`
- Modify: `src/features/rides/queries.ts`
- Modify: `src/features/rides/RideCard.tsx`

**Interfaces:**
- Consumes: `has_ac` must be added to `RIDE_WITH_DRIVER_SELECT`'s embedded `driver:profiles!rides_driver_id_fkey(...)` column list (currently `full_name, avatar_url, car_brand, car_model, car_plate` — read the real current string before editing, this plan's earlier investigation read it once).

- [x] **Step 1: Add `has_ac` to the embedded driver select**

In `src/features/rides/queries.ts`, find `RIDE_WITH_DRIVER_SELECT` and add `has_ac` to the driver's column list:

```ts
const RIDE_WITH_DRIVER_SELECT =
  "*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url, car_brand, car_model, car_plate, has_ac), poster:profiles!rides_posted_by_fkey(full_name, avatar_url)"
```

- [x] **Step 2: Add `has_ac` to `RideWithDriver`'s embedded driver type**

In `src/types/ride.ts`, add `has_ac: boolean` to the `driver` object shape in `RideWithDriver`.

- [x] **Step 3: Render it in `RideCard.tsx`**

Add a badge in the existing `{(ride.pets_allowed || ride.smoking_allowed) && (...)}` block (around line 66) — widen the condition to include AC and add the badge (use an appropriate icon already imported from `lucide-react` in this file, or add `Wind` or `Snowflake` to the existing import line):

```tsx
      {(ride.pets_allowed || ride.smoking_allowed || ride.driver?.has_ac) && (
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          {ride.pets_allowed && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="size-3" aria-hidden="true" /> {t("petsAllowed")}
            </Badge>
          )}
          {ride.smoking_allowed && (
            <Badge variant="outline" className="gap-1">
              <Cigarette className="size-3" aria-hidden="true" /> {t("smokingAllowed")}
            </Badge>
          )}
          {ride.driver?.has_ac && (
            <Badge variant="outline" className="gap-1">
              <Snowflake className="size-3" aria-hidden="true" /> {t("hasAc")}
            </Badge>
          )}
        </CardContent>
      )}
```

Add `Snowflake` to the existing `lucide-react` import at the top of the file.

- [x] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 5: Commit**

```bash
git add src/types/ride.ts src/features/rides/queries.ts src/features/rides/RideCard.tsx
git commit -m "rides: show AC badge on ride cards, embed has_ac in ride queries"
```

---

## Task 23: i18n + e2e — `has_ac`

**Files:**
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`
- Create: `e2e/has-ac-filter.spec.ts`

- [x] **Step 1: i18n — `Rides.form.hasAc` and `Rides.filters.hasAc` (or wherever `petsAllowed` lives for filters — grep to confirm the exact namespace `RideFilters.tsx`'s `t()` calls use, since `RideForm.tsx` and `RideFilters.tsx` may use different i18n namespaces for what look like the same word)**

Read both files' `useTranslations(...)` calls to confirm the exact namespace each uses for `t("petsAllowed")` (they may be the same namespace shared between form and filters, or two separate ones) — add `hasAc` to whichever namespace(s) `petsAllowed` already exists in, in all 3 locale files, matching that key's exact position pattern.

tr.json: `"hasAc": "Klimalı",`
en.json: `"hasAc": "Air Conditioned",`
ar.json (hamza/MSA check required — `مكيّف` is the standard MSA passive-participle adjective for "air-conditioned" (root ك-ي-ف, Form II مُكَيَّف, shortened orthography مكيّف with shadda), not a dialect word; verify no existing `ar.json` string already uses a different term for AC before introducing this one, for consistency): `"hasAc": "مكيّف",`

- [x] **Step 2: Validate and key-set parity**

Same discipline as every prior i18n task.

- [x] **Step 3: e2e spec**

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { createRide, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the has_ac search filter (0066_profile_has_ac.sql,
// resolveHasAcRideIds in src/features/rides/queries.ts): a ride whose
// driver has has_ac=false must not appear when the filter is active, and
// must appear when it's off.
test.describe.serial("air conditioning filter", () => {
  test.describe.configure({ retries: 1 })

  let driverEmail: string
  let driverContext: BrowserContext
  let driverPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverEmail = uniqueEmail("acDriver")
    driverContext = await browser.newContext()
    driverPage = await driverContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
  })

  test("driver without AC creates a ride; ride is hidden when the AC filter is on, visible when off", async () => {
    await signUpAndVerify(driverPage, driverEmail)

    rideId = await createRide(driverPage, {
      departureCity: "Trabzon",
      arrivalCity: "Rize",
      minutesAhead: 40,
      seatCount: 2,
      costShare: 60,
    })
    expect(rideId).toBeTruthy()

    // Confirm the driver's own profile really has has_ac unchecked by
    // default (no explicit opt-in during signUpAndVerify/createRide).
    await driverPage.goto("/rides")
    await driverPage.locator('[aria-labelledby="filter-has-ac-label"]').click()
    await driverPage.getByRole("button", { name: "Filtrele", exact: true }).click()
    await expect(driverPage.getByText("Trabzon")).not.toBeVisible()

    await driverPage.goto("/rides")
    await expect(driverPage.getByText("Trabzon")).toBeVisible()
  })
})
```

Before finalizing, read the real current `RideFilters.tsx` to confirm: (a) the exact `aria-labelledby` id the AC checkbox actually gets (Task 21's sketch used `filter-has-ac`, matching the existing `filter-pets-allowed`/`filter-vip-only` id convention — verify this survived implementation unchanged), and (b) the exact filter-submit button's accessible name (this plan guesses `"Filtrele"` — verify against the real current button, it may already be a different label or the filters may apply on every checkbox change with no explicit submit button at all, in which case remove that `.click()` line).

- [x] **Step 4: Typecheck, lint, list**

Run: `npx tsc --noEmit && npx eslint e2e/has-ac-filter.spec.ts && npx playwright test --list`
Expected: clean; spec appears.

- [x] **Step 5: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json e2e/has-ac-filter.spec.ts
git commit -m "has_ac: i18n copy + e2e filter coverage"
```

---

## Task 24: CO₂ savings calculation utility

**Files:**
- Create: `src/utils/co2-savings.ts`
- Create: `src/utils/co2-savings.test.ts`

**Interfaces:**
- Consumes: `getProvinceDistanceKm` (already exists, `src/utils/turkish-provinces-geo.ts`, exported).
- Produces: `estimateCo2SavingsKg(departureCity: TurkishProvince, arrivalCity: TurkishProvince, seatCount: number): number`.

**Design decision (formula, plan author's call — cite and label as an approximation, matching this codebase's own established honesty convention for `getProvinceDistanceKm`'s "kuş uçuşu" disclaimer):** average passenger car tailpipe emissions ≈ 170 g CO₂ per km (a commonly-cited average figure, e.g. EEA passenger car monitoring data puts new-car EU fleet average around 100-120 g/km but *in-use real-world* averages across the full vehicle fleet run meaningfully higher; 170 g/km is a defensible round mid-range estimate for a mixed real-world fleet, not a precise measured value — label it as such in the UI copy, don't present it as authoritative). Savings framing: compare "`seat_count + 1` people traveling together in one car" against "`seat_count + 1` people each driving separately" — the shared trip avoids `seat_count / (seat_count + 1)` of the total emissions that separate trips would have produced. This is the same relative-savings framing BlaBlaCar's own public CO₂ messaging uses (share of emissions avoided by combining trips), scaled to this app's own straight-line province-distance data.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"

import { estimateCo2SavingsKg } from "./co2-savings"

describe("estimateCo2SavingsKg", () => {
  it("returns 0 for a 1-seat booking (no additional passenger to share with)", () => {
    // distance × factor × (1 / (1+1)) is still > 0 mathematically, but the
    // point of "savings" is meaningless for a solo trip with no one else
    // sharing it — seatCount here means seats actually booked by OTHER
    // people sharing the ride with the driver, so 0 booked seats means 0 savings.
    expect(estimateCo2SavingsKg("Ankara", "İstanbul", 0)).toBe(0)
  })

  it("scales with distance and booked seat count", () => {
    const oneSeat = estimateCo2SavingsKg("Ankara", "İstanbul", 1)
    const twoSeats = estimateCo2SavingsKg("Ankara", "İstanbul", 2)
    expect(oneSeat).toBeGreaterThan(0)
    expect(twoSeats).toBeGreaterThan(oneSeat)
  })

  it("returns a rounded number of kg, not fractional grams", () => {
    const result = estimateCo2SavingsKg("Ankara", "İstanbul", 2)
    expect(Number.isInteger(result)).toBe(true)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/co2-savings.test.ts`
Expected: FAIL — module doesn't exist.

- [x] **Step 3: Implement**

```ts
import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// Approximate average real-world passenger car emissions — NOT a precise
// measured figure, a defensible round mid-range estimate (new-car EU fleet
// averages run lower, ~100-120g/km, but in-use fleet averages across older
// vehicles run higher; 170 is a commonly-cited round figure for the mixed
// real-world fleet). Label any UI copy using this as an estimate, never as
// an authoritative measurement — same honesty convention this codebase
// already applies to getProvinceDistanceKm's own "kuş uçuşu" (straight-line,
// not road distance) disclaimer.
const AVG_CAR_EMISSIONS_G_PER_KM = 170

// Framing: seatCount people are sharing ONE car with the driver instead of
// each driving separately (seatCount + 1 total people, 1 car instead of
// seatCount + 1 cars). The shared trip avoids seatCount / (seatCount + 1)
// of the total emissions that separate trips would have produced. Uses the
// same straight-line province-centroid distance as the existing
// "nearby province" search fallback — an approximation, not exact.
export function estimateCo2SavingsKg(departureCity: TurkishProvince, arrivalCity: TurkishProvince, seatCount: number): number {
  if (seatCount <= 0) {
    return 0
  }
  const distanceKm = getProvinceDistanceKm(departureCity, arrivalCity)
  const totalEmissionsGramsIfSeparate = distanceKm * AVG_CAR_EMISSIONS_G_PER_KM * (seatCount + 1)
  const savingsFraction = seatCount / (seatCount + 1)
  const savingsGrams = totalEmissionsGramsIfSeparate * savingsFraction
  return Math.round(savingsGrams / 1000)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/co2-savings.test.ts`
Expected: PASS, 3/3.

- [x] **Step 5: Commit**

```bash
git add src/utils/co2-savings.ts src/utils/co2-savings.test.ts
git commit -m "utils: add CO2 savings estimate (province-distance based, labeled as approximate)"
```

---

## Task 25: CO₂ savings display — ride detail page + ride card

**Files:**
- Modify: `src/app/rides/[id]/page.tsx`
- Modify: `src/features/rides/RideCard.tsx`

**Interfaces:**
- Consumes: `estimateCo2SavingsKg` (Task 24).

- [x] **Step 1: Ride detail page**

In `src/app/rides/[id]/page.tsx`, compute the estimate once near the other derived values (alongside `departureAt`/`posterName` etc.):

```ts
const co2SavingsKg = estimateCo2SavingsKg(ride.departure_city as TurkishProvince, ride.arrival_city as TurkishProvince, ride.seat_count)
```

Add imports: `import { estimateCo2SavingsKg } from "@/utils/co2-savings"` and `import type { TurkishProvince } from "@/utils/turkish-provinces"`.

Render it as a small info line — find a sensible spot near the existing ride details (departure/arrival/date/cost display) and add:

```tsx
{co2SavingsKg > 0 && (
  <p className="text-muted-foreground text-sm">{t("co2Savings", { kg: co2SavingsKg })}</p>
)}
```

- [x] **Step 2: Ride card**

In `src/features/rides/RideCard.tsx`, same computation and a compact badge/line in the `CardContent` grid (next to the existing seat-count/cost-share cells):

```tsx
const co2SavingsKg = estimateCo2SavingsKg(ride.departure_city as TurkishProvince, ride.arrival_city as TurkishProvince, ride.seat_count)
```

Add the same imports. Render conditionally (`co2SavingsKg > 0`) using the `t("co2SavingsShort", { kg: co2SavingsKg })` key (Task 26) — a shorter variant for the card's tighter layout than the detail page's full sentence.

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. Note `ride.departure_city`/`ride.arrival_city` are typed as plain `string` on `Ride` (per the DB CHECK-constraint-only validation noted in `0002_rides.sql`'s own comment — no enum at the DB level), so the `as TurkishProvince` casts above are necessary and match the same pattern already used elsewhere in this codebase for the same fields (grep `as RideFormInput\["departureCity"\]` in `RideForm.tsx` for the precedent) — this is a pre-existing, accepted type-safety gap in the codebase, not something to fix in this task.

- [x] **Step 4: Commit**

```bash
git add "src/app/rides/[id]/page.tsx" src/features/rides/RideCard.tsx
git commit -m "rides: display estimated CO2 savings on ride detail page and ride cards"
```

---

## Task 26: i18n — CO₂ savings copy

**Files:**
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

- [x] **Step 1: `RideDetailPage` namespace**

Confirmed via this plan's own investigation: `src/app/rides/[id]/page.tsx` already calls `getTranslations("RideDetailPage")` for both `generateMetadata` and the main component's `t`. Add `co2Savings` to that same namespace in all 3 files.

tr.json:
```json
    "co2Savings": "Bu yolculuk paylaşılarak yaklaşık {kg} kg CO₂ tasarrufu sağlanıyor (tahmini, kuş uçuşu mesafeye göre).",
```

en.json:
```json
    "co2Savings": "Sharing this ride saves an estimated {kg} kg of CO₂ (approximate, based on straight-line distance).",
```

ar.json (hamza/MSA check required — verify `تُوَفَّر` (passive imperfect, "is saved/spared") uses correct hamza-free spelling per its Form II passive conjugation pattern, and that `تقديري` (estimated/approximate) and `بخط مستقيم` (in a straight line) are genuine MSA, not dialect):
```json
    "co2Savings": "مشاركة هذه الرحلة تُوَفِّر ما يقارب {kg} كجم من ثاني أكسيد الكربون (تقديري، بحسب المسافة المستقيمة).",
```

- [x] **Step 2: `Rides.card` namespace — short variant for the card**

tr.json: `"co2SavingsShort": "~{kg} kg CO₂ tasarrufu",`
en.json: `"co2SavingsShort": "~{kg} kg CO₂ saved",`
ar.json: `"co2SavingsShort": "~{kg} كجم CO₂ موفَّر",`

- [x] **Step 3: Validate and key-set parity**

Same discipline as every prior i18n task.

- [x] **Step 4: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json
git commit -m "i18n: CO2 savings display copy (tr/en/ar)"
```

---

## Task 27: e2e — CO₂ display smoke check

**Files:**
- Modify: an existing spec that already creates and views a ride (do not create a new file for this — find a spec that already navigates to `/rides/[id]` after creating a known departure/arrival city pair, e.g. `e2e/booking-chat-review.spec.ts`, and add one assertion to an existing test rather than standing up a whole new serial journey just to check a display string).

**Interfaces:**
- Consumes: the exact `co2Savings`/`co2SavingsShort` i18n strings (Task 26) with a computed `{kg}` value for whichever city pair that spec already uses.

- [x] **Step 1: Identify the target spec and its city pair**

Read the chosen existing spec's ride-creation call (e.g. `createRide(driverPage, { departureCity: "...", arrivalCity: "...", seatCount: N, ... })`) to get the exact departure/arrival cities and seat count already in use.

- [x] **Step 2: Compute the expected value and add one assertion**

In a Node REPL or a scratch script, compute `estimateCo2SavingsKg(departureCity, arrivalCity, seatCount)` for that spec's real values (import the real function, don't hand-calculate) to get the exact expected `{kg}` integer. Add one assertion to an existing test in that spec, right after it already navigates to `/rides/${rideId}`:

```ts
await expect(passengerPage.getByText(`~${expectedKg} kg CO₂ tasarrufu`)).toBeVisible()
```

(adjust the exact text to match Task 26's real final Turkish copy and interpolation output — next-intl's `{kg}` interpolation syntax in the rendered DOM will be the literal number with no curly braces, confirm the exact rendered format by reading how other existing `t("...", { count: N })`-style interpolations in this same spec file are already asserted on, if any, and match that pattern).

- [x] **Step 3: Run and verify**

Run: `npx playwright test --list` to confirm the modified spec still parses; if Docker/local Supabase is available, run the actual spec and confirm the new assertion passes; if not, do the same static cross-check discipline as every other e2e task in this plan.

- [x] **Step 4: Commit**

```bash
git add <the modified spec file>
git commit -m "e2e: assert CO2 savings display renders the correct estimate"
```

---

## Task 28: Full verification pass

**Files:** none (verification only).

- [x] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 2: Full lint**

Run: `npx eslint .`
Expected: zero errors (pre-existing warnings elsewhere in the repo are fine; nothing new from this plan's files).

- [x] **Step 3: Full unit test suite**

Run: `npx vitest run`
Expected: all green, including the new `experienceLevel.test.ts` and `co2-savings.test.ts`, and the rewritten `bookings/actions.test.ts` `createBooking` tests.

- [x] **Step 4: Full e2e suite**

Run: `npx playwright test`
Expected: all green, including the 4 new specs from this plan (`cash-payment.spec.ts`, `instant-booking.spec.ts`, `has-ac-filter.spec.ts`, and the modified existing spec from Task 27) alongside every pre-existing spec (confirming none of this plan's changes broke an existing flow — in particular, re-run `double-booking.spec.ts` with specific attention: it exercises the exact seat-race-protection path Task 12's `create_booking` RPC now also guards atomically at request time, not just at approval time — confirm its assertions still hold with the new RPC-based `createBooking`).

- [x] **Step 5: Grep for leftover placeholder/TODO markers**

Run: `grep -rn "TODO\|FIXME\|not implemented" src/features/rides src/features/bookings src/features/profile src/features/reviews src/utils/co2-savings.ts e2e/cash-payment.spec.ts e2e/instant-booking.spec.ts e2e/has-ac-filter.spec.ts`
Expected: no matches introduced by this plan's own new/modified files.

- [x] **Step 6: Manual review checklist for the human**

Report explicitly on:
- Experience-level tier thresholds (Task 15) — plan author's design call, human should confirm the cutoffs (0 / 1-4 / 5-14 / 15+) match their intent before this ships broadly.
- CO₂ emission factor (170 g/km, Task 24) — plan author's design call, an approximation; human should confirm they're comfortable with the UI copy explicitly labeling it as such.
- The `_apply_booking_approval`/`update_own_profile` bodies actually redefined in Tasks 8/19 — confirm each implementer's static-verification report shows a real line-by-line diff against the true current migration file content, not an assumed match to this plan's text.
- Whether Docker/local Supabase was available during execution — if not, flag that no migration in this plan (`0064`/`0065`/`0066`) or e2e spec was ever actually run live, matching this same worktree's prior session experience where live CI caught 3 real bugs no static review found; recommend the same treatment here — push to a PR and let CI's real Playwright-against-real-Supabase run be the actual gate before merge, and expect to iterate against real CI failures, not treat a clean static review as sufficient on its own.

## Post-implementation verification (2026-08-14/15)

All 28 tasks implemented and committed (27 commits, `worktree-passenger-listings`, not yet pushed). Docker/local Supabase was brought up after the fact and every item above was actually verified live, not just statically:

- **`npx supabase db reset`**: all 66 migrations applied cleanly, including `0064_ride_payment_method.sql`, `0065_instant_booking.sql`, `0066_profile_has_ac.sql` — zero errors.
- **Schema verified directly via `psql`**: `rides.payment_method`, `rides.instant_booking`, `profiles.has_ac` columns exist with the expected types/defaults; `create_booking(p_ride_id uuid, p_seat_count integer)` and the 11-arg `update_own_profile` (…, `p_has_ac boolean`) exist with the exact signatures this plan specified.
- **Full e2e suite run live against the real local Supabase instance**: 33/33 tests passed across 9 spec files (`cash-payment` 2/2, `instant-booking` 1/1, `has-ac-filter` 1/1, `booking-chat-review` 8/8 — including the new CO₂-savings assertion rendering the real computed "119 kg" — `double-booking` 2/2 confirming the new atomic `create_booking` RPC didn't regress the seat-race protection, plus the full pre-existing regression suite: `new-features` 5/5, `passenger-listing` 5/5, `payment-review` 7/7, `settlement-ocr-auto-approval` 2/2). One flaky retry on a pre-existing realtime-chat timing test, unrelated to this plan's changes, passed on retry.
- **Experience-level thresholds and the CO₂ factor**: reviewed with the human — both confirmed as-is (0/1-4/5-14/15+ and 170 g/km), no code change needed.
- Docker/Supabase containers and the dev server were stopped again after verification; nothing was left running.

No bugs found live that static review missed, unlike this worktree's earlier sessions — the `_apply_booking_approval`/`update_own_profile` signature cross-checks against the real migration files during implementation caught what would otherwise have been the likely failure points.
