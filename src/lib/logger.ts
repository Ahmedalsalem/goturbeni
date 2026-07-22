// Single choke point for error logging, usable from both server actions and
// client error boundaries. Swap the console.error call below for e.g.
// Sentry.captureException(error, { extra: { context } }) once a monitoring
// service is wired up — call sites don't need to change.
export function logError(error: unknown, context: string): void {
  console.error(`[${context}]`, error)
}
