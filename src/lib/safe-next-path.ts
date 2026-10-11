// /auth/callback appends `next` straight onto the site origin, so anything
// that isn't a plain same-site path would make it an open redirect:
// ".evil.com" becomes "https://site.com.evil.com" and "@evil.com" uses URL
// userinfo to land on evil.com. "//" and "/\\" are protocol-relative.
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/profile"
  }
  return next
}
