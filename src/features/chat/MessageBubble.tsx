"use client"

import { useState, useTransition } from "react"
import { useFormatter, useTranslations } from "next-intl"
import { Check, CheckCheck, Loader2, MapPin, MoreVertical } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deleteMessage, editMessage } from "@/features/chat/actions"
import { MAX_MESSAGE_LENGTH } from "@/features/chat/schemas"
import { isWithinEditWindow } from "@/utils/edit-window"
import type { Message } from "@/types/message"

export function MessageBubble({ message, isOwn, rideId }: { message: Message; isOwn: boolean; rideId: string }) {
  const format = useFormatter()
  const t = useTranslations("Chat.status")
  const tActions = useTranslations("Chat.actions")
  const [mode, setMode] = useState<"view" | "editing" | "confirmDelete">("view")
  const [draft, setDraft] = useState(message.message)
  const [isPending, startTransition] = useTransition()

  const isDeleted = message.deleted_at !== null
  const isLocation = message.message_type === "location"
  // Client-side only — a UX gate to hide the affordance once the window is
  // obviously closed. The edit_message/soft_delete_message RPCs are the real
  // enforcement (see 0013_editable_messages_reviews.sql). Location messages
  // are excluded — editing would only change the caption text, not the
  // shared coordinates, which is more confusing than useful.
  const canModify = isOwn && !isDeleted && !isLocation && isWithinEditWindow(message.created_at)

  function handleSaveEdit() {
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }
    startTransition(async () => {
      const result = await editMessage(rideId, message.id, trimmed)
      if (result?.error) {
        toast.error(result.error)
      } else {
        setMode("view")
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteMessage(rideId, message.id)
      if (result?.error) {
        toast.error(result.error)
      }
      setMode("view")
    })
  }

  return (
    <div className={cn("flex max-w-[80%] flex-col gap-0.5", isOwn ? "self-end items-end" : "self-start items-start")}>
      <div className="group/bubble relative flex items-start gap-1">
        {canModify && mode === "view" && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-visible:opacity-100")}
              aria-label={tActions("edit")}
            >
              <MoreVertical className="size-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setMode("editing")}>{tActions("edit")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setMode("confirmDelete")}>
                {tActions("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm",
            isOwn ? "bg-primary text-primary-foreground rounded-ee-sm" : "bg-muted rounded-ss-sm"
          )}
        >
          {isDeleted ? (
            <p className="italic opacity-70">{tActions("deletedPlaceholder")}</p>
          ) : message.message_type === "location" && message.location_lat !== null && message.location_lng !== null ? (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${message.location_lat},${message.location_lng}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("flex items-center gap-1.5 underline underline-offset-2", isOwn ? "text-primary-foreground" : "text-foreground")}
            >
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {message.message}
            </a>
          ) : mode === "editing" ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={1}
                autoFocus
                className="min-h-9 resize-none bg-background text-foreground"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-foreground"
                  onClick={() => {
                    setDraft(message.message)
                    setMode("view")
                  }}
                  disabled={isPending}
                >
                  {tActions("cancel")}
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={isPending || !draft.trim()}>
                  {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : tActions("save")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.message}</p>
          )}
        </div>
      </div>

      {mode === "confirmDelete" && (
        <div className="flex items-center gap-2 px-1 text-xs">
          <span className="text-muted-foreground">{tActions("confirmDelete")}</span>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={isPending}>
            {tActions("cancel")}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : tActions("delete")}
          </Button>
        </div>
      )}

      <div className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
        {format.dateTime(new Date(message.created_at), { hour: "2-digit", minute: "2-digit" })}
        {message.edited_at && !isDeleted && <span>{tActions("edited")}</span>}
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
