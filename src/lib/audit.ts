/**
 * Server-side audit log of suppression checks, stored in Upstash Redis as a
 * capped list (newest first, last 1,000 entries).
 *
 * Only the LAST 4 DIGITS of a phone number are ever recorded. The full number,
 * the post key, the vendor id and the upstream URL are never written here.
 */

import { getRedis } from '@/lib/redis'
import type { CheckStatus } from '@/lib/types'

export const CHECK_LOG_KEY = 'suppression:checks'
export const CHECK_LOG_MAX_ENTRIES = 1000

export type CheckLogEntry = {
  ts: string
  username: string
  last4: string
  status: CheckStatus
}

export async function logCheck(entry: CheckLogEntry): Promise<void> {
  const redis = getRedis()
  if (!redis) {
    console.info('[check]', JSON.stringify(entry))
    return
  }
  try {
    const pipeline = redis.pipeline()
    pipeline.lpush(CHECK_LOG_KEY, JSON.stringify(entry))
    pipeline.ltrim(CHECK_LOG_KEY, 0, CHECK_LOG_MAX_ENTRIES - 1)
    await pipeline.exec()
  } catch (error) {
    // Never let an audit-log failure break the agent's check.
    console.error('[suppression-checker] failed to write audit log entry', error)
  }
}

export async function readRecentChecks(limit = 100): Promise<CheckLogEntry[]> {
  const redis = getRedis()
  if (!redis) return []
  try {
    const rows = await redis.lrange<string | CheckLogEntry>(CHECK_LOG_KEY, 0, Math.max(0, limit - 1))
    return rows
      .map((row) => {
        if (typeof row !== 'string') return row as CheckLogEntry
        try {
          return JSON.parse(row) as CheckLogEntry
        } catch {
          return null
        }
      })
      .filter((row): row is CheckLogEntry => Boolean(row))
  } catch (error) {
    console.error('[suppression-checker] failed to read audit log', error)
    return []
  }
}
