import * as Sentry from "@sentry/nextjs"

// Only error tracking — no performance tracing/session replay, not asked for
// and both carry their own separate Sentry quota.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  ignoreErrors: [
    // Facebook in-app browser's own JS bridge (navigation_performance_logger_android)
    // throws this when its native Java counterpart is already torn down — not our code.
    "Error invoking postMessage: Java object is gone",
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
