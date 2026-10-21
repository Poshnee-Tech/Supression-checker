/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * Note on CSP: the Content-Security-Policy is emitted from `middleware.ts`
 * instead of here, because it carries a per-request nonce. A static CSP in this
 * file would have to allow 'unsafe-inline' for script-src to keep Next.js'
 * hydration scripts working, which defeats most of the point of having a CSP.
 * Setting it in both places would send two CSP headers and break the app.
 * Everything that does NOT need a nonce is configured below so it applies to
 * every response, including static assets.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Never let a proxy or browser cache an authenticated API response.
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
