"use client"

import Link from "next/link"
import { motion, type Variants } from "framer-motion"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import { RideFilters } from "@/features/rides/RideFilters"
import type { RideSearchFilters } from "@/features/rides/filters"

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
}

const DEFAULT_FILTERS: RideSearchFilters = { sort: "date_asc" }

export function HomeHero() {
  const t = useTranslations("HomePage")

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
        <RideFilters initial={DEFAULT_FILTERS} showSort={false} variant="hero" />
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
