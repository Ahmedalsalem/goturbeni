import * as Sentry from "@sentry/nextjs"

// Next.js runtime instrumentation hook. See src/lib/logger.ts for the
// request-level error logging choke point that also reports to Sentry.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError = Sentry.captureRequestError
