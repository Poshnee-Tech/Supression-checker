import type { Metadata } from 'next'
import { Logo } from '@/components/Logo'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in · Suppression Checker' }
export const dynamic = 'force-dynamic'

/** Only allow redirects back into this app - never to an external origin. */
function safeNextPath(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string | string[] }
}) {
  const next = safeNextPath(searchParams?.next)

  return (
    <main className="flex min-h-dvh flex-col bg-navy-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="h-12 w-12" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              Suppression Checker
            </h1>
            <p className="mt-1 text-sm text-navy-100/70">Internal use only · authorized agents</p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-card sm:p-7">
            <LoginForm nextPath={next} />
          </div>

          <p className="mt-6 text-center text-xs text-navy-100/50">
            Activity on this tool is logged. Contact your supervisor for access.
          </p>
        </div>
      </div>
    </main>
  )
}
