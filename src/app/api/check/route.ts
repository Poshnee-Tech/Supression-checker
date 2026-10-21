import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { logCheck } from '@/lib/audit'
import { getCheckLimiter } from '@/lib/redis'
import { describeWait, secondsUntil } from '@/lib/request'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'
import { checkSuppression } from '@/lib/suppression'
import { validateUsPhone } from '@/lib/phone'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'cache-control': 'no-store' }

const checkSchema = z
  .object({
    phone: z.string().min(1).max(40),
  })
  .strict()

export async function POST(request: NextRequest) {
  // Middleware already rejects unauthenticated requests; re-verify here so the
  // route is safe on its own (defence in depth) and to get the username.
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    return NextResponse.json(
      { error: 'Your session has expired. Sign in again.' },
      { status: 401, headers: noStore }
    )
  }

  const limiter = getCheckLimiter()
  if (limiter) {
    try {
      const { success, reset } = await limiter.limit(`user:${session.username.toLowerCase()}`)
      if (!success) {
        const wait = describeWait(secondsUntil(reset))
        return NextResponse.json(
          { error: `You are checking numbers too quickly. Try again in ${wait}.` },
          { status: 429, headers: noStore }
        )
      }
    } catch (error) {
      console.error('[suppression-checker] check rate-limit failed', error)
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
  }

  const parsed = checkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
  }

  // Never trust the client: the exact same validation runs again here.
  const phone = validateUsPhone(parsed.data.phone)
  if (!phone.valid) {
    return NextResponse.json({ error: phone.message }, { status: 400, headers: noStore })
  }

  const result = await checkSuppression(phone.normalized)

  await logCheck({
    ts: new Date().toISOString(),
    username: session.username,
    last4: phone.last4,
    status: result.status,
  })

  const httpStatus = result.status === 'ERROR' ? 502 : 200

  return NextResponse.json(
    {
      status: result.status,
      message: result.message,
      phone: phone.formatted,
      checkedAt: new Date().toISOString(),
    },
    { status: httpStatus, headers: noStore }
  )
}

function methodNotAllowed() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { allow: 'POST', ...noStore } }
  )
}

export const GET = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
