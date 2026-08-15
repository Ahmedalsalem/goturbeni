export type ExperienceLevel = "new" | "active" | "experienced" | "ambassador"

// Tier thresholds are a product/design choice, not derived from any
// external spec — displayed via i18n keys ExperienceLevel.<level>. Purely a
// label layered on the completed-ride count that already exists
// (getDriverCompletedRideCount, src/features/rides/queries.ts) — no new
// table, no new query.
export function getExperienceLevel(completedRideCount: number): ExperienceLevel {
  if (completedRideCount >= 15) return "ambassador"
  if (completedRideCount >= 5) return "experienced"
  if (completedRideCount >= 1) return "active"
  return "new"
}
