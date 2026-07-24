import * as Sentry from "@sentry/nextjs"

// Single choke point for error logging, usable from both server actions and
// client error boundaries.
export function logError(error: unknown, context: string): void {
  console.error(`[${context}]`, error)
  Sentry.captureException(error, { extra: { context } })
}
