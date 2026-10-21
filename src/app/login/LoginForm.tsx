'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Spinner } from '@/components/Spinner'

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !pending

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setPending(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      if (response.ok) {
        setPassword('')
        // Server-rendered redirect so the new session cookie is picked up.
        router.replace(nextPath)
        router.refresh()
        return
      }

      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'Invalid username or password')
      setPassword('')
      setPending(false)
      usernameRef.current?.focus()
    } catch {
      setError('Network problem - check your connection and try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-navy-900">
          Username
        </label>
        <input
          id="username"
          name="username"
          ref={usernameRef}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={pending}
          className="mt-1.5 w-full rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-navy-900 placeholder:text-navy-900/35 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:bg-navy-50"
          placeholder="agent1"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-navy-900">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          className="mt-1.5 w-full rounded-lg border border-navy-100 bg-white px-3 py-2.5 text-navy-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:bg-navy-50"
          placeholder="••••••••"
        />
      </div>

      <div aria-live="polite" role="status">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-base font-semibold text-white transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-navy-100 disabled:text-navy-900/40"
      >
        {pending ? (
          <>
            <Spinner className="h-4 w-4" />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  )
}
