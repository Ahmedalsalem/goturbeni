import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // tesseract.js (src/lib/ocr.ts) spawns a worker_thread that loads its own
  // worker script/WASM/traineddata by file path at runtime — bundling it
  // (the default for server code) breaks that path resolution and the
  // worker never starts, so Tesseract.recognize() hangs forever. Marking it
  // external keeps it on Node's native require, unbundled.
  serverExternalPackages: ["tesseract.js"],
  // Removes the `X-Powered-By: Next.js` response header (minor info-disclosure hardening).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
