// This app has a single target audience/timezone (Turkey) but runs across
// environments with different runtime-default timezones — the local dev
// server inherits the developer's machine (often already Europe/Istanbul),
// while Vercel's production runtime defaults to UTC. Parsing a wall-clock
// "YYYY-MM-DDTHH:MM" string with the bare `Date` constructor uses whichever
// timezone the *executing* runtime defaults to, which silently produced
// departure_time values off by the UTC+3 gap depending on where the code
// ran. Every construction/extraction of a ride's wall-clock date or time
// must go through these helpers instead, so it's always Europe/Istanbul
// regardless of runtime.
//
// Turkey has used a fixed UTC+3 offset with no DST since 2016, so a literal
// "+03:00" offset (rather than IANA zone math) is sufficient and exact.
const ISTANBUL_UTC_OFFSET = "+03:00"

// Builds an absolute instant from a date-input value ("YYYY-MM-DD") and a
// time-input value ("HH:MM"), both interpreted as Europe/Istanbul wall-clock
// time — regardless of the runtime's own default timezone.
export function parseIstanbulDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${ISTANBUL_UTC_OFFSET}`)
}

// Converts a stored timestamp back to a date-input value ("YYYY-MM-DD") in
// Europe/Istanbul wall-clock time — regardless of the browser's local
// timezone (relevant for prefilling the ride edit form).
export function toIstanbulDateInputValue(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

// Converts a stored timestamp back to a time-input value ("HH:MM") in
// Europe/Istanbul wall-clock time — regardless of the browser's local
// timezone (relevant for prefilling the ride edit form).
export function toIstanbulTimeInputValue(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))
}
