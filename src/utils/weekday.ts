// Turns a Postgres extract(dow)-style weekday number (0=Sunday..6=Saturday,
// see ride_series.weekday) into a localized display name, without hardcoding
// a name list per locale — 2023-01-01 is a known Sunday, so adding `weekday`
// days to it and formatting always lands on the right day name.
const REFERENCE_SUNDAY_UTC = Date.UTC(2023, 0, 1)

export function getWeekdayLabel(weekday: number, locale: string): string {
  const date = new Date(REFERENCE_SUNDAY_UTC + weekday * 86_400_000)
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date)
}
