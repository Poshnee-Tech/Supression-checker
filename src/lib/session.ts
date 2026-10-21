/**
 * JWT session handling. Edge-runtime safe (jose only, no Node built-ins) so the
 * same verification code is used by middleware and by API routes.
 */

import { SignJWT, jwtVerify } from 'jose'
import { getAuthSecret, isProduction } from '@/lib/env'

export const SESSION_COOKIE = 'sc_session'
export const SESSION_TTL_SECONDS = 8 * 60 * 60 // 8 hours
const ISSUER = 'suppression-checker'
const AUDIENCE = 'suppression-checker:app'

export type SessionPayload = {
  username: string
  role: string
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.username)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getAuthSecret())
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    const role = typeof payload.role === 'string' ? payload.role : 'agent'
    return { username: payload.sub, role }
  } catch {
    // Expired, tampered, or malformed — all treated identically.
    return null
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
}

export const clearedSessionCookieOptions = {
  ...sessionCookieOptions,
  maxAge: 0,
}
