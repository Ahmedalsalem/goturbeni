"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createRide, updateRide } from "@/features/rides/actions"
import {
  buildRideSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type RideFormInput,
  type RideFormValues,
} from "@/features/rides/schemas"
import { TURKISH_PROVINCES } from "@/utils/turkish-provinces"
import { toIstanbulDateInputValue, toIstanbulTimeInputValue } from "@/utils/istanbul-time"
import type { Ride } from "@/types/ride"

export function RideForm({ ride }: { ride?: Ride }) {
  const t = useTranslations("Rides.form")
  const tValidation = useTranslations("Rides.validation")
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RideFormInput, unknown, RideFormValues>({
    resolver: zodResolver(buildRideSchema(tValidation)),
    // The city Selects are controlled (Controller passes `value` explicitly),
    // so they need a defined value from the first render — leaving
    // departureCity/arrivalCity as `undefined` on create flips Base UI's
    // Select from uncontrolled to controlled after the first selection and
    // triggers a React warning.
    defaultValues: {
      departureCity: (ride?.departure_city as RideFormInput["departureCity"]) ?? ("" as RideFormInput["departureCity"]),
      arrivalCity: (ride?.arrival_city as RideFormInput["arrivalCity"]) ?? ("" as RideFormInput["arrivalCity"]),
      departureDate: ride ? toIstanbulDateInputValue(ride.departure_time) : "",
      departureTime: ride ? toIstanbulTimeInputValue(ride.departure_time) : "",
      seatCount: ride?.seat_count ?? MIN_SEAT_COUNT,
      costShare: ride?.cost_share ?? 0,
      description: ride?.description ?? undefined,
    },
  })

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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="departureCity">{t("departureCity")}</FieldLabel>
            <Controller
              control={control}
              name="departureCity"
              render={({ field }) => (
                <Select
                  name={field.name}
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger
                    id="departureCity"
                    aria-label={t("departureCity")}
                    aria-invalid={!!errors.departureCity}
                    aria-describedby={errors.departureCity ? "departureCity-error" : undefined}
                    className="w-full"
                  >
                    <SelectValue placeholder={t("selectCity")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TURKISH_PROVINCES.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.departureCity && <FieldError id="departureCity-error" errors={[{ message: errors.departureCity.message }]} />}
          </Field>

          <Field>
            <FieldLabel htmlFor="arrivalCity">{t("arrivalCity")}</FieldLabel>
            <Controller
              control={control}
              name="arrivalCity"
              render={({ field }) => (
                <Select
                  name={field.name}
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger
                    id="arrivalCity"
                    aria-label={t("arrivalCity")}
                    aria-invalid={!!errors.arrivalCity}
                    aria-describedby={errors.arrivalCity ? "arrivalCity-error" : undefined}
                    className="w-full"
                  >
                    <SelectValue placeholder={t("selectCity")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TURKISH_PROVINCES.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.arrivalCity && <FieldError id="arrivalCity-error" errors={[{ message: errors.arrivalCity.message }]} />}
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
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {ride ? t("updateSubmit") : t("createSubmit")}
      </Button>
    </form>
  )
}
