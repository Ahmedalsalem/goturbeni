import type { LucideIcon } from "lucide-react"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="border-border/70 flex flex-col items-center gap-4 rounded-2xl border border-dashed px-4 py-20 text-center">
      <div className="bg-muted flex size-14 items-center justify-center rounded-2xl">
        <Icon className="text-muted-foreground size-6" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{description}</p>
      </div>
      {action}
    </div>
  )
}
