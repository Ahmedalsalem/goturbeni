import { notFound } from "next/navigation"

export default async function RoutePage({ params }: { params: Promise<{ route: string }> }) {
  const { route } = await params
  if (route === "istanbul-atlantis") {
    notFound()
  }
  return <div>ok: {route}</div>
}
