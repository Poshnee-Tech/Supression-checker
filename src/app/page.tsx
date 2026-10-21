import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { CheckerCard } from '@/components/CheckerCard'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Middleware already gates this route; this is a second, independent check so
  // the page can never render without a verified session.
  const session = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader username={session.username} />

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
        <CheckerCard />
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-navy-900/40">
        Internal tool · every check is logged
      </footer>
    </div>
  )
}
