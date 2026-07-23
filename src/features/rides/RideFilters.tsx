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
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxTriggerGroup,
} from "@/components/ui/combobox"
import { TURKISH_PROVINCES, type TurkishProvince } from "@/utils/turkish-provinces"
import { TURKISH_PROVINCE_DISTRICTS } from "@/utils/turkish-districts"
import { RIDE_SORT_OPTIONS, type RideSearchFilters, type RideSort } from "@/features/rides/filters"

// Sort is applied instantly (no confirmation needed); from/to/date wait for
// the search button so an in-progress date pick doesn't navigate mid-edit.
function buildQueryString(filters: Partial<RideSearchFilters>): string {
  const params = new URLSearchParams()
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.fromDistrict) params.set("fromDistrict", filters.fromDistrict)
  if (filters.toDistrict) params.set("toDistrict", filters.toDistrict)
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
  const [fromDistrict, setFromDistrict] = useState<string | null>(initial.fromDistrict ?? null)
  const [toDistrict, setToDistrict] = useState<string | null>(initial.toDistrict ?? null)
  const [date, setDate] = useState(initial.date ?? "")

  const fromDistricts = from ? (TURKISH_PROVINCE_DISTRICTS[from] ?? []) : []
  const toDistricts = to ? (TURKISH_PROVINCE_DISTRICTS[to] ?? []) : []

  function onSearch() {
    router.push(
      buildQueryString({
        from: from ?? undefined,
        to: to ?? undefined,
        fromDistrict: fromDistrict ?? undefined,
        toDistrict: toDistrict ?? undefined,
        date: date || undefined,
        sort: initial.sort,
      })
    )
  }

  function onSortChange(sort: RideSort) {
    router.push(
      buildQueryString({
        from: from ?? undefined,
        to: to ?? undefined,
        fromDistrict: fromDistrict ?? undefined,
        toDistrict: toDistrict ?? undefined,
        date: date || undefined,
        sort,
      }),
      { scroll: false }
    )
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
        <Combobox
          items={TURKISH_PROVINCES}
          value={from}
          onValueChange={(value) => {
            setFrom(value as TurkishProvince | null)
            setFromDistrict(null)
          }}
        >
          <ComboboxInputGroup>
            <FieldIcon icon={MapPin} />
            <ComboboxInput id="filter-from" aria-label={t("fromLabel")} placeholder={t("allCities")} className="ps-9" />
            <ComboboxTriggerGroup>
              <ComboboxClear aria-label={t("clearSelection")} />
              <ComboboxTrigger aria-label={t("fromLabel")} />
            </ComboboxTriggerGroup>
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
            <ComboboxList>{(city: string) => <ComboboxItem key={city} value={city}>{city}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <Field className="sm:w-48">
        <FieldLabel htmlFor="filter-from-district">{t("fromDistrictLabel")}</FieldLabel>
        <Combobox items={fromDistricts} value={fromDistrict} onValueChange={setFromDistrict} disabled={fromDistricts.length === 0}>
          <ComboboxInputGroup>
            <FieldIcon icon={MapPin} />
            <ComboboxInput
              id="filter-from-district"
              aria-label={t("fromDistrictLabel")}
              placeholder={from ? t("allDistricts") : t("selectCityFirst")}
              className="ps-9"
            />
            <ComboboxTriggerGroup>
              <ComboboxClear aria-label={t("clearSelection")} />
              <ComboboxTrigger aria-label={t("fromDistrictLabel")} />
            </ComboboxTriggerGroup>
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
            <ComboboxList>
              {(district: string) => (
                <ComboboxItem key={district} value={district}>
                  {district}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <Field className="sm:w-48">
        <FieldLabel htmlFor="filter-to">{t("toLabel")}</FieldLabel>
        <Combobox
          items={TURKISH_PROVINCES}
          value={to}
          onValueChange={(value) => {
            setTo(value as TurkishProvince | null)
            setToDistrict(null)
          }}
        >
          <ComboboxInputGroup>
            <FieldIcon icon={MapPin} />
            <ComboboxInput id="filter-to" aria-label={t("toLabel")} placeholder={t("allCities")} className="ps-9" />
            <ComboboxTriggerGroup>
              <ComboboxClear aria-label={t("clearSelection")} />
              <ComboboxTrigger aria-label={t("toLabel")} />
            </ComboboxTriggerGroup>
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
            <ComboboxList>{(city: string) => <ComboboxItem key={city} value={city}>{city}</ComboboxItem>}</ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <Field className="sm:w-48">
        <FieldLabel htmlFor="filter-to-district">{t("toDistrictLabel")}</FieldLabel>
        <Combobox items={toDistricts} value={toDistrict} onValueChange={setToDistrict} disabled={toDistricts.length === 0}>
          <ComboboxInputGroup>
            <FieldIcon icon={MapPin} />
            <ComboboxInput
              id="filter-to-district"
              aria-label={t("toDistrictLabel")}
              placeholder={to ? t("allDistricts") : t("selectCityFirst")}
              className="ps-9"
            />
            <ComboboxTriggerGroup>
              <ComboboxClear aria-label={t("clearSelection")} />
              <ComboboxTrigger aria-label={t("toDistrictLabel")} />
            </ComboboxTriggerGroup>
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
            <ComboboxList>
              {(district: string) => (
                <ComboboxItem key={district} value={district}>
                  {district}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
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
              <SelectTrigger id="filter-sort" aria-label={t("sortLabel")} className="w-full ps-9">
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
