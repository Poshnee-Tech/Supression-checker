'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/Spinner'

export function AppHeader({ username }: { username: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function logout() {
    setPending(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the request fails we still send the agent to the login screen;
      // middleware will clear the cookie on the next request.
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="bg-navy-900 text-white">
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3">
        <Logo className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight sm:text-base">
            Suppression Checker
          </p>
          <p className="truncate text-xs text-navy-100/60">
            Signed in as <span className="font-medium text-navy-100/90">{username}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          disabled={pending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 disabled:opacity-60"
        >
          {pending ? <Spinner className="h-3.5 w-3.5" /> : null}
          Log out
        </button>
      </div>
    </header>
  )
}
