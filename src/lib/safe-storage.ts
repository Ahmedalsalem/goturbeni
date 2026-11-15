// Touching window.localStorage/sessionStorage throws a SecurityError ("The
// operation is insecure.") when the browser blocks site data (Firefox/Safari
// with cookies blocked, some in-app browsers). Uncaught inside a useEffect
// that error takes down the whole page, so every storage access goes through
// these: a blocked store reads as empty and writes are dropped.
type StorageKind = "localStorage" | "sessionStorage"

export function readStorage(key: string, kind: StorageKind = "localStorage"): string | null {
  try {
    return window[kind].getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string, kind: StorageKind = "localStorage"): void {
  try {
    window[kind].setItem(key, value)
  } catch {
    // Blocked storage: the flag just won't persist across visits.
  }
}

export function removeStorage(key: string, kind: StorageKind = "localStorage"): void {
  try {
    window[kind].removeItem(key)
  } catch {
    // Blocked storage: nothing was stored to remove.
  }
}
