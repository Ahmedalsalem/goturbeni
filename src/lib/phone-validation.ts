import { isValidPhoneNumber } from "libphonenumber-js"

// Defaults to Turkish numbering when no "+<country code>" prefix is given
// (this platform's primary market); a leading "+" is parsed using its own
// country code regardless, so non-Turkish numbers (relevant for the
// Arabic-speaking locale) still validate correctly. Shared by the signup
// (required phone) and profile (optional phone) schemas.
export function isValidTrPhoneNumber(value: string): boolean {
  return isValidPhoneNumber(value, "TR")
}
