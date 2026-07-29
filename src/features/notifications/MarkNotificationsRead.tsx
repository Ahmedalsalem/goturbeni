"use client"

import { useEffect } from "react"

import { markNavNotificationsRead, type NavTarget } from "@/features/notifications/actions"

// Drop this into a page to clear that nav item's red dot the moment the user
// actually visits it — mirrors ChatWindow.tsx's markMessagesRead-on-mount
// pattern. Renders nothing; the badge itself only updates on the *next*
// navigation (same tradeoff the existing unread-messages dot already makes).
export function MarkNotificationsRead({ navTarget }: { navTarget: NavTarget }) {
  useEffect(() => {
    markNavNotificationsRead(navTarget)
  }, [navTarget])

  return null
}
