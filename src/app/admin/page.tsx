import type { Metadata } from "next"
import type { LucideIcon } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { CalendarPlus, CarFront, ClipboardList, UserPlus, Users } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminStats } from "@/features/admin/queries"
import type { BookingStatus } from "@/types/booking"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.analytics")
  return { title: t("title") }
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3.5">
        <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-muted-foreground text-sm">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AdminAnalyticsPage() {
  const t = await getTranslations("Admin.analytics")
  const tBookingStatus = await getTranslations("Bookings.status")
  const format = await getFormatter()
  const stats = await getAdminStats()
  const maxRidesPerDay = Math.max(1, ...stats.ridesByDay.map((day) => day.count))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label={t("totalUsers")} value={stats.totalUsers} icon={Users} />
        <StatCard label={t("totalRides")} value={stats.totalRides} icon={CarFront} />
        <StatCard label={t("totalBookings")} value={stats.totalBookings} icon={ClipboardList} />
        <StatCard label={t("usersLast7Days")} value={stats.usersLast7Days} icon={UserPlus} />
        <StatCard label={t("usersLast30Days")} value={stats.usersLast30Days} icon={UserPlus} />
        <StatCard label={t("ridesLast7Days")} value={stats.ridesLast7Days} icon={CalendarPlus} />
        <StatCard label={t("ridesLast30Days")} value={stats.ridesLast30Days} icon={CalendarPlus} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookingsByStatusTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.entries(stats.bookingsByStatus) as [BookingStatus, number][]).map(([status, count]) => (
            <div key={status} className="border-border/70 rounded-lg border px-3 py-2">
              <p className="text-lg font-semibold tabular-nums">{count.toLocaleString()}</p>
              <p className="text-muted-foreground text-xs">{tBookingStatus(status)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("ridesTrendTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-end gap-2">
            {stats.ridesByDay.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="bg-primary/70 w-full rounded-t-md"
                  style={{ height: `${Math.max((day.count / maxRidesPerDay) * 100, day.count > 0 ? 4 : 1)}%` }}
                  title={String(day.count)}
                />
                <span className="text-muted-foreground text-[10px]">
                  {format.dateTime(new Date(`${day.date}T00:00:00`), { day: "2-digit", month: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
