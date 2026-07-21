// Shared across features/*/actions.ts server actions that re-validate a
// zod schema server-side and need a single user-facing message from the
// first validation issue.
export function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string): string {
  return error.issues[0]?.message ?? fallback
}
