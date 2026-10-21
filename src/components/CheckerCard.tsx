'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { StatusIcon } from '@/components/StatusIcon'
import {
  formatPhoneInput,
  toNationalDigits,
  validateUsPhone,
  PHONE_ERROR_MESSAGES,
} from '@/lib/phone'
import type { CheckStatus } from '@/lib/types'

type CheckResponse = {
  status?: CheckStatus
  message?: string
  phone?: string
  checkedAt?: string
  error?: string
}

type Result = {
  status: CheckStatus
  headline: string
  message: string
  phone: string
  checkedAt: Date
}

const HEADLINES: Record<CheckStatus, string> = {
  PASS: 'PASS — Clear to transfer',
  FAIL: 'FAIL — Do not transfer',
  INVALID: 'INVALID — Check the number',
  ERROR: "Couldn't verify — try again",
}

const BANNER_STYLES: Record<CheckStatus, string> = {
  PASS: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  FAIL: 'border-red-300 bg-red-50 text-red-900',
  INVALID: 'border-amber-300 bg-amber-50 text-amber-900',
  ERROR: 'border-navy-100 bg-navy-50 text-navy-900',
}

const ICON_STYLES: Record<CheckStatus, string> = {
  PASS: 'text-emerald-600',
  FAIL: 'text-red-600',
  INVALID: 'text-amber-600',
  ERROR: 'text-navy-900/50',
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

/**
 * Progressive validation while typing: surface a structural problem the moment
 * it is knowable, but do not nag about length until all 10 digits are in.
 */
function liveErrorFor(digits: string): string | null {
  if (digits.length === 0) return null

  if (digits[0] === '0') return PHONE_ERROR_MESSAGES.AREA_CODE_LEADING
  // A leading "1" may be a country code the agent is still typing out, so hold
  // the complaint until all 10 digits are in and full validation runs below.
  if (digits[0] === '1') {
    return digits.length === 10 ? PHONE_ERROR_MESSAGES.AREA_CODE_LEADING : null
  }
  if (digits.length >= 3 && digits[1] === '1' && digits[2] === '1') {
    return PHONE_ERROR_MESSAGES.AREA_CODE_N11
  }
  if (digits.length >= 4 && (digits[3] === '0' || digits[3] === '1')) {
    return PHONE_ERROR_MESSAGES.EXCHANGE_LEADING
  }
  if (digits.length === 10) {
    const result = validateUsPhone(digits)
    if (!result.valid) return result.message
  }
  return null
}

export function CheckerCard() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const digits = useMemo(() => toNationalDigits(value), [value])
  const validation = useMemo(() => validateUsPhone(digits), [digits])
  const liveError = useMemo(() => liveErrorFor(digits), [digits])
  const shownError = liveError ?? submitError
  const canSubmit = validation.valid && !pending

  const focusInput = useCallback((select = false) => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (select) input.select()
  }, [])

  useEffect(() => {
    focusInput()
  }, [focusInput])

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    setValue(formatPhoneInput(event.target.value))
    setSubmitError(null)
    setRequestError(null)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    if (!validation.valid) {
      setSubmitError(validation.message)
      focusInput()
      return
    }

    const phone = validation.formatted

    setPending(true)
    setSubmitError(null)
    setRequestError(null)
    setResult(null)

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: validation.digits }),
      })

      if (response.status === 401) {
        router.replace('/login')
        router.refresh()
        return
      }

      const data = (await response.json().catch(() => null)) as CheckResponse | null

      if (data?.status) {
        const checkedAt = data.checkedAt ? new Date(data.checkedAt) : new Date()
        setResult({
          status: data.status,
          headline: HEADLINES[data.status],
          message: data.message ?? '',
          phone: data.phone ?? phone,
          checkedAt,
        })
      } else {
        setRequestError(data?.error ?? "Couldn't verify right now - do not transfer, try again")
      }
    } catch {
      setRequestError('Network problem - do not transfer. Check your connection and try again.')
    } finally {
      setPending(false)
      // Ready for the next call: focused and selected so typing replaces it.
      focusInput(true)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-card sm:p-7">
        <h1 className="text-lg font-semibold tracking-tight text-navy-900">Check a number</h1>
        <p className="mt-1 text-sm text-navy-900/60">
          Confirm the number clears the buyer&apos;s suppression check before you transfer.
        </p>

        <form onSubmit={onSubmit} className="mt-5" noValidate>
          <label htmlFor="phone" className="block text-sm font-medium text-navy-900">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            ref={inputRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            value={value}
            onChange={onChange}
            disabled={pending}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? 'phone-error' : 'phone-hint'}
            placeholder="(704) 658-7404"
            className={`tabular mt-1.5 w-full rounded-xl border bg-white px-4 py-3.5 text-2xl font-semibold tracking-wide text-navy-900 placeholder:font-normal placeholder:text-navy-900/25 focus:outline-none focus:ring-2 disabled:bg-navy-50 ${
              shownError
                ? 'border-red-300 focus:border-red-400 focus:ring-red-500/25'
                : 'border-navy-100 focus:border-orange-500 focus:ring-orange-500/30'
            }`}
          />

          <div aria-live="polite" className="min-h-[1.5rem] pt-1.5">
            {shownError ? (
              <p id="phone-error" className="text-sm font-medium text-red-600">
                {shownError}
              </p>
            ) : (
              <p id="phone-hint" className="text-sm text-navy-900/45">
                US numbers only. Paste in any format.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl bg-orange-500 px-4 py-4 text-lg font-semibold text-white transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-navy-100 disabled:text-navy-900/40"
          >
            {pending ? (
              <>
                <Spinner className="h-5 w-5" />
                Checking…
              </>
            ) : (
              'Check Number'
            )}
          </button>
        </form>

        {requestError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-navy-100 bg-navy-50 px-4 py-3 text-sm font-medium text-navy-900"
          >
            {requestError}
          </p>
        ) : null}
      </section>

      <div aria-live="polite">
        {result ? (
          <section
            className={`rounded-2xl border-2 p-5 shadow-card sm:p-6 ${BANNER_STYLES[result.status]}`}
          >
            <div className="flex items-start gap-3.5">
              <span className={`mt-0.5 shrink-0 ${ICON_STYLES[result.status]}`}>
                <StatusIcon status={result.status} className="h-9 w-9" />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                  {result.headline}
                </p>
                <p className="mt-1 text-sm font-medium opacity-80">{result.message}</p>
                <p className="tabular mt-3 text-sm opacity-70">
                  <span className="font-semibold">{result.phone}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{formatTime(result.checkedAt)}</span>
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
