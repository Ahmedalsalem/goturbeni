"use server"

import { cookies } from "next/headers"

import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE, type AppLocale } from "@/i18n/locale-config"

export async function getUserLocale(): Promise<AppLocale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export async function setUserLocale(locale: AppLocale): Promise<void> {
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
}
