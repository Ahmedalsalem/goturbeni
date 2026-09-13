import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  ignoreErrors: [
    // Node's own HTTP server throws this (message: "aborted") when a client
    // disconnects mid-request (closed tab, flaky mobile connection, a bot
    // giving up) — happens outside application code, before/during response
    // streaming, and isn't something a try/catch here can prevent or fix.
    // Seen live: 43 occurrences over a month, all "Unhandled" from
    // abortIncoming(node:_http_server), pure infra noise.
    "aborted",
  ],
})
