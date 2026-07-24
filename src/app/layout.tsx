import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import "./globals.css"

import { isRtlLocale } from "@/i18n/locale-config"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/sonner"
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister"
import { CookieConsent } from "@/components/CookieConsent"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export const viewport: Viewport = {
  themeColor: "#47a736",
}

const OG_LOCALES: Record<string, string> = { tr: "tr_TR", ar: "ar_AR" }

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, requestHeaders] = await Promise.all([getTranslations("Metadata"), getLocale(), headers()])
  const pathname = requestHeaders.get("x-pathname") ?? "/"

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("title"),
      template: `%s | ${t("title")}`,
    },
    description: t("description"),
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    verification: {
      google: "-SWAVn_J_lSQqKvNM_hchEBJJwdKVihOhVZzthdSipM",
    },
    alternates: {
      canonical: pathname,
      languages: {
        tr: pathname,
        ar: pathname,
        "x-default": pathname,
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: t("title"),
      locale: OG_LOCALES[locale] ?? "tr_TR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("title"),
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const dir = isRtlLocale(locale) ? "rtl" : "ltr"
  const t = await getTranslations("Nav")
  const tMeta = await getTranslations("Metadata")

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: tMeta("title"),
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        description: tMeta("description"),
        sameAs: [],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        name: tMeta("title"),
        url: SITE_URL,
        description: tMeta("description"),
        publisher: { "@id": `${SITE_URL}#organization` },
        inLanguage: locale,
      },
    ],
  }

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* Plain <script> tags, not next/script — next/script's beforeInteractive
          strategy only emits a <link rel="preload"> in the server-rendered HTML
          and injects the real tags client-side, invisible to Search Console's
          non-JS GA verification crawler. Native tags render literally in the
          initial HTML <head> so that check can find them. Placed inside an
          explicit <head> (merged by Next.js with the Metadata-generated head)
          because GA's site-ownership check requires the snippet to live in
          <head>, not <body>.

          gtag('config', ...) fires unconditionally (GSC's Analytics verification
          requires it in the raw page source), but Consent Mode v2 defaults
          analytics_storage to 'denied' first — GA runs in cookieless/modeled
          mode with no persistent identifiers until CookieConsent below calls
          gtag('consent', 'update', ...) after the user accepts, preserving the
          KVKK consent requirement for non-essential cookies. */}
      {GA_MEASUREMENT_ID && (
        <head>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                  'ad_storage': 'denied',
                  'ad_user_data': 'denied',
                  'ad_personalization': 'denied',
                  'analytics_storage': 'denied'
                });
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `,
            }}
          />
        </head>
      )}
      <body className="flex min-h-full flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <NextIntlClientProvider>
          <DirectionProvider direction={dir}>
            <a
              href="#main-content"
              className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-md px-4 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:start-4 focus-visible:ring-3"
            >
              {t("skipToContent")}
            </a>
            <Header />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <Footer />
            <Toaster position="top-center" />
            <ServiceWorkerRegister />
            <CookieConsent gaMeasurementId={GA_MEASUREMENT_ID} />
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
