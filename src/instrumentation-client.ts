import * as Sentry from "@sentry/nextjs"

// Only error tracking — no performance tracing/session replay, not asked for
// and both carry their own separate Sentry quota.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
