import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'
import { verifyCredentials } from '@/lib/users'
import { getLoginLimiter, isRateLimitingConfigured, peekRemaining } from '@/lib/redis'
import { describeWait, getClientIp, secondsUntil } from '@/lib/request'
import { isProduction } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GENERIC_FAILURE = 'Invalid username or password'

const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
})

const noStore = { 'cache-control': 'no-store' }

export async function POST(request: NextRequest) {
  // Fail closed on misconfiguration: never serve production logins without
  // brute-force protection. (A transient Redis outage still fails open below,
  // so a Redis blip cannot lock every agent out mid-shift.)
  if (isProduction && !isRateLimitingConfigured()) {
    console.error(
      '[suppression-checker] refusing to process logins: UPSTASH_REDIS_REST_URL / ' +
        'UPSTASH_REDIS_REST_TOKEN are not configured, so login rate limiting is unavailable.'
    )
    return NextResponse.json(
      { error: 'Sign-in is unavailable right now. Contact your supervisor.' },
      { status: 503, headers: noStore }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400, headers: noStore })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 400, headers: noStore })
  }

  const username = parsed.data.username.trim()
  const { password } = parsed.data
  const ip = getClientIp(request)

  // Lockout buckets: per username AND per IP. Only FAILED attempts consume a
  // token, so an agent who signs in correctly is never locked out.
  const limiter = getLoginLimiter()
  const buckets = [`user:${username.toLowerCase()}`, `ip:${ip}`]

  if (limiter) {
    try {
      for (const bucket of buckets) {
        const { remaining, reset } = await peekRemaining(limiter, bucket)
        if (remaining <= 0) {
          const wait = describeWait(secondsUntil(reset))
          return NextResponse.json(
            {
              error: `Too many failed sign-in attempts. This account is temporarily locked - try again in ${wait}.`,
            },
            { status: 429, headers: noStore }
          )
        }
      }
    } catch (error) {
      console.error('[suppression-checker] login rate-limit check failed', error)
    }
  }

  let user: Awaited<ReturnType<typeof verifyCredentials>> = null
  try {
    user = await verifyCredentials(username, password)
  } catch (error) {
    // Misconfigured APP_USERS / AUTH_SECRET - detail stays server-side only.
    console.error('[suppression-checker] login failed due to server configuration', error)
    return NextResponse.json(
      { error: 'Sign-in is unavailable right now. Contact your supervisor.' },
      { status: 500, headers: noStore }
    )
  }

  if (!user) {
    if (limiter) {
      try {
        for (const bucket of buckets) await limiter.limit(bucket)
      } catch (error) {
        console.error('[suppression-checker] failed to record failed login attempt', error)
      }
    }
    console.warn(`[auth] failed login for "${username}" from ${ip}`)
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401, headers: noStore })
  }

  let token: string
  try {
    token = await createSessionToken({ username: user.username, role: user.role })
  } catch (error) {
    console.error('[suppression-checker] could not issue session token', error)
    return NextResponse.json(
      { error: 'Sign-in is unavailable right now. Contact your supervisor.' },
      { status: 500, headers: noStore }
    )
  }

  if (limiter) {
    // A successful sign-in clears the failure counters.
    try {
      for (const bucket of buckets) await limiter.resetUsedTokens(bucket)
    } catch (error) {
      console.error('[suppression-checker] failed to reset login attempt counters', error)
    }
  }

  console.info(`[auth] successful login for "${user.username}" from ${ip}`)

  const response = NextResponse.json(
    { ok: true, username: user.username, role: user.role },
    { status: 200, headers: noStore }
  )
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return response
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { allow: 'POST', ...noStore } }
  )
}
