// Next.js runtime instrumentation hook — this is where a future monitoring/
// APM service (e.g. Sentry.init(), an OpenTelemetry SDK) would be
// initialized once one is chosen. Intentionally empty for now. See
// src/lib/logger.ts for the request-level error logging choke point that
// such a service would also plug into.
export async function register() {}
