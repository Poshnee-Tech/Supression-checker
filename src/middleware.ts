import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

/**
 * Edge middleware: the single auth gate for the whole app.
 *
 * Everything except /login and /api/auth/login requires a valid session JWT.
 * It also sets the Content-Security-Policy with a per-request nonce (a static
 * CSP cannot cover Next.js inline hydration scripts without 'unsafe-inline').
 */

const PUBLIC_PAGES = new Set(['/login'])
const PUBLIC_APIS = new Set(['/api/auth/login'])

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced Next bootstrap script load its own chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`.trim(),
    // Next and Tailwind inject style tags; styles cannot execute code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "manifest-src 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  // Next.js reads this header to nonce the script tags it generates.
  requestHeaders.set('content-security-policy', csp)

  const withCsp = (response: NextResponse) => {
    response.headers.set('content-security-policy', csp)
    return response
  }

  const isApi = pathname.startsWith('/api/')
  const isPublic = PUBLIC_PAGES.has(pathname) || PUBLIC_APIS.has(pathname)

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)

  // Already signed in? Skip the login page.
  if (session && pathname === '/login') {
    return withCsp(NextResponse.redirect(new URL('/', request.url)))
  }

  if (!session && !isPublic) {
    if (isApi) {
      return withCsp(
        NextResponse.json(
          { error: 'Your session has expired. Sign in again.' },
          { status: 401, headers: { 'cache-control': 'no-store' } }
        )
      )
    }
    const loginUrl = new URL('/login', request.url)
    const target = `${pathname}${search}`
    if (target && target !== '/') loginUrl.searchParams.set('next', target)
    const response = NextResponse.redirect(loginUrl)
    // Clear whatever stale cookie we were handed.
    response.cookies.delete(SESSION_COOKIE)
    return withCsp(response)
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
}

export const config = {
  matcher: [
    /*
     * Run on everything except Next static output and well-known static files.
     * Source maps are excluded so dev tooling is not redirected to /login.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.map$).*)',
  ],
}
