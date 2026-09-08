import "server-only"

import { createClient } from "@/lib/supabase/server"

// profiles.select all zaten public (0001_profiles.sql: "select all profiles"
// politikası `using (true)`) — referred_by de bu tabloda düz bir sütun,
// ayrı bir RPC/politika gerekmiyor.
export async function getReferralCount(userId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId)
  return count ?? 0
}
