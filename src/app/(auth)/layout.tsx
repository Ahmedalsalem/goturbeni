import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-16">
      <Link href="/" className="text-center text-lg font-semibold">
        GötürBeni
      </Link>
      {children}
    </div>
  )
}
