import { z } from "zod"

export const MAX_MESSAGE_LENGTH = 2000

type ValidationTranslator = (key: "messageRequired" | "messageMax") => string

export function buildMessageSchema(t: ValidationTranslator) {
  return z.object({
    message: z.string().trim().min(1, t("messageRequired")).max(MAX_MESSAGE_LENGTH, t("messageMax")),
  })
}

export type MessageFormValues = z.output<ReturnType<typeof buildMessageSchema>>
export type MessageFormInput = z.input<ReturnType<typeof buildMessageSchema>>

export type ChatActionState = { error?: string; success?: boolean }
