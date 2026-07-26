"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion, type Variants } from "framer-motion"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { buttonVariants } from "@/components/ui/button"
import { RideFilters } from "@/features/rides/RideFilters"
import type { RideSearchFilters } from "@/features/rides/filters"
import { reverseGeocode } from "@/features/rides/reverse-geocode"
import { matchTurkishLocation } from "@/utils/match-turkish-location"
import { logError } from "@/lib/logger"

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
}

const DEFAULT_FILTERS: RideSearchFilters = { sort: "date_asc" }
const GEO_PROMPT_STORAGE_KEY = "geo-prompt-shown"

export function HomeHero({ isFemaleUser }: { isFemaleUser: boolean }) {
  const t = useTranslations("HomePage")
  const locale = useLocale()
  const [geoFilters, setGeoFilters] = useState<RideSearchFilters | null>(null)

  useEffect(() => {
    // Calling getCurrentPosition straight from a page-load effect (no user
    // gesture) is exactly the pattern Chrome's permission heuristics punish:
    // sites that request location without interaction get silently switched
    // to the quiet/auto-denied UI instead of the real prompt, which looked
    // like "it always rejects" from the outside. Showing a toast first and
    // only calling getCurrentPosition from its button's onClick makes the
    // request a genuine user gesture again.
    if (!("geolocation" in navigator)) return
    if (window.localStorage.getItem(GEO_PROMPT_STORAGE_KEY)) return
    window.localStorage.setItem(GEO_PROMPT_STORAGE_KEY, "1")

    function requestLocation() {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          reverseGeocode(result.coords.latitude, result.coords.longitude, locale)
            .then((address) => {
              const matched = matchTurkishLocation(address)
              if (matched) {
                setGeoFilters({ sort: "date_asc", from: matched.province, fromDistrict: matched.district ?? undefined })
              }
            })
            .catch((error) => logError(error, "home.geoPrefill"))
        },
        () => {
          // Denied or unavailable — fine, the search form just stays empty.
        },
        { timeout: 10000 }
      )
    }

    toast(t("geoPrompt.message"), {
      duration: 15000,
      action: { label: t("geoPrompt.accept"), onClick: requestLocation },
    })
    // Runs once on mount only; re-running on `locale`/`t` change would re-fire
    // the geolocation prompt logic mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center sm:py-28"
    >
      <motion.h1 variants={item} className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        {t("heroTitle")}
      </motion.h1>

      <motion.p variants={item} className="text-muted-foreground max-w-xl text-lg leading-relaxed text-balance">
        {t("heroSubtitle")}
      </motion.p>

      <motion.div variants={item} className="w-full max-w-3xl text-start">
        <RideFilters
          key={geoFilters ? "geo" : "default"}
          initial={geoFilters ?? DEFAULT_FILTERS}
          showSort={false}
          variant="hero"
          isFemaleUser={isFemaleUser}
        />
      </motion.div>

      <motion.div variants={item} className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <Link href="/rides" className={buttonVariants({ variant: "ghost" })}>
          {t("ctaFindRide")}
        </Link>
        <Link href="/create-ride" className={buttonVariants({ variant: "ghost" })}>
          {t("ctaOfferRide")}
        </Link>
      </motion.div>
    </motion.div>
  )
}
