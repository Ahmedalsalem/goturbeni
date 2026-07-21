"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EmptyState } from "@/components/EmptyState"
import { createClient } from "@/lib/supabase/client"
import { markMessagesRead, sendMessage } from "@/features/chat/actions"
import { MessageBubble } from "@/features/chat/MessageBubble"
import { MessageInput } from "@/features/chat/MessageInput"
import type { Message } from "@/types/message"

type Counterpart = { id: string; full_name: string | null; avatar_url: string | null }

export function ChatWindow({
  rideId,
  currentUserId,
  counterpart,
  initialMessages,
}: {
  rideId: string
  currentUserId: string
  counterpart: Counterpart
  initialMessages: Message[]
}) {
  const t = useTranslations("Chat")
  const [messages, setMessages] = useState(initialMessages)
  const [counterpartTyping, setCounterpartTyping] = useState(false)
  const [isSending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())
  const typingChannelRef = useRef<ReturnType<(typeof supabaseRef)["current"]["channel"]> | null>(null)

  const counterpartName = counterpart.full_name ?? t("unknownUser")
  const counterpartInitials = counterpartName.slice(0, 2).toUpperCase()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Mark the counterpart's messages as seen whenever the thread updates and
  // some of them are still unread — covers both the initial load and any
  // message that streams in while this window is open.
  useEffect(() => {
    const hasUnread = messages.some((m) => m.sender_id === counterpart.id && m.receiver_id === currentUserId && !m.read_at)
    if (hasUnread) {
      markMessagesRead(rideId, counterpart.id)
    }
  }, [messages, rideId, counterpart.id, currentUserId])

  useEffect(() => {
    const supabase = supabaseRef.current
    const typingTopic = `typing:${rideId}:${[currentUserId, counterpart.id].sort().join(":")}`

    const dbChannel = supabase
      .channel(`messages:${rideId}:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const row = payload.new as Message
          const belongsToThread =
            (row.sender_id === counterpart.id && row.receiver_id === currentUserId) ||
            (row.sender_id === currentUserId && row.receiver_id === counterpart.id)
          if (belongsToThread) {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const row = payload.new as Message
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)))
        }
      )
      .subscribe()

    let typingTimeout: ReturnType<typeof setTimeout>
    const typingChannel = supabase
      .channel(typingTopic)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== currentUserId) {
          setCounterpartTyping(Boolean(payload.isTyping))
          clearTimeout(typingTimeout)
          if (payload.isTyping) {
            typingTimeout = setTimeout(() => setCounterpartTyping(false), 3000)
          }
        }
      })
      .subscribe()
    typingChannelRef.current = typingChannel

    return () => {
      clearTimeout(typingTimeout)
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(typingChannel)
    }
  }, [rideId, currentUserId, counterpart.id])

  function handleTyping(isTyping: boolean) {
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: currentUserId, isTyping },
    })
  }

  function handleSend(message: string) {
    startTransition(async () => {
      const result = await sendMessage(rideId, counterpart.id, { message })
      if (result?.error) {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="border-border/70 bg-card flex flex-1 flex-col overflow-hidden rounded-xl border">
      <div className="border-border/70 flex items-center gap-3 border-b p-3.5">
        <Avatar className="size-9">
          <AvatarImage src={counterpart.avatar_url ?? undefined} alt={counterpartName} />
          <AvatarFallback>{counterpartInitials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{counterpartName}</p>
          {counterpartTyping && <p className="text-primary text-xs">{t("status.typing")}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} isOwn={message.sender_id === currentUserId} />)
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} onTyping={handleTyping} disabled={isSending} />
    </div>
  )
}
