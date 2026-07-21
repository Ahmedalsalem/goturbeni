"use client"

import { useFormatter, useTranslations } from "next-intl"
import { Check, CheckCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Message } from "@/types/message"

export function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const format = useFormatter()
  const t = useTranslations("Chat.status")

  return (
    <div className={cn("flex max-w-[80%] flex-col gap-0.5", isOwn ? "self-end items-end" : "self-start items-start")}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2 text-sm",
          isOwn ? "bg-primary text-primary-foreground rounded-ee-sm" : "bg-muted rounded-ss-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.message}</p>
      </div>
      <div className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
        {format.dateTime(new Date(message.created_at), { hour: "2-digit", minute: "2-digit" })}
        {isOwn && (
          <span className="inline-flex items-center gap-1">
            {message.read_at ? (
              <CheckCheck className="text-primary size-3.5" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            <span className="sr-only">{message.read_at ? t("seen") : t("sent")}</span>
          </span>
        )}
      </div>
    </div>
  )
}
