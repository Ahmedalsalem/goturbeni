import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^http/, "ws");

// Scripts still need 'unsafe-inline' (the GA/Meta consent bootstraps and
// JSON-LD blocks in layout.tsx and Next's own inline runtime aren't
// nonce'd), so this mainly locks down where the page can load from, send
// data to, and be framed by. 'unsafe-eval' is dev-only (React's dev build
// and Turbopack HMR need it). img-src stays open to https: for OSM tiles,
// Supabase avatars and the analytics pixels.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://*.ingest.de.sentry.io https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://nominatim.openstreetmap.org`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  `form-action 'self' ${supabaseUrl} https://accounts.google.com`,
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Removes the `X-Powered-By: Next.js` response header (minor info-disclosure hardening).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation=(self) — not (): the app's own "use my location"
          // buttons and the homepage's first-visit location prompt both need
          // it; blocking geolocation entirely (as a copy-pasted hardening
          // default typically does) silently broke both features.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: "novaro-digital-studio",
  project: "javascript-nextjs-goturbeni",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
