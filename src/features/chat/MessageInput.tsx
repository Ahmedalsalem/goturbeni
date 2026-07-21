"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MAX_MESSAGE_LENGTH } from "@/features/chat/schemas"

export function MessageInput({
  onSend,
  onTyping,
  disabled,
}: {
  onSend: (message: string) => void
  onTyping: (isTyping: boolean) => void
  disabled?: boolean
}) {
  const t = useTranslations("Chat.form")
  const [value, setValue] = useState("")
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(next: string) {
    setValue(next)
    onTyping(true)
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current)
    }
    typingTimeout.current = setTimeout(() => onTyping(false), 2000)
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) {
      return
    }
    onSend(trimmed)
    setValue("")
    onTyping(false)
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-border/70 flex items-end gap-2 border-t p-3">
      <Textarea
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={1}
        className="max-h-32 min-h-9 flex-1 resize-none"
      />
      <Button size="icon" onClick={submit} disabled={disabled || !value.trim()} aria-label={t("send")}>
        {disabled ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      </Button>
    </div>
  )
}
