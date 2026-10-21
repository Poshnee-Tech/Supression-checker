/**
 * Upstash Redis + rate limiters. Server only.
 *
 * If the Upstash env vars are absent (e.g. a local dev machine without a Redis
 * instance) the helpers degrade gracefully: rate limiting is skipped and audit
 * entries are written to the server console instead. A loud warning is logged
 * once so this is never silent.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getUpstashConfig, isProduction } from '@/lib/env'

let redisClient: Redis | null | undefined
let warned = false

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient
  const config = getUpstashConfig()
  if (!config) {
    if (!warned) {
      warned = true
      console.warn(
        '[suppression-checker] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. ' +
          'Rate limiting and audit logging are DISABLED.' +
          (isProduction ? ' This must be fixed before serving production traffic.' : '')
      )
    }
    redisClient = null
    return null
  }
  redisClient = new Redis({ url: config.url, token: config.token })
  return redisClient
}

/** True when Upstash credentials are present, i.e. rate limiting can work. */
export function isRateLimitingConfigured(): boolean {
  return getUpstashConfig() !== null
}

function makeLimiter(limiter: ReturnType<typeof Ratelimit.slidingWindow>, prefix: string): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null
  return new Ratelimit({ redis, limiter, prefix, analytics: false })
}

let loginLimiter: Ratelimit | null | undefined
let checkLimiter: Ratelimit | null | undefined

/** Max 5 *failed* login attempts per identifier per 15 minutes. */
export function getLoginLimiter(): Ratelimit | null {
  if (loginLimiter === undefined) {
    loginLimiter = makeLimiter(Ratelimit.slidingWindow(5, '15 m'), 'rl:login')
  }
  return loginLimiter
}

/** Max 30 suppression checks per user per minute. */
export function getCheckLimiter(): Ratelimit | null {
  if (checkLimiter === undefined) {
    checkLimiter = makeLimiter(Ratelimit.slidingWindow(30, '1 m'), 'rl:check')
  }
  return checkLimiter
}

/**
 * Read the remaining budget for an identifier WITHOUT consuming a token.
 * Used for login so only failed attempts count against the lockout.
 */
export async function peekRemaining(
  limiter: Ratelimit,
  identifier: string
): Promise<{ remaining: number; reset: number | null }> {
  const raw: unknown = await limiter.getRemaining(identifier)
  if (typeof raw === 'number') return { remaining: raw, reset: null }
  const obj = raw as { remaining?: number; reset?: number }
  return { remaining: obj?.remaining ?? 0, reset: obj?.reset ?? null }
}
