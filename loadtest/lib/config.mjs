// Resolves the Supabase connection this load test will hit. Deliberately
// does NOT read .env.local — that file holds this project's real production
// credentials (see CLAUDE.md constraints), and a load test must never be
// able to point at them by accident (e.g. an inherited shell env or a
// forgotten `dotenv -e .env.local` wrapper).
//
// Defaults to `npx supabase start`'s local API port (supabase/config.toml,
// [api] port = 54321) and the fixed demo anon/service-role keys the
// Supabase CLI issues for every local project (they're derived from the
// well-known local-dev JWT secret baked into the CLI itself, not a secret
// tied to this project — safe to keep in source).
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3Njk2MDAsImV4cCI6MTc5OTUzNjAwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTYwMCwiZXhwIjoxNzk5NTM2MDAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"

export const SUPABASE_URL = process.env.LOAD_TEST_SUPABASE_URL || "http://127.0.0.1:54321"
export const SUPABASE_ANON_KEY = process.env.LOAD_TEST_SUPABASE_ANON_KEY || LOCAL_ANON_KEY
export const SUPABASE_SERVICE_ROLE_KEY = process.env.LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY || LOCAL_SERVICE_ROLE_KEY
export const APP_URL = process.env.LOAD_TEST_APP_URL || "http://localhost:3000"

// Hard safety rail, independent of the above defaults: refuse to run against
// anything that isn't obviously a local instance, no matter how the env vars
// above were set. This is the one check that must never be bypassed.
function assertLocal(url, label) {
  let host
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`${label}="${url}" is not a valid URL`)
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Refusing to run: ${label}="${url}" does not point at localhost/127.0.0.1. ` +
        `This load test must only ever run against a local \`npx supabase start\` instance ` +
        `and a local \`npm run dev\` server — never against production.`
    )
  }
}

assertLocal(SUPABASE_URL, "LOAD_TEST_SUPABASE_URL")
assertLocal(APP_URL, "LOAD_TEST_APP_URL")
