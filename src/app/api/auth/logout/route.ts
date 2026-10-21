import { NextResponse } from 'next/server'
import { clearedSessionCookieOptions, SESSION_COOKIE } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'cache-control': 'no-store' } }
  )
  response.cookies.set(SESSION_COOKIE, '', clearedSessionCookieOptions)
  return response
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405, headers: { allow: 'POST' } })
}
