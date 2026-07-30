# Load test

Node scripts using `@supabase/supabase-js` directly (already a project
dependency; no k6/new tooling added — see PR/report for why this was chosen
over k6). They talk to a local Supabase instance and a local Next.js dev
server, the same two processes `playwright.config.ts` / `e2e/` already
assume are running for e2e tests.

**Run 2026-07-31** (Docker Desktop + `npx supabase start`, `npm run dev`):
`last-seat-race.mjs` and `cancel-approve-race.mjs` both PASS (no overbooking,
no lost update). `browse-load.mjs` completed 450/450 requests but with
p50≈14.9s / p95≈16.6s latency against `next dev` — not yet re-measured
against a production build (`next build && next start`), so it's unclear how
much of that is dev-mode compilation overhead vs. a real bottleneck.

Note: the hardcoded `LOCAL_ANON_KEY`/`LOCAL_SERVICE_ROLE_KEY` in
`lib/config.mjs` did not match the demo keys this Supabase CLI version
(2.109.1) actually issues (`npx supabase status -o env`) — the scripts had to
be run with `LOAD_TEST_SUPABASE_ANON_KEY`/`LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY`
overrides pointing at the current instance's keys. Worth updating the
hardcoded fallbacks if this keeps drifting across CLI versions.

## How to run (once Docker/WSL is available)

```
npx supabase start          # starts local Supabase on :54321 (supabase/config.toml)
npm run dev                  # in another terminal, starts the app on :3000

node loadtest/browse-load.mjs [vus] [requestsPerVU]        # default 75 VUs x 6 requests
node loadtest/last-seat-race.mjs [concurrentApprovals]      # default 20
node loadtest/cancel-approve-race.mjs [iterations]          # default 30
```

Each script prints a pass/fail summary and exits non-zero on failure, so
they're CI-job-shaped if this ever runs somewhere with Docker.

## Safety

`lib/config.mjs` defaults to `http://127.0.0.1:54321` / `http://localhost:3000`
(the Supabase CLI's local demo keys, not production credentials — `.env.local`
is never read) and hard-refuses to run against any host that isn't
`localhost`/`127.0.0.1`, even if `LOAD_TEST_SUPABASE_URL` is overridden. Never
set that override to the production project URL.

## What each script does

- `browse-load.mjs` — N concurrent virtual users hitting `GET /` and
  `GET /rides` (with province/sort filters), reporting p50/p95/p99 latency
  and throughput.
- `last-seat-race.mjs` — creates a 1-seat ride and N pending bookings for it,
  then fires all N `approve_booking` RPC calls at once. Asserts exactly one
  succeeds — this is the claim in `supabase/migrations/0017_booking_payment_flow.sql`'s
  `approve_booking` (locks both booking and ride rows `for update` before
  checking `available_seats`).
- `cancel-approve-race.mjs` — sets up a 2-seat ride with one approved
  booking and one pending booking, then fires `cancel_booking` (crediting a
  seat) and `approve_booking` (consuming a seat) at the same instant,
  repeated across iterations, checking the seat-count invariant holds after
  every interleaving. This targets the specific gap flagged in the
  concurrency audit: `cancel_booking` (`supabase/migrations/0041_no_show_and_late_cancellation.sql`)
  doesn't take an explicit `for update` lock on the `rides` row before
  crediting a seat back, unlike `approve_booking`.
