import { HomeHero } from "@/features/rides/HomeHero"

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-gradient-to-b via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="bg-primary/15 pointer-events-none absolute start-1/2 top-[-12rem] -z-10 size-[42rem] -translate-x-1/2 rounded-full blur-3xl dark:opacity-20"
      />
      <HomeHero />
    </div>
  )
}
