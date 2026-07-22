// Test-only stand-in for the `server-only` package. The real package throws
// unconditionally under plain Node module resolution (it only no-ops under
// Next's "react-server" resolve condition), so vitest.config.ts aliases
// `server-only` imports to this empty module for the test environment only.
// Source files must keep `import "server-only"` — do not remove it there.
export {}
