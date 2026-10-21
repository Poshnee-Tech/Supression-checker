/** Small helpers shared by API routes. */

import type { NextRequest } from 'next/server'

/** Best-effort client IP, used only as a rate-limit bucket. */
export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || '0.0.0.0'
}

export function secondsUntil(resetMs: number | null): number | null {
  if (!resetMs) return null
  const seconds = Math.ceil((resetMs - Date.now()) / 1000)
  return seconds > 0 ? seconds : 1
}

export function describeWait(seconds: number | null): string {
  if (!seconds) return 'a few minutes'
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}
