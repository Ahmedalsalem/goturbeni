"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocale, useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { createRide, updateRide } from "@/features/rides/actions"
import { LocationPicker } from "@/features/rides/LocationPicker"
import {
  buildRideSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type RideFormInput,
  type RideFormValues,
} from "@/features/rides/schemas"
import { estimateCostSharePerSeat } from "@/utils/cost-estimate"
import { TURKISH_PROVINCES } from "@/utils/turkish-provinces"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { TURKISH_PROVINCE_DISTRICTS } from "@/utils/turkish-districts"
import { toIstanbulDateInputValue, toIstanbulTimeInputValue } from "@/utils/istanbul-time"
import type { Ride } from "@/types/ride"

export function RideForm({ ride }: { ride?: Ride }) {
  const t = useTranslations("Rides.form")
  const tValidation = useTranslations("Rides.validation")
  const locale = useLocale()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RideFormInput, unknown, RideFormValues>({
    resolver: zodResolver(buildRideSchema(tValidation)),
    // The city/district Comboboxes are controlled (Controller passes `value`
    // explicitly), so they need a defined value from the first render —
    // leaving them as `undefined` on create flips Base UI's Combobox from
    // uncontrolled to controlled after the first selection and triggers a
    // React warning.
    defaultValues: {
      postedByRole: ride?.posted_by_role ?? "driver",
      departureCity: (ride?.departure_city as RideFormInput["departureCity"]) ?? ("" as RideFormInput["departureCity"]),
      arrivalCity: (ride?.arrival_city as RideFormInput["arrivalCity"]) ?? ("" as RideFormInput["arrivalCity"]),
      departureDistrict: ride?.departure_district ?? "",
      arrivalDistrict: ride?.arrival_district ?? "",
      departureDate: ride ? toIstanbulDateInputValue(ride.departure_time) : "",
      departureTime: ride ? toIstanbulTimeInputValue(ride.departure_time) : "",
      seatCount: ride?.seat_count ?? MIN_SEAT_COUNT,
      costShare: ride?.cost_share ?? 0,
      description: ride?.description ?? undefined,
      petsAllowed: ride?.pets_allowed ?? false,
      smokingAllowed: ride?.smoking_allowed ?? false,
      vipSolo: ride?.vip_solo ?? false,
      paymentMethod: ride?.payment_method ?? "bank_transfer",
      instantBooking: ride?.instant_booking ?? false,
      repeatWeekly: false,
    },
  })

  // District options narrow to whichever city is currently selected; reset
  // the district whenever its city changes since a district from the
  // previous city is no longer valid (see schemas.ts's districtInvalid check).
  const departureCity = watch("departureCity")
  const arrivalCity = watch("arrivalCity")
  const postedByRole = watch("postedByRole")
  const isPassengerMode = postedByRole === "passenger"
  const departureDistricts = departureCity ? (TURKISH_PROVINCE_DISTRICTS[departureCity] ?? []) : []
  const arrivalDistricts = arrivalCity ? (TURKISH_PROVINCE_DISTRICTS[arrivalCity] ?? []) : []
  // seatCount is RideFormInput's raw (pre-z.coerce) field — react-hook-form
  // hands back whatever the number input currently holds, typed `unknown`
  // until the resolver's z.coerce.number() runs on submit.
  const seatCountValue = Number(watch("seatCount"))
  // A first-time poster has no idea what to charge — this is a rough,
  // clearly-labeled suggestion (cost-estimate.ts), never auto-filled without
  // the explicit click below, so a driver who already knows their route's
  // real cost isn't second-guessed by it.
  // departureCity !== arrivalCity: the schema already rejects a same-city
  // ride on submit (sameCities), but while the user is still mid-selection
  // (e.g. both fields briefly pointing at the same province) the live hint
  // would otherwise show a nonsensical "~0 ₺" for a moment.
  const estimatedCostShare =
    departureCity && arrivalCity && departureCity !== arrivalCity && Number.isFinite(seatCountValue) && seatCountValue > 0
      ? estimateCostSharePerSeat(departureCity, arrivalCity, seatCountValue)
      : null

  async function onSubmit(values: RideFormValues) {
    setServerError(null)
    const result = ride ? await updateRide(ride.id, values) : await createRide(values)
    if (result?.error) {
      setServerError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        {!ride && (
          <Field>
            <FieldLabel>{t("postedByRoleLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={postedByRole === "driver" ? "default" : "outline"}
                onClick={() => setValue("postedByRole", "driver")}
              >
                {t("iAmDriver")}
              </Button>
              <Button
                type="button"
                variant={postedByRole === "passenger" ? "default" : "outline"}
                onClick={() => setValue("postedByRole", "passenger")}
              >
                {t("iAmPassenger")}
              </Button>
            </div>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="departureCity">{t("departureCity")}</FieldLabel>
            <Controller
              control={control}
              name="departureCity"
              render={({ field }) => (
                <Combobox
                  items={TURKISH_PROVINCES}
                  value={field.value || null}
                  itemToStringLabel={(city) => getProvinceDisplayName(city, locale)}
                  onValueChange={(value) => {
                    field.onChange(value ?? "")
                    setValue("departureDistrict", "")
                  }}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput
                      id="departureCity"
                      placeholder={t("selectCity")}
                      aria-invalid={!!errors.departureCity}
                      aria-describedby={errors.departureCity ? "departureCity-error" : undefined}
                    />
                    <ComboboxTriggerGroup>
                      <ComboboxClear aria-label={t("clearSelection")} />
                      <ComboboxTrigger aria-label={t("departureCity")} />
                    </ComboboxTriggerGroup>
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
                    <ComboboxList>
                      {(city: string) => (
                        <ComboboxItem key={city} value={city}>
                          {getProvinceDisplayName(city, locale)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            />
            <LocationPicker
              onLocationResolved={(province, district) => {
                setValue("departureCity", province)
                setValue("departureDistrict", district ?? "")
              }}
            />
            {errors.departureCity && <FieldError id="departureCity-error" errors={[{ message: errors.departureCity.message }]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="arrivalCity">{t("arrivalCity")}</FieldLabel>
            <Controller
              control={control}
              name="arrivalCity"
              render={({ field }) => (
                <Combobox
                  items={TURKISH_PROVINCES}
                  value={field.value || null}
                  itemToStringLabel={(city) => getProvinceDisplayName(city, locale)}
                  onValueChange={(value) => {
                    field.onChange(value ?? "")
                    setValue("arrivalDistrict", "")
                  }}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput
                      id="arrivalCity"
                      placeholder={t("selectCity")}
                      aria-invalid={!!errors.arrivalCity}
                      aria-describedby={errors.arrivalCity ? "arrivalCity-error" : undefined}
                    />
                    <ComboboxTriggerGroup>
                      <ComboboxClear aria-label={t("clearSelection")} />
                      <ComboboxTrigger aria-label={t("arrivalCity")} />
                    </ComboboxTriggerGroup>
                  </ComboboxInputGroup>
                  <ComboboxContent>
                    <ComboboxEmpty>{t("noResults")}</ComboboxEmpty>
                    <ComboboxList>
                      {(city: string) => (
                        <ComboboxItem key={city} value={city}>
                          {getProvinceDisplayName(city, locale)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              )}
            />
            <LocationPicker
              onLocationResolved={(province, district) => {
                setValue("arrivalCity", province)
                setValue("arrivalDistrict", district ?? "")
              }}
            />
            {errors.arrivalCity && <FieldError id="arrivalCity-error" errors={[{ message: errors.arrivalCity.message }]} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="departureDistrict">
              {t("departureDistrict")} <span className="text-muted-foreground font-normal">{t("optional")}</span>
            </FieldLabel>
            <Controller
              control={control}
              name="departureDistrict"
              render={({ field }) => (
                <Combobox
                  items={departureDistricts}
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? "")}
                  disabled={departureDistricts.length === 0}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput
                      id="departureDistrict"
                      placeholder={departureCity ? t("selectDistrict") : t("selectCityFirst")}
                      aria-invalid={!!errors.departureDistrict}
                      aria-describedby={errors.departureDistrict ? "departureDistrict-error" : undefined}
                    />
                    <ComboboxTriggerGroup>
                      <ComboboxClear aria-label={t("clearSelection")} />
                      <ComboboxTrigger aria-label={t("departureDistrict")} />
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
              )}
            />
            {errors.departureDistrict && (
              <FieldError id="departureDistrict-error" errors={[{ message: errors.departureDistrict.message }]} />
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="arrivalDistrict">
              {t("arrivalDistrict")} <span className="text-muted-foreground font-normal">{t("optional")}</span>
            </FieldLabel>
            <Controller
              control={control}
              name="arrivalDistrict"
              render={({ field }) => (
                <Combobox
                  items={arrivalDistricts}
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? "")}
                  disabled={arrivalDistricts.length === 0}
                >
                  <ComboboxInputGroup>
                    <ComboboxInput
                      id="arrivalDistrict"
                      placeholder={arrivalCity ? t("selectDistrict") : t("selectCityFirst")}
                      aria-invalid={!!errors.arrivalDistrict}
                      aria-describedby={errors.arrivalDistrict ? "arrivalDistrict-error" : undefined}
                    />
                    <ComboboxTriggerGroup>
                      <ComboboxClear aria-label={t("clearSelection")} />
                      <ComboboxTrigger aria-label={t("arrivalDistrict")} />
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
              )}
            />
            {errors.arrivalDistrict && <FieldError id="arrivalDistrict-error" errors={[{ message: errors.arrivalDistrict.message }]} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="departureDate">{t("departureDate")}</FieldLabel>
            <Input
              id="departureDate"
              type="date"
              aria-invalid={!!errors.departureDate}
              aria-describedby={errors.departureDate ? "departureDate-error" : undefined}
              {...register("departureDate")}
            />
            {errors.departureDate && <FieldError id="departureDate-error" errors={[{ message: errors.departureDate.message }]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="departureTime">{t("departureTime")}</FieldLabel>
            <Input
              id="departureTime"
              type="time"
              aria-invalid={!!errors.departureTime}
              aria-describedby={errors.departureTime ? "departureTime-error" : undefined}
              {...register("departureTime")}
            />
            {errors.departureTime && <FieldError id="departureTime-error" errors={[{ message: errors.departureTime.message }]} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="seatCount">{t("seatCount")}</FieldLabel>
            <Input
              id="seatCount"
              type="number"
              min={MIN_SEAT_COUNT}
              max={MAX_SEAT_COUNT}
              disabled={watch("vipSolo")}
              aria-invalid={!!errors.seatCount}
              aria-describedby={errors.seatCount ? "seatCount-error" : undefined}
              {...register("seatCount")}
            />
            {errors.seatCount && <FieldError id="seatCount-error" errors={[{ message: errors.seatCount.message }]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="costShare">{t("costShare")}</FieldLabel>
            <Input
              id="costShare"
              type="number"
              min={0}
              step="0.01"
              aria-invalid={!!errors.costShare}
              aria-describedby={errors.costShare ? "costShare-error" : undefined}
              {...register("costShare")}
            />
            {errors.costShare && <FieldError id="costShare-error" errors={[{ message: errors.costShare.message }]} />}
            {estimatedCostShare !== null && (
              <FieldDescription>
                {t("costShareEstimate", { amount: estimatedCostShare })}{" "}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 align-baseline"
                  onClick={() => setValue("costShare", estimatedCostShare, { shouldValidate: true })}
                >
                  {t("costShareUseEstimate")}
                </Button>
              </FieldDescription>
            )}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
          <Textarea
            id="description"
            rows={4}
            maxLength={MAX_DESCRIPTION_LENGTH}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? "description-error" : undefined}
            {...register("description")}
          />
          <FieldDescription>{t("descriptionHint")}</FieldDescription>
          {errors.description && <FieldError id="description-error" errors={[{ message: errors.description.message }]} />}
        </Field>

        {!isPassengerMode && (
          <>
            <Field orientation="horizontal">
              <Controller
                control={control}
                name="petsAllowed"
                render={({ field }) => (
                  <Checkbox id="petsAllowed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="petsAllowed" className="font-normal">
                {t("petsAllowed")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="smokingAllowed"
                render={({ field }) => (
                  <Checkbox id="smokingAllowed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="smokingAllowed" className="font-normal">
                {t("smokingAllowed")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="vipSolo"
                render={({ field }) => (
                  <Checkbox
                    id="vipSolo"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      const isVip = checked === true
                      field.onChange(isVip)
                      if (isVip) {
                        setValue("seatCount", 1)
                      }
                    }}
                  />
                )}
              />
              <FieldLabel htmlFor="vipSolo" className="font-normal">
                {t("vipSolo")}
              </FieldLabel>
            </Field>
            {watch("vipSolo") && <FieldDescription>{t("vipSoloHint")}</FieldDescription>}

            <Field>
              <FieldLabel>{t("paymentMethodLabel")}</FieldLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={watch("paymentMethod") === "bank_transfer" ? "default" : "outline"}
                  onClick={() => setValue("paymentMethod", "bank_transfer")}
                >
                  {t("paymentMethodBankTransfer")}
                </Button>
                <Button
                  type="button"
                  variant={watch("paymentMethod") === "cash" ? "default" : "outline"}
                  onClick={() => setValue("paymentMethod", "cash")}
                >
                  {t("paymentMethodCash")}
                </Button>
              </div>
              <FieldDescription>{t("paymentMethodHint")}</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="instantBooking"
                render={({ field }) => (
                  <Checkbox id="instantBooking" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="instantBooking" className="font-normal">
                {t("instantBooking")}
              </FieldLabel>
            </Field>
            <FieldDescription>{t("instantBookingHint")}</FieldDescription>
          </>
        )}

        {!ride && !isPassengerMode && (
          <Field orientation="horizontal">
            <Controller
              control={control}
              name="repeatWeekly"
              render={({ field }) => (
                <Checkbox id="repeatWeekly" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              )}
            />
            <FieldLabel htmlFor="repeatWeekly" className="font-normal">
              {t("repeatWeekly")}
            </FieldLabel>
          </Field>
        )}
        {!isPassengerMode && watch("repeatWeekly") && <FieldDescription>{t("repeatWeeklyHint")}</FieldDescription>}
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {ride ? t("updateSubmit") : t("createSubmit")}
      </Button>
    </form>
  )
}
