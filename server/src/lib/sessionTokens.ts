// In-memory token store for header-based session auth.
// Used as a fallback when browser cookies are blocked/unavailable.
// Entries expire after the same sliding window as cookie sessions, so a
// leaked token is no longer valid forever.

const TOKEN_TTL_MS = Number(process.env.SESSION_TIMEOUT_MIN ?? 30) * 60 * 1000

export interface TokenEntry {
  username: string
  role: string
}

interface StoredEntry extends TokenEntry {
  lastActiveAt: number
}

class TokenStore {
  private entries = new Map<string, StoredEntry>()

  /** Returns the entry and refreshes its sliding expiry; undefined when missing/expired. */
  get(token: string): TokenEntry | undefined {
    const entry = this.entries.get(token)
    if (!entry) return undefined
    if (Date.now() - entry.lastActiveAt > TOKEN_TTL_MS) {
      this.entries.delete(token)
      return undefined
    }
    entry.lastActiveAt = Date.now()
    return { username: entry.username, role: entry.role }
  }

  set(token: string, entry: TokenEntry): void {
    this.entries.set(token, { ...entry, lastActiveAt: Date.now() })
  }

  delete(token: string): void {
    this.entries.delete(token)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [token, entry] of this.entries) {
      if (now - entry.lastActiveAt > TOKEN_TTL_MS) this.entries.delete(token)
    }
  }
}

export const tokenStore = new TokenStore()

setInterval(() => tokenStore.cleanup(), 60 * 1000).unref()
