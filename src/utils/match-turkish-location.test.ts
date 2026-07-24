import { describe, expect, it } from "vitest"

import { matchTurkishLocation } from "@/utils/match-turkish-location"

describe("matchTurkishLocation", () => {
  it("matches an exact province and district", () => {
    expect(matchTurkishLocation({ province: "İstanbul", town: "Kadıköy" })).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    })
  })

  it("matches despite case and Turkish diacritic casing differences", () => {
    // Naive .toLowerCase() would turn "İstanbul" into "i̇stanbul" (dotted i
    // followed by a combining dot above) and fail to equal "istanbul".
    expect(matchTurkishLocation({ province: "İSTANBUL", town: "KADIKÖY" })).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    })
    expect(matchTurkishLocation({ province: "ankara", town: "çankaya" })).toEqual({
      province: "Ankara",
      district: "Çankaya",
    })
  })

  it("returns null when the province does not match any of the 81 provinces", () => {
    expect(matchTurkishLocation({ province: "Nicosia", town: "Kyrenia" })).toBeNull()
    expect(matchTurkishLocation({})).toBeNull()
  })

  it("returns the province with a null district when the district candidate has no match", () => {
    expect(matchTurkishLocation({ province: "İstanbul", town: "Not A Real District" })).toEqual({
      province: "İstanbul",
      district: null,
    })
  })

  it("returns the province with a null district when no district-shaped field is present", () => {
    expect(matchTurkishLocation({ province: "İzmir" })).toEqual({
      province: "İzmir",
      district: null,
    })
  })

  it("falls back through state/city for the province and city_district/county/suburb for the district", () => {
    expect(matchTurkishLocation({ state: "Adana", city_district: "Seyhan" })).toEqual({
      province: "Adana",
      district: "Seyhan",
    })
    expect(matchTurkishLocation({ city: "Konya", county: "Meram" })).toEqual({
      province: "Konya",
      district: "Meram",
    })
    expect(matchTurkishLocation({ province: "Bursa", suburb: "Nilüfer" })).toEqual({
      province: "Bursa",
      district: "Nilüfer",
    })
  })

  it("prefers province over state/city when multiple candidates are present", () => {
    expect(matchTurkishLocation({ province: "İstanbul", state: "Ankara", town: "Kadıköy" })).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    })
  })
})
