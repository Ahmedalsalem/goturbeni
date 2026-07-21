"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowUpDown, CalendarDays, MapPin, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TURKISH_PROVINCES, type TurkishProvince } from "@/utils/turkish-provinces"
import { RIDE_SORT_OPTIONS, type RideSearchFilters, type RideSort } from "@/features/rides/filters"

// Sort is applied instantly (no confirmation needed); from/to/date wait for
// the search button so an in-progress date pick doesn't navigate mid-edit.
function buildQueryString(filters: Partial<RideSearchFilters>): string {
  const params = new URLSearchParams()
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.date) params.set("date", filters.date)
  if (filters.sort && filters.sort !== "date_asc") params.set("sort", filters.sort)
  const qs = params.toString()
  return qs ? `/rides?${qs}` : "/rides"
}

// Small leading-icon wrapper shared by the city/date fields — keeps the
// icon visually anchored regardless of which control (Select vs Input) sits
// inside, without needing icon-slot support in either primitive.
function FieldIcon({ icon: Icon }: { icon: typeof MapPin }) {
  return (
    <Icon
      className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 z-10 size-4 -translate-y-1/2"
      aria-hidden="true"
    />
  )
}

export function RideFilters({
  initial,
  showSort = true,
  variant = "bar",
}: {
  initial: RideSearchFilters
  showSort?: boolean
  variant?: "hero" | "bar"
}) {
  const t = useTranslations("RidesPage.filters")
  const router = useRouter()

  const [from, setFrom] = useState<TurkishProvince | null>(initial.from ?? null)
  const [to, setTo] = useState<TurkishProvince | null>(initial.to ?? null)
  const [date, setDate] = useState(initial.date ?? "")

  function onSearch() {
    router.push(buildQueryString({ from: from ?? undefined, to: to ?? undefined, date: date || undefined, sort: initial.sort }))
  }

  function onSortChange(sort: RideSort) {
    router.push(buildQueryString({ from: from ?? undefined, to: to ?? undefined, date: date || undefined, sort }), { scroll: false })
  }

  const isHero = variant === "hero"

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end",
        isHero
          ? "rounded-2xl border border-black/[0.03] bg-card p-4 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18)] sm:p-5 dark:border-white/5"
          : "border-border bg-card rounded-2xl border p-4"
      )}
    >
      <Field className="sm:w-48">
        <FieldLabel htmlFor="filter-from">{t("fromLabel")}</FieldLabel>
        <div className="relative">
          <FieldIcon icon={MapPin} />
          <Select value={from} onValueChange={(value) => setFrom(value as TurkishProvince | null)}>
            <SelectTrigger id="filter-from" className="w-full ps-9">
              <SelectValue placeholder={t("allCities")} />
            </SelectTrigger>
            <SelectContent>
              {TURKISH_PROVINCES.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>

      <Field className="sm:w-48">
        <FieldLabel htmlFor="filter-to">{t("toLabel")}</FieldLabel>
        <div className="relative">
          <FieldIcon icon={MapPin} />
          <Select value={to} onValueChange={(value) => setTo(value as TurkishProvince | null)}>
            <SelectTrigger id="filter-to" className="w-full ps-9">
              <SelectValue placeholder={t("allCities")} />
            </SelectTrigger>
            <SelectContent>
              {TURKISH_PROVINCES.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Field>

      <Field className="sm:w-44">
        <FieldLabel htmlFor="filter-date">{t("dateLabel")}</FieldLabel>
        <div className="relative">
          <FieldIcon icon={CalendarDays} />
          <Input id="filter-date" type="date" className="ps-9" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </Field>

      {showSort && (
        <Field className="sm:w-52">
          <FieldLabel htmlFor="filter-sort">{t("sortLabel")}</FieldLabel>
          <div className="relative">
            <FieldIcon icon={ArrowUpDown} />
            <Select value={initial.sort} onValueChange={(value) => onSortChange(value as RideSort)}>
              <SelectTrigger id="filter-sort" className="w-full ps-9">
                <SelectValue>{(value: RideSort) => t(`sort.${value}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RIDE_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`sort.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
      )}

      <Button onClick={onSearch} size={isHero ? "lg" : "default"} className="sm:w-fit">
        <Search className="size-4" aria-hidden="true" /> {t("searchCta")}
      </Button>
    </div>
  )
}
