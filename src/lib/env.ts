/**
 * Server-only environment access.
 *
 * Nothing in here may be imported from a Client Component — every value is a
 * secret or an internal endpoint and must never reach the browser bundle.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

export function getAuthSecret(): Uint8Array {
  const secret = required('AUTH_SECRET')
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters long')
  }
  return new TextEncoder().encode(secret)
}

export function getAppUsersRaw(): string {
  return required('APP_USERS')
}

export function getTldConfig(): { baseUrl: string; fpg: string } {
  // TLD_FPG is REQUIRED and must be non-empty: the upstream returns
  // {"ready":0,"reason":"PAR"} when no filter groups are passed, which would
  // otherwise look like "every number is suppressed".
  const fpg = required('TLD_FPG')
  return {
    baseUrl: required('TLD_BASE_URL').replace(/\/+$/, ''),
    fpg,
  }
}

export function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null
  return { url, token }
}

export const isProduction = process.env.NODE_ENV === 'production'
